const crypto = require('crypto');
const request = require('supertest');
const app = require('../../app');
const TokenService = require('../../services/TokenService');
const Session = require('../../models/Session');
const Notification = require('../../models/Notification');

let sequence = 0;
const auth = async (role = 'customer') => {
  sequence += 1;
  const user = await global.createTestUser({ email: `notification-user-${sequence}@example.test`, role });
  const session = await Session.create({
    user: user._id,
    refreshTokenHash: crypto.randomBytes(32).toString('hex'),
    tokenFamilyId: crypto.randomUUID(),
    isActive: true,
    isRevoked: false,
    expiresAt: new Date(Date.now() + 3600000)
  });
  return {
    user,
    authorization: `Bearer ${TokenService.generateAccessToken({
      userId: user._id,
      sessionId: session._id,
      tokenVersion: user.tokenVersion
    })}`
  };
};

describe('Notification routing integration', () => {
  test('DELETE /delete-all removes all notifications for authenticated user, and delete-all is not interpreted as ObjectId', async () => {
    const caller = await auth();
    const other = await auth();

    // Create notifications for caller
    await Notification.create([
      { recipient: caller.user._id, type: 'system', title: 'N1', message: 'M1' },
      { recipient: caller.user._id, type: 'system', title: 'N2', message: 'M2' }
    ]);

    // Create notification for other
    await Notification.create({
      recipient: other.user._id,
      type: 'system',
      title: 'N3',
      message: 'M3'
    });

    expect(await Notification.countDocuments({ recipient: caller.user._id })).toBe(2);
    expect(await Notification.countDocuments({ recipient: other.user._id })).toBe(1);

    // Call DELETE /delete-all
    const response = await request(app)
      .delete('/api/notifications/delete-all')
      .set('Authorization', caller.authorization);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.message).toBe('All notifications deleted');

    expect(await Notification.countDocuments({ recipient: caller.user._id })).toBe(0);
    expect(await Notification.countDocuments({ recipient: other.user._id })).toBe(1); // untouched
  });

  test('DELETE /:id deletes a single notification', async () => {
    const caller = await auth();
    const notif = await Notification.create({
      recipient: caller.user._id,
      type: 'system',
      title: 'Single',
      message: 'Msg'
    });

    expect(await Notification.countDocuments({ recipient: caller.user._id })).toBe(1);

    // Call DELETE /:id
    const response = await request(app)
      .delete(`/api/notifications/${notif._id}`)
      .set('Authorization', caller.authorization);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.message).toBe('Notification deleted');

    expect(await Notification.countDocuments({ recipient: caller.user._id })).toBe(0);
  });

  test('DELETE /delete-all and DELETE /:id require authentication', async () => {
    const response = await request(app)
      .delete('/api/notifications/delete-all');
    expect(response.status).toBe(401);

    const responseSingle = await request(app)
      .delete('/api/notifications/60d5ecb5c7f6a92c8c3e4f1b');
    expect(responseSingle.status).toBe(401);
  });
});
