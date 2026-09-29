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
    const effectiveMode = process.env.EMAIL_MODE || config.mode;
    if (effectiveMode !== 'smtp') {
      return null;
    }
    if (this.transporter) {
      return this.transporter;
    }

    const host = process.env.SMTP_HOST || config.smtp?.host || 'smtp.gmail.com';
    const port = Number(process.env.SMTP_PORT || config.smtp?.port) || 587;
    const secure = port === 465 ? true : (process.env.SMTP_SECURE === 'true' ? true : false);
    const user = process.env.SMTP_USER || process.env.EMAIL_USER || config.smtp?.auth?.user;
    const pass = process.env.SMTP_PASS || process.env.SMTP_PASSWORD || process.env.EMAIL_PASSWORD || config.smtp?.auth?.pass;

    if (!user || !pass) {
      throw new Error('EMAIL_SMTP_CONFIGURATION_FAILED');
    }

    const options = {
      host,
      port,
      secure,
      auth: {
        user,
        pass
      },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 20000,
      tls: {
        rejectUnauthorized: true
      }
    };

    if (port === 587) {
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
    const storefrontOrigin = process.env.FRONTEND_URL
      || process.env.CLIENT_URL
      || process.env.NEXT_PUBLIC_SITE_URL
      || runtimeConfig?.origins?.storefront
      || 'http://127.0.0.1:55070';
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

    logger.info('Generated verification email link', {
      recipient: email,
      verificationLink
    });

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
   * Format status string for user-friendly display
   */
  formatStatus(status) {
    if (!status || typeof status !== 'string') return '';
    return status
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  /**
   * Send Order Confirmation Email
   */
  async sendOrderConfirmationEmail(arg1, arg2) {
    let order, recipientEmail, recipientName;
    if (arg1 && arg1.order) {
      ({ order, recipientEmail, recipientName } = arg1);
    } else {
      order = arg1;
      recipientEmail = arg2;
    }

    const { getRuntimeConfig } = require('../config/runtime.config');
    const runtimeConfig = getRuntimeConfig();
    const storefrontOrigin = process.env.FRONTEND_URL
      || process.env.CLIENT_URL
      || process.env.NEXT_PUBLIC_SITE_URL
      || runtimeConfig?.origins?.storefront
      || 'http://127.0.0.1:55070';

    if (!order) {
      return { success: false, reason: 'NO_ORDER_PROVIDED' };
    }

    const orderId = order.orderId || order._id;
    const viewOrderUrl = `${storefrontOrigin}/orders/${encodeURIComponent(orderId)}`;
    const safeBrandName = this.escapeHtml(config.brandName || 'HARZAAR');
    const toEmail = recipientEmail || order.customerEmail || order.shippingAddress?.email || (order.user && order.user.email);
    if (!toEmail) {
      logger.warn('Cannot send order confirmation email: no recipient email found', { orderId });
      return { success: false, reason: 'NO_RECIPIENT_EMAIL' };
    }

    const customerName = recipientName || order.shippingAddress?.fullName || (order.user && order.user.fullName) || 'Valued Customer';
    const safeCustomerName = this.escapeHtml(customerName);
    const safeOrderId = this.escapeHtml(orderId);
    const safeViewOrderUrl = this.escapeHtml(viewOrderUrl);
    const paymentMethodDisplay = order.paymentMethod === 'cod' ? 'Cash on Delivery (COD)' : (order.paymentMethod || 'Prepaid');
    const safePaymentMethod = this.escapeHtml(paymentMethodDisplay);
    const totalAmount = Number(order.totalAmount || 0);

    // Format delivery address
    const address = order.shippingAddress || {};
    const addressParts = [
      address.address || address.addressLine1,
      address.addressLine2,
      address.city || address.locality,
      address.province || address.administrativeArea,
      address.postalCode,
      address.country
    ].filter(Boolean);
    const addressStr = addressParts.join(', ');
    const safeAddress = this.escapeHtml(addressStr);
    const phone = address.phone || address.phoneE164 || '';
    const safePhone = this.escapeHtml(phone);

    // Format items
    const itemsList = Array.isArray(order.items) ? order.items : [];
    const itemsHtml = itemsList.map((item) => {
      const name = this.escapeHtml(item.name || 'Item');
      const qty = item.quantity || 1;
      const price = item.price !== undefined ? item.price : 0;
      return `<tr>
        <td style="padding: 10px 8px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #1e293b;">${name}</td>
        <td style="padding: 10px 8px; border-bottom: 1px solid #e2e8f0; text-align: center; font-size: 13px; color: #475569;">${qty}</td>
        <td style="padding: 10px 8px; border-bottom: 1px solid #e2e8f0; text-align: right; font-size: 13px; font-weight: 700; color: #0b132b;">Rs. ${(Number(price) * qty).toLocaleString()}</td>
      </tr>`;
    }).join('');

    const itemsText = itemsList.map((item) => {
      const name = item.name || 'Item';
      const qty = item.quantity || 1;
      const price = item.price !== undefined ? Number(item.price) * qty : 0;
      return `- ${name} x${qty} (Rs. ${price.toLocaleString()})`;
    }).join('\n');

    const subject = `Order Confirmed: #${orderId} - Thank you for your purchase!`;

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${this.escapeHtml(subject)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b; margin: 0; padding: 20px; }
    .container { max-width: 600px; background-color: #ffffff; border: 1px solid #e2e8f0; padding: 32px; border-radius: 12px; margin: 0 auto; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
    .header { font-size: 20px; font-weight: 800; color: #0b132b; margin-bottom: 16px; border-bottom: 2px solid #ff8a00; padding-bottom: 12px; }
    .status-badge { display: inline-block; background-color: #16a34a; color: #ffffff; font-weight: 700; padding: 6px 16px; border-radius: 9999px; font-size: 13px; text-transform: uppercase; margin: 10px 0; letter-spacing: 0.05em; }
    .details-box { background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 16px; border-radius: 8px; margin: 20px 0; font-size: 13px; line-height: 1.6; color: #334155; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 13px; }
    th { text-align: left; padding: 8px; background-color: #f1f5f9; border-bottom: 2px solid #cbd5e1; font-weight: 700; color: #0b132b; }
    .cta-btn { display: inline-block; background-color: #0b132b; color: #ffffff !important; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 700; font-size: 14px; margin: 24px 0 16px 0; transition: background 0.2s; }
    .footer { font-size: 12px; color: #64748b; margin-top: 32px; border-top: 1px solid #e2e8f0; padding-top: 16px; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">${safeBrandName}</div>
    <p style="font-size: 15px; margin-bottom: 8px;">Hello <strong>${safeCustomerName}</strong>,</p>
    <p style="font-size: 14px; color: #475569; margin-top: 0;">Thank you for shopping with us! Your order <strong>#${safeOrderId}</strong> has been successfully placed.</p>
    
    <div>
      <span class="status-badge">Order Confirmed</span>
    </div>

    <div class="details-box">
      <div><strong>Order ID:</strong> #${safeOrderId}</div>
      <div><strong>Payment Method:</strong> ${safePaymentMethod}</div>
      ${safeAddress ? `<div><strong>Delivery Address:</strong> ${safeAddress}</div>` : ''}
      ${safePhone ? `<div><strong>Phone:</strong> ${safePhone}</div>` : ''}
    </div>

    <h3 style="font-size: 14px; font-weight: 700; color: #0b132b; margin-top: 24px; margin-bottom: 8px;">Items Ordered</h3>
    <table>
      <thead>
        <tr>
          <th>Item</th>
          <th style="text-align: center;">Qty</th>
          <th style="text-align: right;">Total</th>
        </tr>
      </thead>
      <tbody>
        ${itemsHtml}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="2" style="padding: 12px 8px; font-weight: 800; font-size: 14px; color: #0b132b; border-top: 2px solid #cbd5e1;">Order Total:</td>
          <td style="padding: 12px 8px; text-align: right; font-weight: 800; font-size: 15px; color: #0b132b; border-top: 2px solid #cbd5e1;">Rs. ${totalAmount.toLocaleString()}</td>
        </tr>
      </tfoot>
    </table>

    <div style="text-align: center;">
      <a href="${safeViewOrderUrl}" class="cta-btn">View Order Details</a>
    </div>

    <div class="footer">
      If you have any questions about your order, please reply to this email or contact support.<br>
      &copy; ${new Date().getFullYear()} ${safeBrandName}. All rights reserved.
    </div>
  </div>
</body>
</html>`;

    const text = `${config.brandName || 'HARZAAR'} - Order Confirmation
=====================================================

Hello ${customerName},

Thank you for your order! Your order #${orderId} has been successfully placed.

Status: Order Confirmed
Order ID: #${orderId}
Payment Method: ${paymentMethodDisplay}
${addressStr ? `Delivery Address: ${addressStr}\n` : ''}${phone ? `Phone: ${phone}\n` : ''}
Items Ordered:
${itemsText}

Order Total: Rs. ${totalAmount.toLocaleString()}

View Order Details:
${viewOrderUrl}

Thank you for shopping with ${config.brandName || 'HARZAAR'}!
`;

    const emailData = {
      to: toEmail,
      toName: customerName,
      subject,
      text,
      html
    };

    logger.info('Dispatching order confirmation email', {
      orderId,
      recipient: toEmail,
      subject
    });

    return await this.send(emailData);
  }

  /**
   * Send Order Status Update Email
   */
  async sendOrderStatusUpdateEmail(arg1, arg2, arg3) {
    let order, newStatus, previousStatus, recipientEmail, recipientName;
    if (arg1 && arg1.order) {
      ({ order, newStatus, previousStatus, recipientEmail, recipientName } = arg1);
    } else {
      order = arg1;
      newStatus = arg2;
      previousStatus = arg3;
    }

    const { getRuntimeConfig } = require('../config/runtime.config');
    const runtimeConfig = getRuntimeConfig();
    const storefrontOrigin = process.env.FRONTEND_URL
      || process.env.CLIENT_URL
      || process.env.NEXT_PUBLIC_SITE_URL
      || runtimeConfig?.origins?.storefront
      || 'http://127.0.0.1:55070';

    if (!order) {
      return { success: false, reason: 'NO_ORDER_PROVIDED' };
    }

    const orderId = order.orderId || order._id;
    const viewOrderUrl = `${storefrontOrigin}/orders/${encodeURIComponent(orderId)}`;
    const safeBrandName = this.escapeHtml(config.brandName || 'HARZAAR');
    const toEmail = recipientEmail || order.customerEmail || order.shippingAddress?.email || (order.user && order.user.email);
    if (!toEmail) {
      logger.warn('Cannot send order status update email: no recipient email found', { orderId });
      return { success: false, reason: 'NO_RECIPIENT_EMAIL' };
    }

    const customerName = recipientName || order.shippingAddress?.fullName || (order.user && order.user.fullName) || 'Valued Customer';
    const safeCustomerName = this.escapeHtml(customerName);
    const safeOrderId = this.escapeHtml(orderId);
    const formattedStatus = this.formatStatus(newStatus);
    const safeStatus = this.escapeHtml(formattedStatus);
    const safeViewOrderUrl = this.escapeHtml(viewOrderUrl);

    // Format delivery address
    const address = order.shippingAddress || {};
    const addressParts = [
      address.address,
      address.addressLine2,
      address.city,
      address.province,
      address.postalCode,
      address.country
    ].filter(Boolean);
    const addressStr = addressParts.join(', ');
    const safeAddress = this.escapeHtml(addressStr);

    // Format items
    const itemsList = Array.isArray(order.items) ? order.items : [];
    const itemsHtml = itemsList.map((item) => {
      const name = this.escapeHtml(item.name || 'Item');
      const qty = item.quantity || 1;
      const price = item.price !== undefined ? item.price : '';
      return `<tr>
        <td style="padding: 10px 8px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #1e293b;">${name}</td>
        <td style="padding: 10px 8px; border-bottom: 1px solid #e2e8f0; text-align: center; font-size: 13px; color: #475569;">${qty}</td>
        <td style="padding: 10px 8px; border-bottom: 1px solid #e2e8f0; text-align: right; font-size: 13px; font-weight: 700; color: #0b132b;">Rs. ${(Number(price) * qty).toLocaleString()}</td>
      </tr>`;
    }).join('');

    const itemsText = itemsList.map((item) => {
      const name = item.name || 'Item';
      const qty = item.quantity || 1;
      const price = item.price !== undefined ? Number(item.price) * qty : '';
      return `- ${name} x${qty}${price !== '' ? ` (Rs. ${price.toLocaleString()})` : ''}`;
    }).join('\n');

    const subject = `Update on your order ${orderId}: Now ${formattedStatus}`;

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${this.escapeHtml(subject)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b; margin: 0; padding: 20px; }
    .container { max-width: 600px; background-color: #ffffff; border: 1px solid #e2e8f0; padding: 32px; border-radius: 12px; margin: 0 auto; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
    .header { font-size: 20px; font-weight: 800; color: #0b132b; margin-bottom: 16px; border-bottom: 2px solid #ff8a00; padding-bottom: 12px; }
    .status-badge { display: inline-block; background-color: #ff8a00; color: #ffffff; font-weight: 700; padding: 6px 16px; border-radius: 9999px; font-size: 13px; text-transform: uppercase; margin: 10px 0; letter-spacing: 0.05em; }
    .details-box { background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 16px; border-radius: 8px; margin: 20px 0; font-size: 13px; line-height: 1.6; color: #334155; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 13px; }
    th { text-align: left; padding: 8px; background-color: #f1f5f9; border-bottom: 2px solid #cbd5e1; font-weight: 700; color: #0b132b; }
    .cta-btn { display: inline-block; background-color: #0b132b; color: #ffffff !important; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 700; font-size: 14px; margin: 24px 0 16px 0; transition: background 0.2s; }
    .footer { font-size: 12px; color: #64748b; margin-top: 32px; border-top: 1px solid #e2e8f0; padding-top: 16px; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">${safeBrandName}</div>
    <p style="font-size: 15px; margin-bottom: 8px;">Hello <strong>${safeCustomerName}</strong>,</p>
    <p style="font-size: 14px; color: #475569; margin-top: 0;">The status of your order <strong>#${safeOrderId}</strong> has been updated:</p>
    <div style="text-align: center; margin: 16px 0;">
      <span class="status-badge">${safeStatus}</span>
    </div>

    <div class="details-box">
      <strong style="color: #0b132b;">Delivery Address:</strong><br>
      ${safeCustomerName}<br>
      ${safeAddress}
    </div>

    <h3 style="font-size: 14px; font-weight: 700; color: #0b132b; margin-top: 24px; margin-bottom: 8px;">Items in this Order</h3>
    <table>
      <thead>
        <tr>
          <th>Item</th>
          <th style="text-align: center;">Qty</th>
          <th style="text-align: right;">Total</th>
        </tr>
      </thead>
      <tbody>
        ${itemsHtml}
      </tbody>
    </table>

    <div style="text-align: center;">
      <a href="${safeViewOrderUrl}" class="cta-btn">View Order Details</a>
    </div>

    <div class="footer">
      This is an automated notification regarding your purchase at ${safeBrandName}.<br>
      If you have questions, please reach out to customer support.
    </div>
  </div>
</body>
</html>`;

    const text = `${config.brandName || 'HARZAAR'} - Order Status Update

Hello ${customerName},

The status of your order #${orderId} has been updated: Now ${formattedStatus}

Delivery Address:
${customerName}
${addressStr}

Items in this Order:
${itemsText}

View Order Details:
${viewOrderUrl}

Thank you for shopping with ${config.brandName || 'HARZAAR'}.`;

    const emailData = {
      to: toEmail,
      subject,
      html,
      text
    };

    logger.info('Dispatching order status update email', {
      orderId,
      newStatus,
      previousStatus: previousStatus || 'unknown',
      recipient: toEmail,
      subject
    });

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
    const fromName = process.env.SMTP_FROM_NAME || config.smtp?.fromName || config.displayName || 'HARZAAR Support';
    const fromAddress = process.env.SMTP_FROM || config.smtp?.from || process.env.SMTP_USER || process.env.EMAIL_USER;
    const defaultFromHeader = `"${fromName.replace(/"/g, '\\"')}" <${fromAddress}>`;
    const fromHeader = process.env.EMAIL_FROM || defaultFromHeader;

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
          messageId: info.messageId,
          response: info.response
        });
        return {
          success: true,
          reason: 'EMAIL_SMTP_ACCEPTED',
          messageId: info.messageId,
          providerAccepted: true,
          deliveredToInbox: false,
          response: info.response
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
        reason: reasonCode,
        message: error.message
      });

      throw new Error(reasonCode);
    }
  }

  /**
   * Generic Send Method
   */
  async send(emailData) {
    const mode = process.env.EMAIL_MODE || config.mode;
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