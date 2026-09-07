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
  describe('Brevo Provider', () => {
    const originalFetch = global.fetch;

    beforeEach(() => {
      getRuntimeConfig.mockReturnValue({
        email: {
          mode: 'brevo',
          brandName: 'HARZAAR Demo',
          brevo: {
            apiKey: 'xkeysib-test-api-key-12345',
            fromAddress: 'verified@harzaar.com',
            fromName: 'HARZAAR Support',
            endpoint: 'https://api.brevo.com/v3/smtp/email'
          }
        },
        origins: {
          storefront: 'https://harzaar.com',
          admin: 'https://admin.harzaar.com'
        }
      });
      global.fetch = jest.fn();
    });

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('successfully sends email via Brevo HTTPS REST API with 201 response and messageId', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ messageId: '<brevo-message-id-999>' })
      });

      const result = await EmailService.send({
        to: 'customer@example.com',
        toName: 'Jane Doe',
        subject: 'Welcome to HARZAAR',
        html: '<p>Hello Jane</p>',
        text: 'Hello Jane'
      });

      expect(global.fetch).toHaveBeenCalledTimes(1);
      const [url, options] = global.fetch.mock.calls[0];
      expect(url).toBe('https://api.brevo.com/v3/smtp/email');
      expect(options.method).toBe('POST');
      expect(options.headers).toEqual({
        'api-key': 'xkeysib-test-api-key-12345',
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      });

      const body = JSON.parse(options.body);
      expect(body.sender).toEqual({
        name: 'HARZAAR Support',
        email: 'verified@harzaar.com'
      });
      expect(body.to).toEqual([
        { email: 'customer@example.com', name: 'Jane Doe' }
      ]);
      expect(body.subject).toBe('Welcome to HARZAAR');
      expect(body.htmlContent).toBe('<p>Hello Jane</p>');
      expect(body.textContent).toBe('Hello Jane');

      expect(result).toEqual({
        success: true,
        reason: 'EMAIL_BREVO_ACCEPTED',
        messageId: '<brevo-message-id-999>',
        provider: 'brevo',
        providerAccepted: true,
        deliveredToInbox: false
      });
    });

    it('sanitizes CR and LF characters in sender name, recipient name, and subject', async () => {
      getRuntimeConfig.mockReturnValue({
        email: {
          mode: 'brevo',
          brandName: 'HARZAAR Demo',
          brevo: {
            apiKey: 'xkeysib-test-api-key-12345',
            fromAddress: 'verified@harzaar.com',
            fromName: 'HARZAAR\r\nSupport\n',
            endpoint: 'https://api.brevo.com/v3/smtp/email'
          }
        },
        origins: {
          storefront: 'https://harzaar.com',
          admin: 'https://admin.harzaar.com'
        }
      });

      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ messageId: '<clean-msg-id>' })
      });

      await EmailService.send({
        to: 'customer@example.com',
        toName: 'Jane\r\nDoe\n',
        subject: 'Header\r\nInjection\nSubject',
        html: '<p>Clean</p>',
        text: 'Clean'
      });

      const [, options] = global.fetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.sender.name).toBe('HARZAARSupport');
      expect(body.to[0].name).toBe('JaneDoe');
      expect(body.subject).toBe('HeaderInjectionSubject');
    });

    it('rejects with EMAIL_BREVO_REJECTED when 200 response is missing messageId', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({})
      });

      await expect(
        EmailService.send({
          to: 'customer@example.com',
          subject: 'Test',
          html: '<p>T</p>',
          text: 'T'
        })
      ).rejects.toThrow('EMAIL_BREVO_REJECTED');
    });

    it('classifies 401 and 403 as EMAIL_BREVO_AUTH_FAILED', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ code: 'unauthorized', message: 'Key not found' })
      });

      await expect(
        EmailService.send({
          to: 'customer@example.com',
          subject: 'Test',
          html: '<p>T</p>',
          text: 'T'
        })
      ).rejects.toThrow('EMAIL_BREVO_AUTH_FAILED');

      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({ code: 'forbidden', message: 'Account suspended' })
      });

      await expect(
        EmailService.send({
          to: 'customer@example.com',
          subject: 'Test',
          html: '<p>T</p>',
          text: 'T'
        })
      ).rejects.toThrow('EMAIL_BREVO_AUTH_FAILED');
    });

    it('classifies 400 and 422 as EMAIL_BREVO_REJECTED', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ code: 'invalid_parameter', message: 'Invalid email' })
      });

      await expect(
        EmailService.send({
          to: 'customer@example.com',
          subject: 'Test',
          html: '<p>T</p>',
          text: 'T'
        })
      ).rejects.toThrow('EMAIL_BREVO_REJECTED');

      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 422,
        json: async () => ({ code: 'unprocessable', message: 'Domain unverified' })
      });

      await expect(
        EmailService.send({
          to: 'customer@example.com',
          subject: 'Test',
          html: '<p>T</p>',
          text: 'T'
        })
      ).rejects.toThrow('EMAIL_BREVO_REJECTED');
    });

    it('classifies 429 as EMAIL_BREVO_RATE_LIMITED', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({ code: 'too_many_requests', message: 'Rate limit exceeded' })
      });

      await expect(
        EmailService.send({
          to: 'customer@example.com',
          subject: 'Test',
          html: '<p>T</p>',
          text: 'T'
        })
      ).rejects.toThrow('EMAIL_BREVO_RATE_LIMITED');
    });

    it('classifies 5xx server errors as EMAIL_BREVO_UNAVAILABLE', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({ code: 'service_unavailable', message: 'Service maintenance' })
      });

      await expect(
        EmailService.send({
          to: 'customer@example.com',
          subject: 'Test',
          html: '<p>T</p>',
          text: 'T'
        })
      ).rejects.toThrow('EMAIL_BREVO_UNAVAILABLE');
    });

    it('classifies network connection failure as EMAIL_BREVO_CONNECTION_FAILED', async () => {
      global.fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

      await expect(
        EmailService.send({
          to: 'customer@example.com',
          subject: 'Test',
          html: '<p>T</p>',
          text: 'T'
        })
      ).rejects.toThrow('EMAIL_BREVO_CONNECTION_FAILED');
    });

    it('classifies abort / timeout as EMAIL_BREVO_TIMEOUT', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      global.fetch.mockRejectedValueOnce(abortError);

      await expect(
        EmailService.send({
          to: 'customer@example.com',
          subject: 'Test',
          html: '<p>T</p>',
          text: 'T'
        })
      ).rejects.toThrow('EMAIL_BREVO_TIMEOUT');
    });

    it('routes sendVerificationEmail through Brevo with correct payload and verification link', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ messageId: '<verify-msg-id-123>' })
      });

      const token = 'secret-verification-token-abc';
      const result = await EmailService.sendVerificationEmail(
        'user@example.com',
        'Alice Smith',
        token,
        { redirect: '/checkout' }
      );

      expect(result.success).toBe(true);
      expect(result.reason).toBe('EMAIL_BREVO_ACCEPTED');
      expect(result.messageId).toBe('<verify-msg-id-123>');

      expect(global.fetch).toHaveBeenCalledTimes(1);
      const [, options] = global.fetch.mock.calls[0];
      const body = JSON.parse(options.body);

      expect(body.subject).toContain('Verify Your Email - HARZAAR Demo');
      expect(body.htmlContent).toContain('token=secret-verification-token-abc');
      expect(body.htmlContent).toContain('redirect=%2Fcheckout');
      expect(body.textContent).toContain('token=secret-verification-token-abc');
      expect(body.textContent).toContain('redirect=%2Fcheckout');
    });

    it('routes sendPasswordResetEmail through Brevo with correct payload and reset link', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ messageId: '<reset-msg-id-456>' })
      });

      const token = 'secret-reset-token-xyz';
      const result = await EmailService.sendPasswordResetEmail(
        'user@example.com',
        'Bob Jones',
        token,
        { audience: 'storefront' }
      );

      expect(result.success).toBe(true);
      expect(result.reason).toBe('EMAIL_BREVO_ACCEPTED');
      expect(result.messageId).toBe('<reset-msg-id-456>');

      expect(global.fetch).toHaveBeenCalledTimes(1);
      const [, options] = global.fetch.mock.calls[0];
      const body = JSON.parse(options.body);

      expect(body.subject).toContain('Reset Your Password - HARZAAR Demo');
      expect(body.htmlContent).toContain('token=secret-reset-token-xyz');
      expect(body.textContent).toContain('token=secret-reset-token-xyz');
    });

    it('never leaks api keys, passwords, tokens, or full verification/reset URLs to the logger', async () => {
      const logger = require('../../../common/utils/logger');
      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ messageId: '<audit-msg-id>' })
      });

      const token = 'super-secret-token-do-not-log';
      await EmailService.sendVerificationEmail(
        'audit@example.com',
        'Audit User',
        token
      );

      const allLogCalls = [
        ...logger.info.mock.calls,
        ...logger.warn.mock.calls,
        ...logger.error.mock.calls
      ];

      for (const call of allLogCalls) {
        const serialized = JSON.stringify(call);
        expect(serialized).not.toContain(token);
        expect(serialized).not.toContain('xkeysib-test-api-key-12345');
        expect(serialized).not.toContain('/verify-email?token=');
      }
    });
  });
});
