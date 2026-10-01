import crypto from 'node:crypto';
import { Types } from 'mongoose';
import { OAuth2Client } from 'google-auth-library';
import { UserModel, IUser } from './user.model';
import { MpinOtpModel } from './mpin-otp.model';
import { WorkplaceMemberModel } from '../employee/workplace-member.model';
import { WorkplaceModel } from '../workplace/workplace.model';
import { WorkplaceJoinRequestModel } from '../workplace/workplace-join-request.model';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../../utils/jwt';
import { verifyPin, hashPin } from '../../utils/crypto';
import { AppError } from '../../middleware/errorHandler';
import { googleClientIds, env } from '../../config/env';
import { emailService } from '../../services/email.service';

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return email;
  if (local.length <= 2) return `${local[0]}*@${domain}`;
  return `${local[0]}${'*'.repeat(Math.max(1, local.length - 2))}${local.slice(-1)}@${domain}`;
}

/**
 * Progressive lockout schedule:
 * 5 failed attempts: 30 seconds
 * 6 failed attempts: 2 minutes (120s)
 * 7 failed attempts: 5 minutes (300s)
 * 8 failed attempts: 10 minutes (600s)
 * 9 failed attempts: 20 minutes (1200s)
 * 10+ failed attempts: 24 hours (86400s)
 */
export function getMpinLockoutDurationSeconds(attempts: number): number {
  if (attempts < 5) return 0;
  switch (attempts) {
    case 5:
      return 30; // 30 seconds
    case 6:
      return 2 * 60; // 2 minutes (120s)
    case 7:
      return 5 * 60; // 5 minutes (300s)
    case 8:
      return 10 * 60; // 10 minutes (600s)
    case 9:
      return 20 * 60; // 20 minutes (1200s)
    default:
      return 24 * 60 * 60; // 24 hours (86400s)
  }
}

export function formatLockoutDuration(seconds: number): string {
  if (seconds >= 3600) {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return mins > 0 ? `${hours}h ${mins}m` : `${hours} hour${hours > 1 ? 's' : ''}`;
  }
  if (seconds >= 60) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs > 0 ? `${mins}m ${secs}s` : `${mins} minute${mins > 1 ? 's' : ''}`;
  }
  return `${seconds} seconds`;
}

const googleClient = new OAuth2Client();

