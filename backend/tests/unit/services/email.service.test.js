const EmailService = require('../../../services/EmailService');
const { getRuntimeConfig } = require('../../../config/runtime.config');

jest.mock('../../../common/utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn()
}));

describe('EmailService', () => {
  let originalSend;

  beforeAll(() => {
    originalSend = EmailService.send;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    EmailService.send = originalSend;
  });

  it('strictly fails closed when supplied with an invalid audience', async () => {
    await expect(
      EmailService.sendPasswordResetEmail('test@example.com', 'Test User', 'mock-token', { audience: 'invalid-aud' })
    ).rejects.toThrow('Invalid audience for password reset: invalid-aud');
  });

  it('resolves absent audience to storefront origin for backward compatibility', async () => {
    const mockSend = jest.fn().mockResolvedValue({ success: true });
    EmailService.send = mockSend;

    await EmailService.sendPasswordResetEmail('test@example.com', 'Test User', 'mock-token');

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'test@example.com',
        subject: 'Reset Your Password - MevaPur',
        template: 'password-reset',
        data: expect.objectContaining({
          fullName: 'Test User',
          resetLink: 'http://localhost:3000/reset-password?token=mock-token'
        })
      })
    );
  });

  it('resolves admin audience to admin origin', async () => {
    const mockSend = jest.fn().mockResolvedValue({ success: true });
    EmailService.send = mockSend;

    await EmailService.sendPasswordResetEmail('admin@example.com', 'Admin User', 'mock-token', { audience: 'admin' });

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          resetLink: 'http://localhost:3001/reset-password?token=mock-token'
        })
      })
    );
  });

  it('escapes and encodes token query parameters correctly using platform URL constructor', async () => {
    const mockSend = jest.fn().mockResolvedValue({ success: true });
    EmailService.send = mockSend;

    const specialToken = 'token with spaces & special chars?key=val';
    await EmailService.sendPasswordResetEmail('test@example.com', 'Test User', specialToken, { audience: 'storefront' });

    const expectedUrl = new URL('http://localhost:3000/reset-password');
    expectedUrl.searchParams.set('token', specialToken);

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          resetLink: expectedUrl.toString()
        })
      })
    );
  });
});
