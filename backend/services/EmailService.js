const logger = require('../common/logger');
const config = require('../config/email.config');

class EmailService {
  /**
   * Send Verification Email
   */
  async sendVerificationEmail(email, fullName, token) {
    const verificationLink = `${config.frontendUrl}/verify-email?token=${token}`;
    
    const emailData = {
      to: email,
      subject: 'Verify Your Email - MevaPur',
      template: 'verification',
      data: {
        fullName,
        verificationLink
      }
    };

    // In production, this would be queued
    await this.send(emailData);
    
    logger.info('Verification email sent', { email });
  }

  /**
   * Send Password Reset Email
   */
  async sendPasswordResetEmail(email, fullName, token) {
    const resetLink = `${config.frontendUrl}/reset-password?token=${token}`;
    
    const emailData = {
      to: email,
      subject: 'Reset Your Password - MevaPur',
      template: 'password-reset',
      data: {
        fullName,
        resetLink
      }
    };

    await this.send(emailData);
    
    logger.info('Password reset email sent', { email });
  }

  /**
   * Send Welcome Email
   */
  async sendWelcomeEmail(email, fullName) {
    const emailData = {
      to: email,
      subject: 'Welcome to MevaPur!',
      template: 'welcome',
      data: {
        fullName
      }
    };

    await this.send(emailData);
    
    logger.info('Welcome email sent', { email });
  }

  /**
   * Generic Send Method
   * In production, integrate with Nodemailer/SendGrid/AWS SES
   */
  async send(emailData) {
    // Mock implementation - replace with actual email provider
    logger.info('Email queued', { 
      to: emailData.to, 
      subject: emailData.subject 
    });
    
    // Example with Nodemailer:
    // const transporter = nodemailer.createTransport(config.smtp);
    // await transporter.sendMail({
    //   from: config.from,
    //   to: emailData.to,
    //   subject: emailData.subject,
    //   html: this.renderTemplate(emailData.template, emailData.data)
    // });

    return { success: true };
  }

  /**
   * Render Email Template
   */
  renderTemplate(templateName, data) {
    // In production, use Handlebars/Pug/EJS
    // This is a mock implementation
    return `<html><body>Email Content for ${templateName}</body></html>`;
  }
}

module.exports = new EmailService();