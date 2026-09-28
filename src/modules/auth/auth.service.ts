import { OAuth2Client } from 'google-auth-library';
import { UserModel, IUser } from './user.model';
import { WorkplaceMemberModel } from '../employee/workplace-member.model';
import { WorkplaceModel } from '../workplace/workplace.model';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../../utils/jwt';
import { verifyPin } from '../../utils/crypto';
import { AppError } from '../../middleware/errorHandler';
import { googleClientIds, env } from '../../config/env';

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

    // Verify Google ID token
    if (devMockProfile && env.NODE_ENV !== 'production') {
      googleSub = devMockProfile.googleSub;
      email = devMockProfile.email.toLowerCase();
      name = devMockProfile.name;
    } else {
      try {
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
      } catch (err: any) {
        if (env.NODE_ENV !== 'production' && devMockProfile) {
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
        status: 'ACTIVE',
        tokenVersion: 1,
        expoPushToken,
      });
    } else {
      if (expoPushToken) user.expoPushToken = expoPushToken;
      if (name && !user.name) user.name = name;
      await user.save();
    }

    // Auto-bind any pending workplace memberships for this verified email
    if (email) {
      await WorkplaceMemberModel.updateMany(
        { invitedEmail: email, userId: { $exists: false }, status: 'INVITED' },
        { $set: { userId: user._id } }
      );
    }

    return this.buildAuthSession(user);
  }

  /**
   * Authenticate employee with Workplace ID + Employee Code + PIN
   */
  async loginWithPin(workplaceId: string, employeeCode: string, pin: string, expoPushToken?: string) {
    const workplace = await WorkplaceModel.findById(workplaceId);
    if (!workplace || workplace.status !== 'ACTIVE') {
      throw new AppError('Workplace not found or inactive', 404, 'WORKPLACE_NOT_FOUND');
    }

    const member = await WorkplaceMemberModel.findOne({
      workplaceId: workplace._id,
      employeeCode: employeeCode.trim().toUpperCase(),
    });

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
        status: 'ACTIVE',
        tokenVersion: 1,
        expoPushToken,
      });
      member.userId = user._id;
      member.status = 'ACTIVE';
      member.joinedAt = member.joinedAt || new Date();
      await member.save();
    } else if (expoPushToken) {
      user.expoPushToken = expoPushToken;
      await user.save();
    }

    return this.buildAuthSession(user, member.workplaceId.toString(), member.role);
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

    return { accessToken };
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
      $or: [{ userId: user._id }, { invitedEmail: user.email }],
      status: { $in: ['ACTIVE', 'INVITED'] },
    }).populate('workplaceId', 'name timezone address wifiSsid status');

    return {
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        phone: user.phone,
        status: user.status,
      },
      memberships: memberships.map((m: any) => ({
        id: m._id.toString(),
        workplaceId: m.workplaceId?._id?.toString() || m.workplaceId?.toString(),
        workplaceName: m.workplaceId?.name || 'Workplace',
        timezone: m.workplaceId?.timezone || 'Asia/Kolkata',
        role: m.role,
        employeeCode: m.employeeCode,
        status: m.status,
      })),
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
