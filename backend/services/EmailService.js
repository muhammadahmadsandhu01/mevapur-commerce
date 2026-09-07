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
  async sendVerificationEmail(email, fullName, token, options = {}) {
    const { getRuntimeConfig } = require('../config/runtime.config');
    const runtimeConfig = getRuntimeConfig();
    const storefrontOrigin = runtimeConfig.origins.storefront;
    const verifyUrl = new URL('/verify-email', storefrontOrigin);
    verifyUrl.searchParams.set('token', token);
    if (options.redirect) {
      const redirectStr = String(options.redirect).trim();
      if (
        redirectStr.startsWith('/')
        && !redirectStr.startsWith('//')
        && !redirectStr.startsWith('/\\')
        && !redirectStr.includes('://')
        && !redirectStr.includes('\\')
      ) {
        verifyUrl.searchParams.set('redirect', redirectStr);
      }
    }
    const verificationLink = verifyUrl.toString();

    const safeBrandName = this.escapeHtml(config.brandName);
    const safeLink = this.escapeHtml(verificationLink);
    const safeName = this.escapeHtml(fullName);

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Verify Your Email - ${safeBrandName}</title>
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
    <div class="header">${safeBrandName}</div>
    <p>Hello ${safeName},</p>
    <p>Thank you for registering with ${safeBrandName}. Please verify your email address by clicking the button below:</p>
    <a href="${safeLink}" class="cta">Verify Email</a>
    <p>This link is valid for 24 hours. If you did not create an account, please ignore this email.</p>
    <div class="fallback">
      If you are having trouble with the button above, copy and paste this URL into your web browser:<br>
      ${safeLink}
    </div>
    <div class="footer">
      This is an automated security notification from ${safeBrandName}.
    </div>
  </div>
</body>
</html>`;

    const text = `${config.brandName} Email Verification

Hello ${fullName},

Thank you for registering with ${config.brandName}. Please verify your email address by opening the link below:

${verificationLink}

This link is valid for 24 hours. If you did not create an account, please ignore this email.

This is an automated security notification from ${config.brandName}.`;

    const emailData = {
      to: email,
      subject: `Verify Your Email - ${config.brandName}`,
      html,
      text
    };

    return await this.send(emailData);
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

    const { formatExpiryDuration } = require('../utils/durationFormatter');
    let resetExpiryMs = options.expiryMs;
    if (!resetExpiryMs) {
      try {
        const authConfig = require('../config/auth.config');
        resetExpiryMs = authConfig?.security?.resetTokenExpiryMs;
      } catch {
        resetExpiryMs = 15 * 60 * 1000;
      }
    }
    const expiryDuration = formatExpiryDuration(resetExpiryMs);

    const safeFullName = this.escapeHtml(fullName);
    const safeResetLink = this.escapeHtml(resetLink);
    const safeBrandName = this.escapeHtml(config.brandName);

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Reset Your Password - ${safeBrandName}</title>
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
    <div class="header">${safeBrandName}</div>
    <p>Hello ${safeFullName},</p>
    <p>We received a request to reset your password. Click the button below to set a new password:</p>
    <a href="${safeResetLink}" class="cta">Reset Password</a>
    <p>This link is valid for ${expiryDuration}. If you did not make this request, please ignore this email; no changes have been made to your account.</p>
    <div class="fallback">
      If you are having trouble with the button above, copy and paste this URL into your web browser:<br>
      ${safeResetLink}
    </div>
    <div class="footer">
      This is an automated security notification from ${safeBrandName}.
    </div>
  </div>
</body>
</html>`;

    const text = `${config.brandName} Password Reset

Hello ${fullName},

We received a request to reset your password. Copy and paste the link below into your web browser to set a new password:

${resetLink}

This link is valid for ${expiryDuration}. If you did not make this request, please ignore this email; no changes have been made to your account.

This is an automated security notification from ${config.brandName}.`;

    const emailData = {
      to: email,
      subject: `Reset Your Password - ${config.brandName}`,
      html,
      text
    };

    return await this.send(emailData);
  }

  /**
   * Send Staff Invitation Email
   */
  async sendStaffInvitationEmail(email, role, token, options = {}) {
    const { getRuntimeConfig } = require('../config/runtime.config');
    const runtimeConfig = getRuntimeConfig();
    const adminOrigin = runtimeConfig.origins.admin;

    const inviteUrl = new URL('/accept-invitation', adminOrigin);
    inviteUrl.searchParams.set('token', token);
    const inviteLink = inviteUrl.toString();

    const safeBrandName = this.escapeHtml(config.brandName);
    const safeRole = this.escapeHtml(role.replace('_', ' ').toUpperCase());
    const safeInviteLink = this.escapeHtml(inviteLink);

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Staff Invitation - ${safeBrandName}</title>
  <style>
    body { font-family: sans-serif; background-color: #f9f9f9; color: #333; margin: 0; padding: 20px; }
    .container { max-width: 600px; background-color: #fff; border: 1px solid #ddd; padding: 40px; border-radius: 4px; margin: 0 auto; }
    .header { font-size: 24px; font-weight: bold; margin-bottom: 20px; color: #111; text-align: center; }
    .cta { display: block; width: 220px; margin: 30px auto; padding: 12px 24px; background-color: #0f172a; color: #fff; text-decoration: none; text-align: center; font-weight: bold; border-radius: 4px; }
    .footer { font-size: 12px; color: #999; margin-top: 40px; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">${safeBrandName} Staff Invitation</div>
    <p>Hello,</p>
    <p>You have been invited to join the <strong>${safeBrandName}</strong> administrative team with the role of <strong>${safeRole}</strong>.</p>
    <p>Please click the button below to accept your invitation and set up your staff credentials:</p>
    <a href="${safeInviteLink}" class="cta">Accept Invitation</a>
    <p>This invitation link will expire in 48 hours.</p>
    <div class="footer">
      If you were not expecting this invitation, please disregard this email.
    </div>
  </div>
</body>
</html>`;

    const text = `${config.brandName} Staff Invitation\n\nYou have been invited to join the ${config.brandName} administrative team as ${safeRole}.\n\nClick the link below to accept the invitation and set up your account:\n${inviteLink}\n\nThis link will expire in 48 hours.`;

    const emailData = {
      to: email,
      subject: `Staff Invitation - ${config.brandName}`,
      html,
      text
    };

    return await this.send(emailData);
  }

  /**
   * Send Welcome Email
   */
  async sendWelcomeEmail(email, fullName) {
    const safeBrandName = this.escapeHtml(config.brandName);
    const safeName = this.escapeHtml(fullName);
    const emailData = {
      to: email,
      subject: `Welcome to ${config.brandName}!`,
      html: `<p>Welcome to ${safeBrandName}, ${safeName}!</p>`,
      text: `Welcome to ${config.brandName}, ${fullName}!`
    };

    return await this.send(emailData);
  }

  /**
   * Send via Brevo HTTPS REST API
   */
  async sendViaBrevo(emailData) {
    const brevoConfig = config.brevo;
    if (!brevoConfig || !brevoConfig.apiKey) {
      logger.error('Brevo configuration missing or invalid', {
        provider: 'brevo',
        reason: 'EMAIL_BREVO_CONFIGURATION_FAILED'
      });
      throw new Error('EMAIL_BREVO_CONFIGURATION_FAILED');
    }

    const rawSenderName = brevoConfig.fromName || config.brandName || config.displayName;
    const senderName = String(rawSenderName || '').replace(/[\r\n]/g, '').trim();
    const senderEmail = brevoConfig.fromAddress;

    const rawSubject = emailData.subject;
    const subject = String(rawSubject || '').replace(/[\r\n]/g, '').trim();

    const recipientEmail = String(emailData.to || '').trim();
    const recipient = { email: recipientEmail };
    if (emailData.toName) {
      const sanitizedToName = String(emailData.toName).replace(/[\r\n]/g, '').trim();
      if (sanitizedToName) {
        recipient.name = sanitizedToName;
      }
    }

    const payload = {
      sender: {
        name: senderName,
        email: senderEmail
      },
      to: [recipient],
      subject,
      htmlContent: emailData.html,
      textContent: emailData.text
    };

    const endpoint = brevoConfig.endpoint || 'https://api.brevo.com/v3/smtp/email';
    const controller = new AbortController();
    const timeoutMs = 10000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    let response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'api-key': brevoConfig.apiKey,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
    } catch (networkError) {
      clearTimeout(timeoutId);
      const isTimeout = networkError.name === 'AbortError'
        || networkError.code === 'ETIMEOUT'
        || (networkError.message && networkError.message.toLowerCase().includes('timeout'));
      const reasonCode = isTimeout ? 'EMAIL_BREVO_TIMEOUT' : 'EMAIL_BREVO_CONNECTION_FAILED';

      logger.error('Brevo delivery failed', {
        provider: 'brevo',
        reason: reasonCode
      });
      throw new Error(reasonCode);
    } finally {
      clearTimeout(timeoutId);
    }

    let data = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }

    if (response.ok) {
      const messageId = typeof data?.messageId === 'string' && data.messageId.trim().length > 0
        ? data.messageId.trim()
        : (Array.isArray(data?.messageIds) && typeof data.messageIds[0] === 'string' && data.messageIds[0].trim().length > 0
          ? data.messageIds[0].trim()
          : null);

      if (messageId) {
        logger.info('Email successfully accepted by Brevo provider', {
          provider: 'brevo',
          messageId
        });
        return {
          success: true,
          reason: 'EMAIL_BREVO_ACCEPTED',
          messageId,
          provider: 'brevo',
          providerAccepted: true,
          deliveredToInbox: false
        };
      }

      logger.error('Brevo response missing valid messageId', {
        provider: 'brevo',
        reason: 'EMAIL_BREVO_REJECTED',
        statusCode: response.status
      });
      throw new Error('EMAIL_BREVO_REJECTED');
    }

    const status = response.status;
    let reasonCode = 'EMAIL_BREVO_REJECTED';

    if (status === 401 || status === 403) {
      reasonCode = 'EMAIL_BREVO_AUTH_FAILED';
    } else if (status === 429) {
      reasonCode = 'EMAIL_BREVO_RATE_LIMITED';
    } else if (status >= 500) {
      reasonCode = 'EMAIL_BREVO_UNAVAILABLE';
    } else if (status === 400 || status === 422) {
      reasonCode = 'EMAIL_BREVO_REJECTED';
    }

    logger.error('Brevo delivery failed', {
      provider: 'brevo',
      reason: reasonCode,
      statusCode: status
    });

    throw new Error(reasonCode);
  }

  /**
   * Send via SMTP transporter
   */
  async sendViaSmtp(emailData) {
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

    if (mode === 'brevo') {
      return await this.sendViaBrevo(emailData);
    }

    if (mode === 'smtp') {
      return await this.sendViaSmtp(emailData);
    }

    throw new Error('EMAIL_SMTP_CONFIGURATION_FAILED');
  }
}

module.exports = new EmailService();