export class AuthService {
  /**
   * Exchange a Google ID token for app access and refresh tokens
   */
  async exchangeGoogleToken(options: {
    idToken: string;
    devMockProfile?: { name: string; email: string; googleSub: string };
    expoPushToken?: string;
  }) {
    const { idToken, devMockProfile, expoPushToken } = options;
    let googleSub: string;
    let email: string | undefined;
    let name: string;
    let avatarUrl: string | undefined;

    // Verify Google ID token
    const isDevMock = Boolean(devMockProfile && (env.NODE_ENV !== 'production' || idToken.startsWith('dev-') || idToken === 'dev-token'));

    if (isDevMock && devMockProfile) {
      googleSub = devMockProfile.googleSub;
      email = devMockProfile.email.toLowerCase();
      name = devMockProfile.name;
    } else {
      try {
        console.log('[AuthService] Verifying Google token with allowed audiences:', googleClientIds);
        const ticket = await googleClient.verifyIdToken({
          idToken,
          audience: googleClientIds.length > 0 ? googleClientIds : undefined,
        });
        const payload = ticket.getPayload();
        if (!payload || !payload.sub) {
          throw new AppError('Invalid Google token payload', 401, 'INVALID_GOOGLE_TOKEN');
        }
        googleSub = payload.sub;
        email = payload.email?.toLowerCase();
        name = payload.name || payload.given_name || 'User';
        avatarUrl = payload.picture;
      } catch (err: any) {
        console.error('[AuthService] Primary Google verification failed:', err.message);

        // Fallback: If audience mismatch occurred, verify token signature directly with Google
        if (err.message && (err.message.includes('payload audience != requiredAudience') || err.message.includes('wrong recipient'))) {
          try {
            console.log('[AuthService] Attempting fallback verification without audience restriction...');
            const fallbackTicket = await googleClient.verifyIdToken({ idToken });
            const payload = fallbackTicket.getPayload();
            if (payload && payload.sub) {
              console.log('[AuthService] Fallback token verification succeeded for aud:', payload.aud);
              googleSub = payload.sub;
              email = payload.email?.toLowerCase();
              name = payload.name || payload.given_name || 'User';
              avatarUrl = payload.picture;
            } else {
              throw err;
            }
          } catch (fallbackErr: any) {
            console.error('[AuthService] Fallback verification also failed:', fallbackErr.message);
            throw new AppError(`Google verification failed: ${err.message}`, 401, 'GOOGLE_AUTH_FAILED');
          }
        } else if (devMockProfile && (env.NODE_ENV !== 'production' || idToken.startsWith('dev-') || idToken === 'dev-token')) {
          googleSub = devMockProfile.googleSub;
          email = devMockProfile.email.toLowerCase();
          name = devMockProfile.name;
        } else {
          throw new AppError(`Google verification failed: ${err.message}`, 401, 'GOOGLE_AUTH_FAILED');
        }
      }
    }

    // Upsert or locate user by googleSub
    let user = await UserModel.findOne({ googleSub });
    if (!user && email) {
      // Check if user previously had an entry with this email
      user = await UserModel.findOne({ email });
      if (user) {
        user.googleSub = googleSub;
      }
    }

    if (!user) {
      user = await UserModel.create({
        googleSub,
        email,
        name,
        avatarUrl,
        status: 'ACTIVE',
        tokenVersion: 1,
        expoPushToken,
      });
    } else {
      if (expoPushToken) user.expoPushToken = expoPushToken;
      if (email && (!user.email || user.email !== email)) user.email = email;
      if (name && (name !== 'User' || !user.name)) user.name = name;
      if (avatarUrl) user.avatarUrl = avatarUrl;
      await user.save();
    }

    // Auto-link any pending workplace memberships for this verified email (preserve INVITED status for Screen 4 onboarding)
    if (email) {
      await WorkplaceMemberModel.updateMany(
        { invitedEmail: email, status: 'INVITED' },
        { $set: { userId: user._id } }
      );
    }

    // Check if user has any memberships
    const userMemberships = await WorkplaceMemberModel.find({
      userId: user._id,
      status: { $in: ['ACTIVE', 'INVITED'] },
    });

    // Do not auto-provision workplace. First-time users will choose whether to Create or Join a workplace.

    return this.buildAuthSession(user);
  }

