import nodemailer, { Transporter } from 'nodemailer';

interface SendMpinOtpOptions {
  toEmail: string;
  userName: string;
  otp: string;
  purpose: 'RESET_MPIN' | 'CHANGE_MPIN';
}

export interface SendWorkplaceInvitationOptions {
  toEmail: string;
  employeeName: string;
  workplaceName: string;
  workplaceCode?: string;
  adminName: string;
  address?: string;
  joinLink: string;
  playStoreUrl?: string;
}

class EmailService {
  private transporter: Transporter | null = null;

  constructor() {
    this.initTransporter();
  }

  private initTransporter() {
    const user = process.env.GMAIL_USER?.trim();
    const pass = process.env.GMAIL_PASSWORD?.trim();

    if (user && pass) {
      this.transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: { user, pass },
      });
    }
  }

  /**
   * Send a beautifully styled HTML email with the 6-digit MPIN OTP
   */
  async sendMpinOtpEmail({ toEmail, userName, otp, purpose }: SendMpinOtpOptions): Promise<boolean> {
    const actionText = purpose === 'RESET_MPIN' ? 'Reset Your MPIN' : 'Change Your MPIN';
    const actionDesc =
      purpose === 'RESET_MPIN'
        ? 'A request was received to reset your 4-digit security MPIN on Bizora.'
        : 'A request was received to change your 4-digit security MPIN on Bizora.';

    const appName = process.env.APP_NAME || 'Bizora';
    const sender = process.env.GMAIL_USER || 'security@bizora.app';

    // Guard: Never dispatch live emails to test/dummy domains or during automated tests
    const isTestEmail =
      process.env.NODE_ENV === 'test' ||
      toEmail.endsWith('.local') ||
      toEmail.endsWith('@test.com') ||
      toEmail.endsWith('.test') ||
      toEmail.endsWith('@example.com') ||
      toEmail.includes('test-suite');

    if (isTestEmail || !this.transporter) {
      console.log(`\n==================================================`);
      console.log(`[EMAIL SERVICE - DEV/TEST MOCK OTP]`);
      console.log(`To: ${toEmail} (${userName})`);
      console.log(`Purpose: ${actionText}`);
      console.log(`Code: >>> ${otp} <<<`);
      console.log(`Expires in: 10 minutes`);
      console.log(`==================================================\n`);
      return true;
    }

    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${actionText} - ${appName}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F5F6E8; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1B2210;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #F5F6E8; padding: 32px 16px;">
    <tr>
      <td align="center">
        <!-- Main Card Container -->
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 520px; background-color: #FFFFFF; border-radius: 20px; overflow: hidden; box-shadow: 0 4px 20px rgba(27, 34, 16, 0.08); border: 1px solid #E2E6D2;">
          
          <!-- Top Olive Brand Banner -->
          <tr>
            <td style="background-color: #5B692D; padding: 28px 24px; text-align: center;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" align="center">
                <tr>
                  <td style="background-color: #FFFFFF; border-radius: 12px; width: 44px; height: 44px; text-align: center; vertical-align: middle;">
                    <span style="font-size: 24px; font-weight: 800; color: #5B692D; line-height: 44px;">B</span>
                  </td>
                  <td style="padding-left: 14px; text-align: left;">
                    <div style="color: #FFFFFF; font-size: 20px; font-weight: 800; letter-spacing: -0.3px;">${appName}</div>
                    <div style="color: #EDF3DF; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">Security Verification</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body Content -->
          <tr>
            <td style="padding: 32px 28px;">
              <h1 style="margin: 0 0 12px 0; font-size: 22px; font-weight: 800; color: #1B2210; letter-spacing: -0.4px;">
                ${actionText}
              </h1>
              <p style="margin: 0 0 10px 0; font-size: 15px; color: #1B2210; line-height: 1.5;">
                Hello <strong>${userName || 'User'}</strong>,
              </p>
              <p style="margin: 0 0 18px 0; font-size: 14px; color: #556045; line-height: 1.5;">
                ${actionDesc} Use the 6-digit verification code below to confirm your identity and complete the reset.
              </p>

              <!-- Requester Account Details Card -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #F8FAF2; border: 1px solid #E2E6D5; border-radius: 12px; margin-bottom: 22px;">
                <tr>
                  <td style="padding: 14px 18px;">
                    <div style="font-size: 13px; color: #556045; line-height: 1.6;">
                      <span style="display: block; margin-bottom: 3px;"><strong>Requesting User:</strong> ${userName || 'Registered User'}</span>
                      <span style="display: block; margin-bottom: 3px;"><strong>Account Email:</strong> ${toEmail}</span>
                      <span style="display: block;"><strong>Action:</strong> ${actionText}</span>
                    </div>
                  </td>
                </tr>
              </table>

              <!-- OTP Code Display Box -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #F5F6E8; border: 2px dashed #5B692D; border-radius: 14px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 24px; text-align: center;">
                    <div style="font-size: 12px; font-weight: 700; color: #5B692D; text-transform: uppercase; letter-spacing: 1.2px; margin-bottom: 8px;">
                      Verification Code
                    </div>
                    <div style="font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #1B2210; font-family: 'Courier New', Courier, monospace;">
                      ${otp}
                    </div>
                    <div style="font-size: 12px; color: #6A755A; margin-top: 8px;">
                      ⏱ Expires in <strong>10 minutes</strong>
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Security Information Note -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #FDF9EB; border-left: 4px solid #8C6314; border-radius: 6px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 12px 16px;">
                    <p style="margin: 0; font-size: 12.5px; color: #5A420E; line-height: 1.45;">
                      <strong>Security Tip:</strong> Never share this 6-digit code with anyone. Bizora staff will never ask for your code or MPIN.
                    </p>
                  </td>
                </tr>
              </table>

              <p style="margin: 0; font-size: 12.5px; color: #9AA58B; line-height: 1.5;">
                If you did not request to ${purpose === 'RESET_MPIN' ? 'reset' : 'change'} your MPIN, someone may have access to your device. Please secure your account immediately.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #EFF2E3; padding: 18px 28px; text-align: center; border-top: 1px solid #E2E6D2;">
              <p style="margin: 0; font-size: 11.5px; color: #6A755A;">
                © 2026 ${appName}. Automated Security Notification.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    try {
      await this.transporter.sendMail({
        from: `"${appName} Security" <${sender}>`,
        to: toEmail,
        subject: `[${appName}] Your Security Code: ${otp}`,
        html: htmlContent,
      });
      console.log(`[EmailService] Sent OTP email to ${toEmail} for ${purpose}`);
      return true;
    } catch (error) {
      console.error(`[EmailService] Failed to send email to ${toEmail}:`, error);
      throw error;
    }
  }

  /**
   * Send an invitation email to an employee when added manually to a workplace.
   * Includes workplace info, join button, and link to download app if not installed.
   */
  async sendWorkplaceInvitationEmail(options: SendWorkplaceInvitationOptions): Promise<boolean> {
    const {
      toEmail,
      employeeName,
      workplaceName,
      workplaceCode,
      adminName,
      address,
      joinLink,
      playStoreUrl = 'https://play.google.com/store/apps/details?id=bizora.app',
    } = options;

    const appName = process.env.APP_NAME || 'Bizora';
    const sender = process.env.GMAIL_USER || 'no-reply@bizora.app';

    // Guard: Never dispatch live emails to test/dummy domains or during automated tests
    const isTestEmail =
      process.env.NODE_ENV === 'test' ||
      toEmail.endsWith('.local') ||
      toEmail.endsWith('@test.com') ||
      toEmail.endsWith('.test') ||
      toEmail.endsWith('@example.com') ||
      toEmail.includes('test-suite');

    if (isTestEmail || !this.transporter) {
      console.log(`\n==================================================`);
      console.log(`[EMAIL SERVICE - DEV/TEST WORKPLACE INVITATION]`);
      console.log(`To: ${toEmail} (${employeeName})`);
      console.log(`Workplace: ${workplaceName} (Code: ${workplaceCode || 'N/A'})`);
      console.log(`Invited by: ${adminName}`);
      console.log(`Join Link: ${joinLink}`);
      console.log(`Google Play Link: ${playStoreUrl}`);
      console.log(`==================================================\n`);
      return true;
    }

    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Join ${workplaceName} on ${appName}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F5F6E8; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1B2210;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #F5F6E8; padding: 32px 16px;">
    <tr>
      <td align="center">
        <!-- Main Card Container -->
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 540px; background-color: #FFFFFF; border-radius: 20px; overflow: hidden; box-shadow: 0 4px 20px rgba(27, 34, 16, 0.08); border: 1px solid #E2E6D2;">
          
          <!-- Top Olive Brand Banner -->
          <tr>
            <td style="background-color: #5B692D; padding: 28px 24px; text-align: center;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" align="center">
                <tr>
                  <td style="background-color: #FFFFFF; border-radius: 12px; width: 44px; height: 44px; text-align: center; vertical-align: middle;">
                    <span style="font-size: 24px; font-weight: 800; color: #5B692D; line-height: 44px;">B</span>
                  </td>
                  <td style="padding-left: 14px; text-align: left;">
                    <div style="color: #FFFFFF; font-size: 20px; font-weight: 800; letter-spacing: -0.3px;">${appName}</div>
                    <div style="color: #EDF3DF; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">Workplace Invitation</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body Content -->
          <tr>
            <td style="padding: 32px 28px;">
              <h1 style="margin: 0 0 10px 0; font-size: 22px; font-weight: 800; color: #1B2210; letter-spacing: -0.4px;">
                You&apos;ve Been Added to ${workplaceName}
              </h1>
              <p style="margin: 0 0 16px 0; font-size: 15px; color: #1B2210; line-height: 1.5;">
                Hello <strong>${employeeName || 'there'}</strong>,
              </p>
              <p style="margin: 0 0 22px 0; font-size: 14.5px; color: #556045; line-height: 1.55;">
                <strong>${adminName}</strong> has added you as a team member on <strong>${appName}</strong>. Since your admin already added you, <strong>no approval is needed</strong> — you can join directly!
              </p>

              <!-- Workplace Details Card -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #F8FAF2; border: 1px solid #E2E6D5; border-radius: 14px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 18px 20px;">
                    <div style="font-size: 13.5px; color: #3A452B; line-height: 1.7;">
                      <div><strong>🏢 Workplace:</strong> ${workplaceName}</div>
                      ${workplaceCode ? `<div><strong>🔑 Workplace Code:</strong> <span style="font-family: monospace; font-size: 14px; font-weight: 700; color: #5B692D; background-color: #EFF2E3; padding: 2px 6px; border-radius: 4px;">${workplaceCode}</span></div>` : ''}
                      <div><strong>👤 Added by:</strong> ${adminName}</div>
                      ${address ? `<div><strong>📍 Address:</strong> ${address}</div>` : ''}
                      <div><strong>✉️ Invited Email:</strong> ${toEmail}</div>
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Steps Guide -->
              <div style="background-color: #FAFBF5; border-radius: 12px; padding: 18px 20px; margin-bottom: 24px; border: 1px solid #EAEEDC;">
                <div style="font-size: 13px; font-weight: 700; color: #5B692D; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 12px;">
                  Quick Start (3 Simple Steps)
                </div>
                <div style="font-size: 13.5px; color: #465335; line-height: 1.6;">
                  <div style="margin-bottom: 8px;">
                    <strong>1. Get the App:</strong> If you don&apos;t have Bizora installed yet, download it from Google Play below.
                  </div>
                  <div style="margin-bottom: 8px;">
                    <strong>2. Sign In:</strong> Open Bizora and sign in with Google using <strong>${toEmail}</strong>.
                  </div>
                  <div>
                    <strong>3. Join Instantly:</strong> You&apos;ll see your invitation details — tap <strong>Join Workplace</strong> to enter immediately with no wait.
                  </div>
                </div>
              </div>

              <!-- CTA Buttons Section -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 24px;">
                <tr>
                  <td align="center" style="padding-bottom: 12px;">
                    <a href="${joinLink}" style="display: block; width: 85%; max-width: 320px; background-color: #5B692D; color: #FFFFFF; text-decoration: none; font-size: 15px; font-weight: 700; padding: 14px 24px; border-radius: 12px; text-align: center; box-shadow: 0 4px 12px rgba(91, 105, 45, 0.3);">
                      👉 Join ${workplaceName}
                    </a>
                  </td>
                </tr>
                <tr>
                  <td align="center">
                    <a href="${playStoreUrl}" style="display: block; width: 85%; max-width: 320px; background-color: #1B2210; color: #FFFFFF; text-decoration: none; font-size: 13.5px; font-weight: 600; padding: 12px 20px; border-radius: 12px; text-align: center;">
                      📱 Download on Google Play
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Fallback Direct URL -->
              <p style="margin: 0; font-size: 12px; color: #7A866A; line-height: 1.5; text-align: center; word-break: break-all;">
                Having trouble with the button? Copy and paste this link in your browser:<br>
                <a href="${joinLink}" style="color: #5B692D; text-decoration: underline;">${joinLink}</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #EFF2E3; padding: 18px 28px; text-align: center; border-top: 1px solid #E2E6D2;">
              <p style="margin: 0; font-size: 11.5px; color: #6A755A;">
                © 2026 ${appName}. Automated Attendance System.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    try {
      await this.transporter.sendMail({
        from: `"${appName}" <${sender}>`,
        to: toEmail,
        subject: `[${appName}] You've been invited to join ${workplaceName}`,
        html: htmlContent,
      });
      console.log(`[EmailService] Sent workplace invitation email to ${toEmail} for ${workplaceName}`);
      return true;
    } catch (error) {
      console.error(`[EmailService] Failed to send workplace invitation email to ${toEmail}:`, error);
      throw error;
    }
  }
}

export const emailService = new EmailService();
