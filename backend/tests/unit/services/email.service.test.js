const EmailService = require('../../../services/EmailService');
const { getRuntimeConfig } = require('../../../config/runtime.config');
const nodemailer = require('nodemailer');

jest.mock('nodemailer', () => ({
  createTransport: jest.fn()
}));

jest.mock('../../../common/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

jest.mock('../../../config/runtime.config', () => {
  const actual = jest.requireActual('../../../config/runtime.config');
  return {
    ...actual,
    getRuntimeConfig: jest.fn()
  };
});

describe('EmailService', () => {
  let mockTransporter;

  beforeEach(() => {
    jest.clearAllMocks();
    EmailService.transporter = null;

    mockTransporter = {
      sendMail: jest.fn().mockResolvedValue({
        messageId: 'mock-id',
        accepted: ['test@example.com'],
        rejected: []
      })
    };
    nodemailer.createTransport.mockReturnValue(mockTransporter);

    getRuntimeConfig.mockReturnValue({
      email: {
        mode: 'mock',
        smtp: null
      },
      origins: {
        storefront: 'http://localhost:3000',
        admin: 'http://localhost:3001'
      }
    });
  });

  it('runs successfully in disabled mode', async () => {
    getRuntimeConfig.mockReturnValue({
      email: {
        mode: 'disabled',
        smtp: null
      },
      origins: {
        storefront: 'http://localhost:3000',
        admin: 'http://localhost:3001'
      }
    });

    const result = await EmailService.send({
      to: 'disabled@example.com',
      subject: 'Test Disabled',
      html: '<p>Test</p>',
      text: 'Test'
    });

    expect(result).toEqual({ success: true, reason: 'EMAIL_SMTP_DISABLED' });
    expect(nodemailer.createTransport).not.toHaveBeenCalled();
  });

  it('runs successfully in mock mode', async () => {
    const result = await EmailService.send({
      to: 'mock@example.com',
      subject: 'Test Mock',
      html: '<p>Test</p>',
      text: 'Test'
    });

    expect(result).toEqual({ success: true, reason: 'EMAIL_SMTP_MOCKED' });
    expect(nodemailer.createTransport).not.toHaveBeenCalled();
  });

  it('creates a singleton Nodemailer transporter when mode is smtp', async () => {
    getRuntimeConfig.mockReturnValue({
      email: {
        mode: 'smtp',
        smtp: {
          host: 'smtp.mailtrap.io',
          port: 587,
          secure: false,
          auth: { user: 'user', pass: 'pass' },
          from: 'noreply@harzaar.com',
          fromName: 'HARZAAR'
        }
      },
      origins: {
        storefront: 'http://localhost:3000',
        admin: 'http://localhost:3001'
      }
    });

    const transporter1 = EmailService.getTransporter();
    const transporter2 = EmailService.getTransporter();

    expect(transporter1).toBe(transporter2);
    expect(nodemailer.createTransport).toHaveBeenCalledTimes(1);
    expect(nodemailer.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'smtp.mailtrap.io',
        port: 587,
        secure: false,
        connectionTimeout: 5000,
        greetingTimeout: 5000,
        socketTimeout: 10000
      })
    );
  });

  it('applies STARTTLS and requireTLS configuration for port 587', () => {
    getRuntimeConfig.mockReturnValue({
      email: {
        mode: 'smtp',
        smtp: {
          host: 'smtp.mailtrap.io',
          port: 587,
          secure: false,
          auth: { user: 'user', pass: 'pass' },
          from: 'noreply@harzaar.com',
          fromName: 'HARZAAR'
        }
      },
      origins: {
        storefront: 'http://localhost:3000',
        admin: 'http://localhost:3001'
      }
    });

    EmailService.getTransporter();

    expect(nodemailer.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        port: 587,
        secure: false,
        requireTLS: true
      })
    );
  });

  it('applies implicit TLS configuration for port 465', () => {
    getRuntimeConfig.mockReturnValue({
      email: {
        mode: 'smtp',
        smtp: {
          host: 'smtp.mailtrap.io',
          port: 465,
          secure: true,
          auth: { user: 'user', pass: 'pass' },
          from: 'noreply@harzaar.com',
          fromName: 'HARZAAR'
        }
      },
      origins: {
        storefront: 'http://localhost:3000',
        admin: 'http://localhost:3001'
      }
    });

    EmailService.getTransporter();

    expect(nodemailer.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        port: 465,
        secure: true
      })
    );
  });

  it('escapes user controlled names in HTML content', () => {
    const dangerous = 'John & <script>alert("XSS")</script> "quote"';
    const escaped = EmailService.escapeHtml(dangerous);

    expect(escaped).toBe('John &amp; &lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt; &quot;quote&quot;');
  });

  it('applies configured brand name in subject, HTML, and plaintext, and leaves no hardcoded HARZAAR branding', async () => {
    getRuntimeConfig.mockReturnValue({
      email: {
        mode: 'smtp',
        brandName: 'BrandX & Co',
        smtp: {
          host: 'smtp.mailtrap.io',
          port: 465,
          secure: true,
          auth: { user: 'user', pass: 'pass' },
          from: 'noreply@brandx.com',
          fromName: 'BrandX'
        }
      },
      origins: {
        storefront: 'http://localhost:3000',
        admin: 'http://localhost:3001'
      }
    });

    await EmailService.sendPasswordResetEmail(
      'test@example.com',
      'John Doe',
      'reset-token-123',
      { audience: 'storefront' }
    );

    expect(mockTransporter.sendMail).toHaveBeenCalledTimes(1);
    const mailOptions = mockTransporter.sendMail.mock.calls[0][0];

    // Subject checks
    expect(mailOptions.subject).toContain('BrandX & Co');
    expect(mailOptions.subject).not.toContain('HARZAAR');

    // Plaintext checks
    expect(mailOptions.text).toContain('BrandX & Co Password Reset');
    expect(mailOptions.text).toContain('automated security notification from BrandX & Co.');
    expect(mailOptions.text).not.toContain('HARZAAR');

    // HTML checks (escaped & should be &amp;)
    expect(mailOptions.html).toContain('BrandX &amp; Co');
    expect(mailOptions.html).toContain('automated security notification from BrandX &amp; Co.');
    expect(mailOptions.html).not.toContain('HARZAAR');
  });

  it('throws an error if configuration mode is not smtp/mock/disabled', async () => {
    getRuntimeConfig.mockReturnValue({
      email: {
        mode: 'invalid',
        smtp: null
      },
      origins: {
        storefront: 'http://localhost:3000',
        admin: 'http://localhost:3001'
      }
    });

    await expect(
      EmailService.send({ to: 't@example.com', subject: 't', html: 't', text: 't' })
    ).rejects.toThrow('EMAIL_SMTP_CONFIGURATION_FAILED');
  });

  it('handles provider accepted message', async () => {
    getRuntimeConfig.mockReturnValue({
      email: {
        mode: 'smtp',
        smtp: {
          host: 'smtp.mailtrap.io',
          port: 465,
          secure: true,
          auth: { user: 'user', pass: 'pass' },
          from: 'noreply@harzaar.com',
          fromName: 'HARZAAR'
        }
      },
      origins: {
        storefront: 'http://localhost:3000',
        admin: 'http://localhost:3001'
      }
    });

    const result = await EmailService.send({
      to: 'test@example.com',
      subject: 'Verify',
      html: '<p>Verify</p>',
      text: 'Verify'
    });

    expect(result.success).toBe(true);
    expect(result.reason).toBe('EMAIL_SMTP_ACCEPTED');
    expect(result.providerAccepted).toBe(true);
    expect(result.deliveredToInbox).toBe(false);
  });

  it('handles provider rejection', async () => {
    getRuntimeConfig.mockReturnValue({
      email: {
        mode: 'smtp',
        smtp: {
          host: 'smtp.mailtrap.io',
          port: 465,
          secure: true,
          auth: { user: 'user', pass: 'pass' },
          from: 'noreply@harzaar.com',
          fromName: 'HARZAAR'
        }
      },
      origins: {
        storefront: 'http://localhost:3000',
        admin: 'http://localhost:3001'
      }
    });

    mockTransporter.sendMail.mockResolvedValue({
      messageId: 'mock-id',
      accepted: [],
      rejected: ['test@example.com']
    });

    await expect(
      EmailService.send({
        to: 'test@example.com',
        subject: 'Verify',
        html: '<p>Verify</p>',
        text: 'Verify'
      })
    ).rejects.toThrow('EMAIL_SMTP_REJECTED');
  });

  it('maps SMTP authentication failures cleanly', async () => {
    getRuntimeConfig.mockReturnValue({
      email: {
        mode: 'smtp',
        smtp: {
          host: 'smtp.mailtrap.io',
          port: 465,
          secure: true,
          auth: { user: 'user', pass: 'pass' },
          from: 'noreply@harzaar.com',
          fromName: 'HARZAAR'
        }
      },
      origins: {
        storefront: 'http://localhost:3000',
        admin: 'http://localhost:3001'
      }
    });

    mockTransporter.sendMail.mockRejectedValue(new Error('Invalid credentials or authentication failed'));

    await expect(
      EmailService.send({
        to: 'test@example.com',
        subject: 'Verify',
        html: '<p>Verify</p>',
        text: 'Verify'
      })
    ).rejects.toThrow('EMAIL_SMTP_AUTH_FAILED');
  });

  it('maps SMTP connection timeouts cleanly', async () => {
    getRuntimeConfig.mockReturnValue({
      email: {
        mode: 'smtp',
        smtp: {
          host: 'smtp.mailtrap.io',
          port: 465,
          secure: true,
          auth: { user: 'user', pass: 'pass' },
          from: 'noreply@harzaar.com',
          fromName: 'HARZAAR'
        }
      },
      origins: {
        storefront: 'http://localhost:3000',
        admin: 'http://localhost:3001'
      }
    });

    const timeoutError = new Error('Connection timed out');
    timeoutError.code = 'ETIMEOUT';
    mockTransporter.sendMail.mockRejectedValue(timeoutError);

    await expect(
      EmailService.send({
        to: 'test@example.com',
        subject: 'Verify',
        html: '<p>Verify</p>',
        text: 'Verify'
      })
    ).rejects.toThrow('EMAIL_SMTP_TIMEOUT');
  });
});