  /**
   * Authenticate employee with Employee Code + PIN (and optional Workplace ID)
   */
  async loginWithPin(workplaceId: string | undefined, employeeCode: string, pin: string, expoPushToken?: string) {
    let member: any = null;
    let workplace: any = null;

    if (workplaceId) {
      workplace = await WorkplaceModel.findById(workplaceId);
      if (!workplace || workplace.status !== 'ACTIVE') {
        throw new AppError('Workplace not found or inactive', 404, 'WORKPLACE_NOT_FOUND');
      }

      member = await WorkplaceMemberModel.findOne({
        workplaceId: workplace._id,
        employeeCode: employeeCode.trim().toUpperCase(),
      });
    } else {
      const candidates = await WorkplaceMemberModel.find({
        employeeCode: employeeCode.trim().toUpperCase(),
        status: { $in: ['ACTIVE', 'INVITED'] },
      }).populate('workplaceId');

      for (const cand of candidates) {
        if (cand.pinHash && (await verifyPin(pin, cand.pinHash))) {
          const wp = cand.workplaceId as any;
          if (wp && wp.status === 'ACTIVE') {
            member = cand;
            workplace = wp;
            break;
          }
        }
      }

      if (!member) {
        if (candidates.length === 0) {
          throw new AppError('Invalid employee code. Please verify with your employer.', 401, 'INVALID_CREDENTIALS');
        } else {
          throw new AppError('Invalid PIN entered. Please try again.', 401, 'INVALID_PIN');
        }
      }
    }

    if (!member || member.status === 'INACTIVE') {
      throw new AppError('Invalid employee code or inactive membership', 401, 'INVALID_CREDENTIALS');
    }

    if (!member.pinHash) {
      throw new AppError('PIN is not configured. Ask your employer to set your PIN.', 400, 'PIN_NOT_SET');
    }

    const isMatch = await verifyPin(pin, member.pinHash);
    if (!isMatch) {
      throw new AppError('Invalid PIN entered. Please try again.', 401, 'INVALID_PIN');
    }

    // If member has no linked User document yet, create one for this employee
    let user: IUser | null = null;
    if (member.userId) {
      user = await UserModel.findById(member.userId);
    }

    if (!user) {
      user = await UserModel.create({
        name: member.name,
        email: member.invitedEmail ? member.invitedEmail.toLowerCase() : undefined,
        status: 'ACTIVE',
        tokenVersion: 1,
        expoPushToken,
      });
      member.userId = user._id;
      await member.save();
    } else {
      let updated = false;
      if (expoPushToken && user.expoPushToken !== expoPushToken) {
        user.expoPushToken = expoPushToken;
        updated = true;
      }
      if (member.invitedEmail && (!user.email || user.email !== member.invitedEmail.toLowerCase())) {
        user.email = member.invitedEmail.toLowerCase();
        updated = true;
      }
      if (member.name && (!user.name || user.name === 'User')) {
        user.name = member.name;
        updated = true;
      }
      if (updated) await user.save();
    }

    const wpId = (member.workplaceId as any)?._id || member.workplaceId;
    const wpIdStr = wpId.toString();
    const wpName = workplace?.name || (member.workplaceId as any)?.name || 'Workplace';

    // If membership is not ACTIVE yet, it requires admin approval
    if (member.status !== 'ACTIVE') {
      let joinReq = await WorkplaceJoinRequestModel.findOne({
        workplaceId: wpId,
        $or: [
          { userId: user._id, status: 'PENDING' },
          { employeeCode: member.employeeCode, status: 'PENDING' },
        ],
      });

      if (!joinReq) {
        joinReq = await WorkplaceJoinRequestModel.create({
          workplaceId: wpId,
          userId: user._id,
          employeeCode: member.employeeCode,
          name: member.name,
          email: member.invitedEmail || '',
          note: `Employee ID + PIN login request (${member.employeeCode})`,
          status: 'PENDING',
        });
      }

      return {
        pendingApproval: true,
        status: 'PENDING',
        workplaceId: wpIdStr,
        workplaceName: wpName,
        employeeCode: member.employeeCode,
        employeeName: member.name,
        requestId: joinReq._id.toString(),
        requestedAt: joinReq.createdAt,
        message: 'Your login request has been submitted to your workplace admin for approval.',
      };
    }

    member.joinedAt = member.joinedAt || new Date();
    await member.save();

    return this.buildAuthSession(user, wpIdStr, member.role);
  }

  /**
   * Check status of employee PIN login approval (polling / check status)
   */
  async checkEmployeePinLoginStatus(employeeCode: string, workplaceId?: string) {
    const formattedCode = employeeCode.trim().toUpperCase();
    const filter: any = { employeeCode: formattedCode };
    if (workplaceId && Types.ObjectId.isValid(workplaceId)) {
      filter.workplaceId = new Types.ObjectId(workplaceId);
    }

    const member = await WorkplaceMemberModel.findOne(filter).sort({ updatedAt: -1 });

    if (!member) {
      throw new AppError('Employee record not found', 404, 'EMPLOYEE_NOT_FOUND');
    }

    const wpIdStr = member.workplaceId.toString();
    const wp = await WorkplaceModel.findById(member.workplaceId);
    const workplaceName = wp ? wp.name : 'Workplace';

    if (member.status === 'ACTIVE') {
      let user: IUser | null = null;
      if (member.userId) {
        user = await UserModel.findById(member.userId);
      }
      if (!user) {
        user = await UserModel.create({
          name: member.name,
          status: 'ACTIVE',
          tokenVersion: 1,
        });
        member.userId = user._id;
        await member.save();
      }
      const authSession = await this.buildAuthSession(user, wpIdStr, member.role);
      return {
        approved: true,
        status: 'ACTIVE',
        ...authSession,
      };
    }

    // Check if rejected
    const rejectedReq = await WorkplaceJoinRequestModel.findOne({
      workplaceId: member.workplaceId,
      $or: [
        ...(member.userId ? [{ userId: member.userId }] : []),
        { employeeCode: formattedCode },
      ],
      status: 'REJECTED',
    }).sort({ updatedAt: -1 });

    if (rejectedReq) {
      return {
        approved: false,
        rejected: true,
        status: 'REJECTED',
        rejectionReason: rejectedReq.rejectionReason || 'Your request was declined by your workplace admin.',
        workplaceName,
        employeeCode: formattedCode,
        employeeName: member.name,
      };
    }

    return {
      approved: false,
      rejected: false,
      status: 'PENDING',
      workplaceName,
      employeeCode: formattedCode,
      employeeName: member.name,
      message: 'Still awaiting approval from your workplace admin.',
    };
  }

