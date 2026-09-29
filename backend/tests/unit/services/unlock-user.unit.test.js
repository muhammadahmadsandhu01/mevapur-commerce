'use strict';

const userController = require('../../../controllers/userController');
const User = require('../../../models/User');

describe('User Controller - unlockUser', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('successfully unlocks user by resetting loginAttempts to 0 and lockUntil to null', async () => {
    const mockUser = {
      _id: '6ab8c3628e086c0d2d59dfce',
      email: 'customer@example.com',
      fullName: 'Locked Customer',
      role: 'customer',
      isBlocked: false,
      loginAttempts: 5,
      lockUntil: new Date(Date.now() + 3600000),
      save: jest.fn().mockResolvedValue(true)
    };

    jest.spyOn(User, 'findById').mockReturnValue({
      select: jest.fn().mockResolvedValue(mockUser)
    });

    const req = {
      params: { id: '6ab8c3628e086c0d2d59dfce' },
      user: { _id: 'admin_id', role: 'admin' },
      ip: '127.0.0.1'
    };

    const res = {
      json: jest.fn()
    };
    const next = jest.fn();

    await userController.unlockUser(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(mockUser.loginAttempts).toBe(0);
    expect(mockUser.lockUntil).toBeNull();
    expect(mockUser.save).toHaveBeenCalledWith({ validateBeforeSave: false });
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: 'User account unlocked successfully',
        data: expect.objectContaining({
          loginAttempts: 0,
          lockUntil: null,
          email: 'customer@example.com'
        })
      })
    );
  });

  test('throws USER_NOT_FOUND when user does not exist or is soft-deleted', async () => {
    jest.spyOn(User, 'findById').mockReturnValue({
      select: jest.fn().mockResolvedValue(null)
    });

    const req = {
      params: { id: 'non_existent_id' },
      user: { _id: 'admin_id', role: 'admin' },
      ip: '127.0.0.1'
    };

    const res = { json: jest.fn() };
    const next = jest.fn();

    await userController.unlockUser(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 404,
        code: 'USER_NOT_FOUND'
      })
    );
  });
});
