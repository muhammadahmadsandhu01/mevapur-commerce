const { createRuntimeConfig, RuntimeConfigurationError } = require('../../config/runtime.config');

describe('runtime.config.js Email and SMTP validation', () => {
  let baseEnv;

  beforeEach(() => {
    baseEnv = {
      NODE_ENV: 'development',
      FRONTEND_URL: 'http://localhost:3000',
      ADMIN_URL: 'http://localhost:3001',
      BACKEND_PUBLIC_URL: 'http://localhost:5000',
      AUTH_COOKIE_SAME_SITE: 'lax',
      AUTH_COOKIE_SECURE: 'false'
    };
  });

  it('allows mock and disabled modes in local development', () => {
    const devConfigMock = createRuntimeConfig({
      ...baseEnv,
      EMAIL_MODE: 'mock'
    });
    expect(devConfigMock.email.mode).toBe('mock');

    const devConfigDisabled = createRuntimeConfig({
      ...baseEnv,
      EMAIL_MODE: 'disabled'
    });
    expect(devConfigDisabled.email.mode).toBe('disabled');
  });

  it('rejects mock and disabled modes in production/staging environments', () => {
    const prodEnv = {
      ...baseEnv,
      NODE_ENV: 'production',
      FRONTEND_URL: 'https://harzaar.com',
      ADMIN_URL: 'https://admin.harzaar.com',
      BACKEND_PUBLIC_URL: 'https://api.harzaar.com',
      AUTH_COOKIE_SAME_SITE: 'strict',
      AUTH_COOKIE_SECURE: 'true',
      TRUST_PROXY: '1'
    };

    expect(() => {
      createRuntimeConfig({ ...prodEnv, EMAIL_MODE: 'mock' });
    }).toThrow('EMAIL_MODE must be smtp or brevo in staging and production');

    expect(() => {
      createRuntimeConfig({ ...prodEnv, EMAIL_MODE: 'disabled' });
    }).toThrow('EMAIL_MODE must be smtp or brevo in staging and production');
  });

  it('strictly validates required SMTP configuration fields when mode is smtp', () => {
    const env = {
      ...baseEnv,
      EMAIL_MODE: 'smtp'
    };

    expect(() => {
      createRuntimeConfig(env);
    }).toThrow('SMTP_HOST is required');
  });

  it('rejects invalid email formats in SMTP_FROM address', () => {
    const env = {
      ...baseEnv,
      EMAIL_MODE: 'smtp',
      SMTP_HOST: 'smtp.mailtrap.io',
      SMTP_PORT: '587',
      SMTP_SECURE: 'false',
      SMTP_USER: 'user',
      SMTP_PASSWORD: 'password',
      SMTP_FROM: 'invalid-from-addr'
    };

    expect(() => {
      createRuntimeConfig(env);
    }).toThrow('SMTP_FROM must be a valid email address');
  });

  it('enforces implicit TLS secure settings on port 465', () => {
    const env = {
      ...baseEnv,
      EMAIL_MODE: 'smtp',
      SMTP_HOST: 'smtp.mailtrap.io',
      SMTP_PORT: '465',
      SMTP_SECURE: 'false',
      SMTP_USER: 'user',
      SMTP_PASSWORD: 'password',
      SMTP_FROM: 'noreply@harzaar.com'
    };

    expect(() => {
      createRuntimeConfig(env);
    }).toThrow('SMTP_PORT 465 requires SMTP_SECURE to be true');

    const validEnv = {
      ...env,
      SMTP_SECURE: 'true'
    };
    const config = createRuntimeConfig(validEnv);
    expect(config.email.smtp.secure).toBe(true);
  });

  it('enforces STARTTLS settings on port 587', () => {
    const env = {
      ...baseEnv,
      EMAIL_MODE: 'smtp',
      SMTP_HOST: 'smtp.mailtrap.io',
      SMTP_PORT: '587',
      SMTP_SECURE: 'true',
      SMTP_USER: 'user',
      SMTP_PASSWORD: 'password',
      SMTP_FROM: 'noreply@harzaar.com'
    };

    expect(() => {
      createRuntimeConfig(env);
    }).toThrow('SMTP_PORT 587 requires SMTP_SECURE to be false');

    const validEnv = {
      ...env,
      SMTP_SECURE: 'false'
    };
    const config = createRuntimeConfig(validEnv);
    expect(config.email.smtp.secure).toBe(false);
  });

  it('rejects loopback/localhost SMTP hosts in production', () => {
    const prodEnv = {
      ...baseEnv,
      NODE_ENV: 'production',
      FRONTEND_URL: 'https://harzaar.com',
      ADMIN_URL: 'https://admin.harzaar.com',
      BACKEND_PUBLIC_URL: 'https://api.harzaar.com',
      AUTH_COOKIE_SAME_SITE: 'strict',
      AUTH_COOKIE_SECURE: 'true',
      TRUST_PROXY: '1',
      EMAIL_MODE: 'smtp',
      EMAIL_BRAND_NAME: 'HARZAAR',
      SMTP_PORT: '465',
      SMTP_SECURE: 'true',
      SMTP_USER: 'prod-user',
      SMTP_PASSWORD: 'prod-password',
      SMTP_FROM: 'noreply@harzaar.com'
    };

    expect(() => {
      createRuntimeConfig({ ...prodEnv, SMTP_HOST: 'localhost' });
    }).toThrow('SMTP_HOST must not point to a localhost or loopback address in production');

    expect(() => {
      createRuntimeConfig({ ...prodEnv, SMTP_HOST: '127.0.0.1' });
    }).toThrow('SMTP_HOST must not point to a localhost or loopback address in production');
  });

  it('rejects generic placeholder credentials in production', () => {
    const prodEnv = {
      ...baseEnv,
      NODE_ENV: 'production',
      FRONTEND_URL: 'https://harzaar.com',
      ADMIN_URL: 'https://admin.harzaar.com',
      BACKEND_PUBLIC_URL: 'https://api.harzaar.com',
      AUTH_COOKIE_SAME_SITE: 'strict',
      AUTH_COOKIE_SECURE: 'true',
      TRUST_PROXY: '1',
      EMAIL_MODE: 'smtp',
      EMAIL_BRAND_NAME: 'HARZAAR',
      SMTP_HOST: 'smtp.sendgrid.net',
      SMTP_PORT: '465',
      SMTP_SECURE: 'true',
      SMTP_FROM: 'noreply@harzaar.com'
    };

    expect(() => {
      createRuntimeConfig({ ...prodEnv, SMTP_USER: 'default_username', SMTP_PASSWORD: 'password' });
    }).toThrow('SMTP credentials must not use placeholder or default patterns in production');

    expect(() => {
      createRuntimeConfig({ ...prodEnv, SMTP_USER: 'username', SMTP_PASSWORD: 'placeholder_password' });
    }).toThrow('SMTP credentials must not use placeholder or default patterns in production');
  });

  it('strictly validates required EMAIL_BRAND_NAME in production/staging when EMAIL_MODE=smtp', () => {
    const prodEnv = {
      ...baseEnv,
      NODE_ENV: 'production',
      FRONTEND_URL: 'https://harzaar.com',
      ADMIN_URL: 'https://admin.harzaar.com',
      BACKEND_PUBLIC_URL: 'https://api.harzaar.com',
      AUTH_COOKIE_SAME_SITE: 'strict',
      AUTH_COOKIE_SECURE: 'true',
      TRUST_PROXY: '1',
      EMAIL_MODE: 'smtp',
      SMTP_HOST: 'smtp.sendgrid.net',
      SMTP_PORT: '465',
      SMTP_SECURE: 'true',
      SMTP_USER: 'prod-safe-login',
      SMTP_PASSWORD: 'prod-safe-pass',
      SMTP_FROM: 'noreply@harzaar.com'
    };

    expect(() => {
      createRuntimeConfig(prodEnv);
    }).toThrow('EMAIL_BRAND_NAME is required in staging and production when EMAIL_MODE=smtp');

    expect(() => {
      createRuntimeConfig({ ...prodEnv, EMAIL_BRAND_NAME: ' ' });
    }).toThrow('EMAIL_BRAND_NAME is required in staging and production when EMAIL_MODE=smtp');

    const validConfig = createRuntimeConfig({ ...prodEnv, EMAIL_BRAND_NAME: 'White Label Brand' });
    expect(validConfig.email.brandName).toBe('White Label Brand');
  });

  it('strips CR and LF characters from EMAIL_BRAND_NAME to prevent header injection', () => {
    const config = createRuntimeConfig({
      ...baseEnv,
      EMAIL_BRAND_NAME: 'My Brand\r\nName\nWith\rNewlines'
    });
    expect(config.email.brandName).toBe('My BrandNameWithNewlines');
  });

  describe('Brevo configuration', () => {
    const validBrevoEnv = {
      ...baseEnv,
      EMAIL_MODE: 'brevo',
      BREVO_API_KEY: 'xkeysib-1234567890abcdef',
      EMAIL_FROM_ADDRESS: 'verified@harzaar.com',
      EMAIL_FROM_NAME: 'HARZAAR Team'
    };

    it('successfully configures Brevo in development', () => {
      const config = createRuntimeConfig(validBrevoEnv);
      expect(config.email.mode).toBe('brevo');
      expect(config.email.brevo).toEqual({
        apiKey: 'xkeysib-1234567890abcdef',
        fromAddress: 'verified@harzaar.com',
        fromName: 'HARZAAR Team',
        endpoint: 'https://api.brevo.com/v3/smtp/email'
      });
    });

    it('requires BREVO_API_KEY when EMAIL_MODE=brevo', () => {
      const env = { ...validBrevoEnv };
      delete env.BREVO_API_KEY;
      expect(() => createRuntimeConfig(env)).toThrow('BREVO_API_KEY is required');
    });

    it('requires EMAIL_FROM_ADDRESS to be a valid email address when EMAIL_MODE=brevo', () => {
      expect(() => {
        createRuntimeConfig({ ...validBrevoEnv, EMAIL_FROM_ADDRESS: 'invalid-email' });
      }).toThrow('EMAIL_FROM_ADDRESS must be a valid email address');
    });

    it('requires EMAIL_FROM_NAME and strips CR/LF from EMAIL_FROM_NAME', () => {
      expect(() => {
        createRuntimeConfig({ ...validBrevoEnv, EMAIL_FROM_NAME: ' ' });
      }).toThrow('EMAIL_FROM_NAME is required');

      const config = createRuntimeConfig({
        ...validBrevoEnv,
        EMAIL_FROM_NAME: 'HARZAAR\r\nNotifications\n'
      });
      expect(config.email.brevo.fromName).toBe('HARZAARNotifications');
    });

    it('validates Brevo in production with required EMAIL_BRAND_NAME and non-placeholder API key', () => {
      const prodBrevoEnv = {
        ...validBrevoEnv,
        NODE_ENV: 'production',
        FRONTEND_URL: 'https://harzaar.com',
        ADMIN_URL: 'https://admin.harzaar.com',
        BACKEND_PUBLIC_URL: 'https://api.harzaar.com',
        AUTH_COOKIE_SAME_SITE: 'strict',
        AUTH_COOKIE_SECURE: 'true',
        TRUST_PROXY: '1',
        EMAIL_BRAND_NAME: 'HARZAAR'
      };

      const config = createRuntimeConfig(prodBrevoEnv);
      expect(config.email.mode).toBe('brevo');
      expect(config.email.brevo.apiKey).toBe('xkeysib-1234567890abcdef');

      expect(() => {
        createRuntimeConfig({ ...prodBrevoEnv, EMAIL_BRAND_NAME: '' });
      }).toThrow('EMAIL_BRAND_NAME is required in staging and production when EMAIL_MODE=brevo');

      expect(() => {
        createRuntimeConfig({ ...prodBrevoEnv, BREVO_API_KEY: 'your-api-key' });
      }).toThrow('BREVO_API_KEY must not use placeholder or default patterns in production');

      expect(() => {
        createRuntimeConfig({ ...prodBrevoEnv, BREVO_API_KEY: 'placeholder_secret' });
      }).toThrow('BREVO_API_KEY must not use placeholder or default patterns in production');
    });

    it('rejects mock or disabled email modes in production', () => {
      const prodEnv = {
        ...baseEnv,
        NODE_ENV: 'production',
        FRONTEND_URL: 'https://harzaar.com',
        ADMIN_URL: 'https://admin.harzaar.com',
        BACKEND_PUBLIC_URL: 'https://api.harzaar.com',
        AUTH_COOKIE_SAME_SITE: 'strict',
        AUTH_COOKIE_SECURE: 'true',
        TRUST_PROXY: '1'
      };

      expect(() => {
        createRuntimeConfig({ ...prodEnv, EMAIL_MODE: 'mock' });
      }).toThrow('EMAIL_MODE must be smtp or brevo in staging and production');

      expect(() => {
        createRuntimeConfig({ ...prodEnv, EMAIL_MODE: 'disabled' });
      }).toThrow('EMAIL_MODE must be smtp or brevo in staging and production');
    });
  });
});