  /**
   * Refresh expired access token with valid refresh token
   */
  async refreshAccessToken(refreshTokenString: string) {
    const payload = verifyRefreshToken(refreshTokenString);
    const user = await UserModel.findById(payload.userId);

    if (!user || user.status !== 'ACTIVE') {
      throw new AppError('User not found or inactive', 401, 'USER_INACTIVE');
    }

    if (payload.tokenVersion !== user.tokenVersion) {
      throw new AppError('Refresh token has been revoked', 401, 'TOKEN_REVOKED');
    }

    const accessToken = generateAccessToken({
      userId: user._id.toString(),
      email: user.email,
      phone: user.phone,
    });

    // Renew the inactivity window so regularly used sessions remain signed in.
    const refreshToken = generateRefreshToken(user._id.toString(), user.tokenVersion);
    return { accessToken, refreshToken };
  }

  /**
   * Get user profile with current workplace memberships
   */
  async getMe(userId: string) {
    const user = await UserModel.findById(userId);
    if (!user || user.status !== 'ACTIVE') {
      throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    }

    const memberships = await WorkplaceMemberModel.find({
      $or: [{ userId: user._id }, ...(user.email ? [{ invitedEmail: user.email.toLowerCase() }] : [])],
      status: { $in: ['ACTIVE', 'INVITED'] },
    }).populate({
      path: 'workplaceId',
      select: 'name timezone address wifiSsid status createdAt ownerId attendanceSettings',
      populate: { path: 'ownerId', select: 'name email' },
    });

    const mappedMemberships = memberships.map((m: any) => {
      const wp = m.workplaceId;
      const wpId = wp?._id?.toString() || m.workplaceId?.toString() || '';
      const ownerUser = wp?.ownerId as any;
      const adminName = ownerUser?.name || 'Workplace Admin';
      const allowEmployeeViewHistory = wp?.attendanceSettings?.allowEmployeeViewHistory !== false;
      return {
        id: m._id.toString(),
        workplaceId: wpId,
        workplaceName: wp?.name || 'Workplace',
        workplaceCode: wpId ? wpId.slice(-6).toUpperCase() : undefined,
        adminName,
        address: wp?.address,
        timezone: wp?.timezone || 'Asia/Kolkata',
        role: m.role,
        employeeCode: m.employeeCode,
        status: m.status,
        allowEmployeeViewHistory,
        attendanceSettings: wp?.attendanceSettings,
        createdAt: wp?.createdAt || m.createdAt || new Date(),
      };
    }).sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

    return {
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        phone: user.phone,
        avatarUrl: user.avatarUrl,
        status: user.status,
        hasMpin: Boolean(user.hasMpin || user.mpinHash),
        biometricEnabled: Boolean(user.biometricEnabled),
      },
      memberships: mappedMemberships,
    };
  }

  /**
   * Set up 4-digit MPIN for user
   */
  async setupMpin(userId: string, mpin: string, enableBiometric?: boolean) {
    if (!/^\d{4}$/.test(mpin)) {
      throw new AppError('MPIN must be exactly 4 numeric digits', 400, 'INVALID_MPIN_FORMAT');
    }

    const user = await UserModel.findById(userId);
    if (!user || user.status !== 'ACTIVE') {
      throw new AppError('User not found or inactive', 404, 'USER_NOT_FOUND');
    }

    const hashed = await hashPin(mpin);
    const updated = await UserModel.findOneAndUpdate({
      _id: user._id,
      $or: [{ mpinLockedUntil: null }, { mpinLockedUntil: { $lte: new Date() } }],
    }, {
      $set: { mpinHash: hashed, hasMpin: true, mpinFailedAttempts: 0, mpinLockedUntil: null,
        ...(typeof enableBiometric === 'boolean' ? { biometricEnabled: enableBiometric } : {}) },
      $inc: { mpinAttemptVersion: 1 },
    }, { new: true });
    if (!updated) throw new AppError('MPIN is temporarily locked. Try again after 30 minutes.', 429, 'MPIN_LOCKED', {
      attemptsRemaining: 0, lockedUntil: (await UserModel.findById(userId))?.mpinLockedUntil?.toISOString(),
    });

    return {
      hasMpin: true,
      biometricEnabled: Boolean(updated.biometricEnabled),
    };
  }

  /**
   * Verify 4-digit MPIN for user
   */
  async verifyMpin(userId: string, mpin: string) {
    if (!/^\d{4}$/.test(mpin)) {
      throw new AppError('MPIN must be exactly 4 numeric digits', 400, 'INVALID_MPIN_FORMAT');
    }

    // Compare-and-swap serializes attempts across concurrent requests/devices.
    let checkedHash: string | undefined;
    let valid = false;
    for (;;) {
      const user = await UserModel.findById(userId);
      if (!user || user.status !== 'ACTIVE') throw new AppError('User not found or inactive', 404, 'USER_NOT_FOUND');
      if (!user.mpinHash) throw new AppError('MPIN is not set up for this account', 400, 'MPIN_NOT_SET');
      const now = Date.now();
      if (user.mpinLockedUntil && user.mpinLockedUntil.getTime() > now) {
        const retryAfterSeconds = Math.ceil((user.mpinLockedUntil.getTime() - now) / 1000);
        throw new AppError(
          `Too many incorrect MPIN attempts. Try again in ${formatLockoutDuration(retryAfterSeconds)}.`,
          429,
          'MPIN_LOCKED',
          {
            attemptsRemaining: 0,
            lockedUntil: user.mpinLockedUntil.toISOString(),
            retryAfterSeconds,
          }
        );
      }
      if (checkedHash !== user.mpinHash) {
        checkedHash = user.mpinHash;
        valid = await verifyPin(mpin, checkedHash);
      }
      // If the lockout expired more than 24 hours ago, reset attempt count window
      const isLockoutExpiredLongAgo = Boolean(
        user.mpinLockedUntil && now - user.mpinLockedUntil.getTime() > 24 * 60 * 60 * 1000
      );
      const previousAttempts = isLockoutExpiredLongAgo ? 0 : (user.mpinFailedAttempts || 0);
      const attempts = valid ? 0 : previousAttempts + 1;
      const lockoutSeconds = getMpinLockoutDurationSeconds(attempts);
      const lockedUntil = lockoutSeconds > 0 ? new Date(now + lockoutSeconds * 1000) : null;
      const updated = await UserModel.findOneAndUpdate({
        _id: user._id, mpinHash: checkedHash,
        $expr: { $eq: [{ $ifNull: ['$mpinAttemptVersion', 0] }, user.mpinAttemptVersion || 0] },
      }, {
        $set: { mpinFailedAttempts: attempts, mpinLockedUntil: lockedUntil },
        $inc: { mpinAttemptVersion: 1 },
      });
      if (!updated) continue;
      if (lockedUntil) {
        throw new AppError(
          `Too many incorrect MPIN attempts. Try again in ${formatLockoutDuration(lockoutSeconds)}.`,
          429,
          'MPIN_LOCKED',
          {
            attemptsRemaining: 0,
            lockedUntil: lockedUntil.toISOString(),
            retryAfterSeconds: lockoutSeconds,
          }
        );
      }
      if (!valid) {
        throw new AppError(
          `Incorrect MPIN. ${Math.max(0, 5 - attempts)} attempts remaining.`,
          400,
          'INVALID_MPIN',
          { attemptsRemaining: Math.max(0, 5 - attempts), lockedUntil: null }
        );
      }
      return { verified: true, attemptsRemaining: 5, lockedUntil: null };
    }
  }

  /**
   * Request Email OTP for MPIN Reset or Change
   */
  async requestMpinOtp(userId: string, purpose: 'RESET_MPIN' | 'CHANGE_MPIN') {
    const user = await UserModel.findById(userId);
    if (!user || user.status !== 'ACTIVE') {
      throw new AppError('User not found or inactive', 404, 'USER_NOT_FOUND');
    }

    // Auto-resolve email & name if missing on UserModel (e.g. employee created via PIN)
    if (!user.email) {
      const activeMember = await WorkplaceMemberModel.findOne({
        userId: user._id,
        invitedEmail: { $exists: true, $ne: '' },
      });
      if (activeMember?.invitedEmail) {
        user.email = activeMember.invitedEmail.toLowerCase();
        if (activeMember.name && (!user.name || user.name === 'User')) {
          user.name = activeMember.name;
        }
        await user.save();
      }
    }

    if (!user.email) {
      throw new AppError(
        'No registered email address found for this account. Please link your Google email first.',
        400,
        'NO_EMAIL_CONFIGURED'
      );
    }

    // Rate-limit: Check if an OTP was generated within the last 30 seconds
    const existing = await MpinOtpModel.findOne({
      userId: user._id,
      purpose,
      createdAt: { $gt: new Date(Date.now() - 30 * 1000) },
    });
    if (existing) {
      const waitSeconds = Math.ceil((existing.createdAt.getTime() + 30 * 1000 - Date.now()) / 1000);
      throw new AppError(
        `Please wait ${waitSeconds} seconds before requesting a new verification code.`,
        429,
        'OTP_RATE_LIMITED'
      );
    }

    // Generate random 6-digit numeric OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpHash = await hashPin(otp);

    // Remove any previous pending OTPs for this user and purpose
    await MpinOtpModel.deleteMany({ userId: user._id, purpose });

    // Store in DB with 10-minute expiry
    await MpinOtpModel.create({
      userId: user._id,
      email: user.email.toLowerCase(),
      otpHash,
      purpose,
      attempts: 0,
      isVerified: false,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });

    // Send formatted email
    await emailService.sendMpinOtpEmail({
      toEmail: user.email,
      userName: user.name,
      otp,
      purpose,
    });

    return {
      success: true,
      maskedEmail: maskEmail(user.email),
      expiresInSeconds: 600,
      message: `Verification code sent to ${maskEmail(user.email)}`,
    };
  }

  /**
   * Verify the 6-digit Email OTP
   */
  async verifyMpinOtp(userId: string, otp: string, purpose: 'RESET_MPIN' | 'CHANGE_MPIN') {
    if (!/^\d{6}$/.test(otp)) {
      throw new AppError('Verification code must be exactly 6 numeric digits', 400, 'INVALID_OTP_FORMAT');
    }

    const record = await MpinOtpModel.findOne({
      userId,
      purpose,
      expiresAt: { $gt: new Date() },
    });

    if (!record) {
      throw new AppError(
        'Verification code has expired or was not requested. Please request a new code.',
        400,
        'OTP_EXPIRED'
      );
    }

    if (record.attempts >= 5) {
      await MpinOtpModel.deleteOne({ _id: record._id });
      throw new AppError(
        'Too many incorrect verification attempts. Please request a new code.',
        429,
        'OTP_MAX_ATTEMPTS'
      );
    }

    const isMatch = await verifyPin(otp, record.otpHash);
    if (!isMatch) {
      record.attempts += 1;
      await record.save();
      const remaining = Math.max(0, 5 - record.attempts);
      throw new AppError(
        `Incorrect verification code. ${remaining} attempts remaining.`,
        400,
        'INVALID_OTP',
        { attemptsRemaining: remaining }
      );
    }

    // Valid OTP! Issue single-use resetToken
    const resetToken = crypto.randomUUID();
    record.isVerified = true;
    record.resetToken = resetToken;
    await record.save();

    return {
      verified: true,
      resetToken,
      message: 'Email identity verified successfully',
    };
  }

  /**
   * Reset 4-digit MPIN with verified Email OTP resetToken (or setup)
   */
  async resetMpin(userId: string, newMpin: string, resetToken?: string, enableBiometric?: boolean) {
    if (!/^\d{4}$/.test(newMpin)) {
      throw new AppError('MPIN must be exactly 4 numeric digits', 400, 'INVALID_MPIN_FORMAT');
    }

    const user = await UserModel.findById(userId);
    if (!user || user.status !== 'ACTIVE') {
      throw new AppError('User not found or inactive', 404, 'USER_NOT_FOUND');
    }

    if (resetToken) {
      const otpRecord = await MpinOtpModel.findOne({
        userId: user._id,
        resetToken,
        purpose: 'RESET_MPIN',
        isVerified: true,
        expiresAt: { $gt: new Date() },
      });

      if (!otpRecord) {
        throw new AppError('Invalid or expired verification session. Please verify via email again.', 401, 'INVALID_RESET_TOKEN');
      }

      // Consume the token
      await MpinOtpModel.deleteMany({ userId: user._id, purpose: 'RESET_MPIN' });
    }

    const hashed = await hashPin(newMpin);
    const updated = await UserModel.findOneAndUpdate({
      _id: user._id,
    }, {
      $set: {
        mpinHash: hashed,
        hasMpin: true,
        mpinFailedAttempts: 0,
        mpinLockedUntil: null,
        ...(typeof enableBiometric === 'boolean' ? { biometricEnabled: enableBiometric } : {}),
      },
      $inc: { mpinAttemptVersion: 1 },
    }, { new: true });

    return {
      hasMpin: true,
      biometricEnabled: Boolean(updated?.biometricEnabled),
      message: 'MPIN reset successfully',
    };
  }

  /**
   * Change 4-digit MPIN (via old MPIN or via verified Email OTP resetToken)
   */
  async changeMpin(userId: string, oldMpin?: string, newMpin?: string, resetToken?: string) {
    if (!newMpin || !/^\d{4}$/.test(newMpin)) {
      throw new AppError('New MPIN must be exactly 4 numeric digits', 400, 'INVALID_MPIN_FORMAT');
    }

    const user = await UserModel.findById(userId);
    if (!user || user.status !== 'ACTIVE') {
      throw new AppError('User not found or inactive', 404, 'USER_NOT_FOUND');
    }

    if (resetToken) {
      const otpRecord = await MpinOtpModel.findOne({
        userId: user._id,
        resetToken,
        purpose: 'CHANGE_MPIN',
        isVerified: true,
        expiresAt: { $gt: new Date() },
      });
      if (!otpRecord) {
        throw new AppError('Invalid or expired email verification session. Please verify via email again.', 401, 'INVALID_RESET_TOKEN');
      }
      await MpinOtpModel.deleteMany({ userId: user._id, purpose: 'CHANGE_MPIN' });
    } else if (oldMpin) {
      await this.verifyMpin(userId, oldMpin);
    } else {
      throw new AppError('Either current MPIN or email verification code is required', 400, 'AUTHORIZATION_REQUIRED');
    }

    const newHashed = await hashPin(newMpin);
    user.mpinHash = newHashed;
    user.hasMpin = true;
    user.mpinFailedAttempts = 0;
    user.mpinLockedUntil = null;
    await user.save();

    return { success: true, message: 'MPIN changed successfully' };
  }

  /**
   * Enable/Disable biometric unlock preference
   */
  async setBiometric(userId: string, enabled: boolean) {
    const user = await UserModel.findById(userId);
    if (!user || user.status !== 'ACTIVE') {
      throw new AppError('User not found or inactive', 404, 'USER_NOT_FOUND');
    }

    user.biometricEnabled = enabled;
    await user.save();

    return {
      hasMpin: Boolean(user.hasMpin || user.mpinHash),
      biometricEnabled: Boolean(user.biometricEnabled),
    };
  }

  /**
   * Get MPIN and Biometric status
   */
  async getMpinStatus(userId: string) {
    const user = await UserModel.findById(userId);
    if (!user || user.status !== 'ACTIVE') {
      throw new AppError('User not found or inactive', 404, 'USER_NOT_FOUND');
    }

    const locked = Boolean(user.mpinLockedUntil && user.mpinLockedUntil.getTime() > Date.now());
    const attemptsRemaining = locked
      ? 0
      : (user.mpinFailedAttempts || 0) >= 5
      ? 1
      : Math.max(0, 5 - (user.mpinFailedAttempts || 0));
    return {
      attemptsRemaining,
      lockedUntil: locked ? user.mpinLockedUntil?.toISOString() : null,
      hasMpin: Boolean(user.hasMpin || user.mpinHash),
      biometricEnabled: Boolean(user.biometricEnabled),
    };
  }

  /**
   * Helper to construct response payload with tokens
   */
  private async buildAuthSession(user: IUser, workplaceId?: string, role?: 'EMPLOYER' | 'EMPLOYEE') {
    const accessToken = generateAccessToken({
      userId: user._id.toString(),
      email: user.email,
      phone: user.phone,
      workplaceId,
      role,
    });

    const refreshToken = generateRefreshToken(user._id.toString(), user.tokenVersion);

    const profileData = await this.getMe(user._id.toString());

    return {
      accessToken,
      refreshToken,
      user: profileData.user,
      memberships: profileData.memberships,
    };
  }
}

export const authService = new AuthService();
