const nodemailer = require('nodemailer');
const { logger } = require('../middleware/logger');

// Create Transporter
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

// Verify connection configuration
transporter.verify((error, success) => {
  if (error) {
    logger.error('Email service verification failed:', error);
  } else {
    logger.info('Email service ready to send messages');
  }
});


/**
 * Send Order Confirmation Email
 */
exports.sendOrderConfirmation = async (email, order) => {
  const mailOptions = {
    from: process.env.EMAIL_FROM,
    to: email,
    subject: `Order Confirmation #${order.orderId}`,
    html: `
      <div style="font-family: Arial, sans-serif; color: #333;">
        <h2 style="color: #0F766E;">Thank you for your order!</h2>
        <p>Dear ${order.shippingAddress.fullName},</p>
        <p>Your order <strong>#${order.orderId}</strong> has been placed successfully.</p>
        <h3>Order Details:</h3>
        <ul>
          ${order.items.map(item => `<li>${item.name} x ${item.quantity}</li>`).join('')}
        </ul>
        <p><strong>Total Amount: $${order.totalAmount}</strong></p>
        <p>We will notify you once your order is shipped.</p>
        <br/>
        <p>Best Regards,<br/>MevaPur Team</p>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    logger.info(`Order confirmation email sent to ${email}`);
    return { success: true };
  } catch (error) {
    logger.error('Failed to send order email:', error);
    throw new Error('Email service failed');
  }
};

/**
 * Send Password Reset Email
 */
exports.sendPasswordReset = async (email, resetToken) => {
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;
  
  const mailOptions = {
    from: process.env.EMAIL_FROM,
    to: email,
    subject: 'Password Reset Request - MevaPur',
    html: `
      <p>You requested a password reset.</p>
      <p>Click the link below to reset your password:</p>
      <a href="${resetUrl}" style="color: #0F766E; font-weight: bold;">Reset Password</a>
      <p>This link expires in 10 minutes.</p>
      <p>If you didn't request this, please ignore this email.</p>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    logger.info(`Password reset email sent to ${email}`);
    return { success: true };
  } catch (error) {
    logger.error('Failed to send reset email:', error);
    throw new Error('Email service failed');
  }
};