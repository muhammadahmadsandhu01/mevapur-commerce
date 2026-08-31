const nodemailer = require('nodemailer');
const logger = require('../common/utils/logger');
const config = require('../config/email.config');

class EmailService {
  constructor() {
    this.transporter = null;
  }

  /**
   * Escape HTML to prevent injection
   */
  escapeHtml(str) {
    if (typeof str !== 'string') return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Get SMTP transporter singleton
   */
  getTransporter() {
    if (config.mode !== 'smtp') {
      return null;
    }
    if (this.transporter) {
      return this.transporter;
    }

    const smtpConfig = config.smtp;
    if (!smtpConfig) {
      throw new Error('EMAIL_SMTP_CONFIGURATION_FAILED');
    }

    const options = {
      host: smtpConfig.host,
      port: smtpConfig.port,
      secure: smtpConfig.secure,
      auth: {
        user: smtpConfig.auth.user,
        pass: smtpConfig.auth.pass
      },
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 10000,
      tls: {}
    };

    if (smtpConfig.port === 587) {
      options.requireTLS = true;
    }

    this.transporter = nodemailer.createTransport(options);
    return this.transporter;
  }

  /**
   * Send Verification Email
   */
  async sendVerificationEmail(email, fullName, token) {
    const verificationLink = `${config.frontendUrl}/verify-email?token=${token}`;
    const safeLink = this.escapeHtml(verificationLink);
    const safeName = this.escapeHtml(fullName);

    const emailData = {
      to: email,
      subject: 'Verify Your Email - MevaPur',
      html: `<p>Hello ${safeName},</p><p>Please verify your email by clicking <a href="${safeLink}">here</a>.</p>`,
      text: `Hello ${fullName},\n\nPlease verify your email by opening this link: ${verificationLink}`
    };

    await this.send(emailData);
  }

  /**
   * Send Password Reset Email
   */
  async sendPasswordResetEmail(email, fullName, token, options = {}) {
    const audience = options.audience || 'storefront';
    if (!['admin', 'storefront'].includes(audience)) {
      throw new Error(`Invalid audience for password reset: ${audience}`);
    }
    const { getRuntimeConfig } = require('../config/runtime.config');
    const runtimeConfig = getRuntimeConfig();

    let origin;
    if (audience === 'admin') {
      origin = runtimeConfig.origins.admin;
    } else {
      origin = runtimeConfig.origins.storefront;
    }

    const resetUrl = new URL('/reset-password', origin);
    resetUrl.searchParams.set('token', token);
    const resetLink = resetUrl.toString();

    const safeFullName = this.escapeHtml(fullName);
    const safeResetLink = this.escapeHtml(resetLink);

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Reset Your Password - HARZAAR</title>
  <style>
    body { font-family: sans-serif; background-color: #f9f9f9; color: #333; margin: 0; padding: 20px; }
    .container { max-width: 600px; background-color: #fff; border: 1px solid #ddd; padding: 40px; border-radius: 4px; margin: 0 auto; }
    .header { font-size: 24px; font-weight: bold; margin-bottom: 20px; color: #111; text-align: center; }
    .cta { display: block; width: 200px; margin: 30px auto; padding: 12px 24px; background-color: #000; color: #fff; text-decoration: none; text-align: center; font-weight: bold; border-radius: 4px; }
    .fallback { font-size: 12px; color: #666; word-break: break-all; margin-top: 30px; text-align: center; }
    .footer { font-size: 12px; color: #999; margin-top: 40px; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">HARZAAR</div>
    <p>Hello ${safeFullName},</p>
    <p>We received a request to reset your password. Click the button below to set a new password:</p>
    <a href="${safeResetLink}" class="cta">Reset Password</a>
    <p>This link is valid for exactly one hour. If you did not make this request, please ignore this email; no changes have been made to your account.</p>
    <div class="fallback">
      If you are having trouble with the button above, copy and paste this URL into your web browser:<br>
      ${safeResetLink}
    </div>
    <div class="footer">
      This is an automated security notification from HARZAAR.
    </div>
  </div>
</body>
</html>`;

    const text = `HARZAAR Password Reset

Hello ${fullName},

We received a request to reset your password. Copy and paste the link below into your web browser to set a new password:

${resetLink}

This link is valid for exactly one hour. If you did not make this request, please ignore this email; no changes have been made to your account.

This is an automated security notification from HARZAAR.`;

    const emailData = {
      to: email,
      subject: 'Reset Your Password - HARZAAR',
      html,
      text
    };

    return await this.send(emailData);
  }

  /**
   * Send Welcome Email
   */
  async sendWelcomeEmail(email, fullName) {
    const safeName = this.escapeHtml(fullName);
    const emailData = {
      to: email,
      subject: 'Welcome to MevaPur!',
      html: `<p>Welcome, ${safeName}!</p>`,
      text: `Welcome, ${fullName}!`
    };

    await this.send(emailData);
  }

  /**
   * Generic Send Method
   */
  async send(emailData) {
    const mode = config.mode;
    if (mode === 'disabled') {
      logger.info('Email sending disabled', {
        subject: emailData.subject
      });
      return { success: true, reason: 'EMAIL_SMTP_DISABLED' };
    }

    if (mode === 'mock') {
      logger.info('Email queued (mock)', {
        subject: emailData.subject
      });
      return { success: true, reason: 'EMAIL_SMTP_MOCKED' };
    }

    if (mode !== 'smtp') {
      throw new Error('EMAIL_SMTP_CONFIGURATION_FAILED');
    }

    const transporter = this.getTransporter();
    const fromName = config.smtp.fromName || config.displayName;
    const fromAddress = config.smtp.from;
    const fromHeader = `"${fromName.replace(/"/g, '\\"')}" <${fromAddress}>`;

    const mailOptions = {
      from: fromHeader,
      to: emailData.to,
      subject: emailData.subject,
      text: emailData.text,
      html: emailData.html
    };

    try {
      const info = await transporter.sendMail(mailOptions);

      const recipient = emailData.to.toLowerCase();
      const accepted = (info.accepted || []).map(r => r.toLowerCase());
      const rejected = (info.rejected || []).map(r => r.toLowerCase());

      if (accepted.includes(recipient) && !rejected.includes(recipient)) {
        logger.info('Email successfully accepted by SMTP provider', {
          messageId: info.messageId
        });
        return {
          success: true,
          reason: 'EMAIL_SMTP_ACCEPTED',
          messageId: info.messageId,
          providerAccepted: true,
          deliveredToInbox: false
        };
      } else {
        logger.warn('Email was rejected by the SMTP provider');
        throw new Error('EMAIL_SMTP_REJECTED');
      }
    } catch (error) {
      let reasonCode = 'EMAIL_SMTP_CONNECTION_FAILED';
      const errorMessage = error.message || '';

      if (errorMessage.includes('EMAIL_SMTP_REJECTED')) {
        reasonCode = 'EMAIL_SMTP_REJECTED';
      } else if (errorMessage.includes('Authentication') || errorMessage.includes('auth')) {
        reasonCode = 'EMAIL_SMTP_AUTH_FAILED';
      } else if (error.code === 'ETIMEOUT' || errorMessage.includes('timeout')) {
        reasonCode = 'EMAIL_SMTP_TIMEOUT';
      }

      logger.error('SMTP delivery failed', {
        reason: reasonCode
      });

      throw new Error(reasonCode);
    }
  }
}

module.exports = new EmailService();