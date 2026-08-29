const crypto = require('crypto');
const request = require('supertest');
const app = require('../../app');
const TokenService = require('../../services/TokenService');
const Session = require('../../models/Session');
const Role = require('../../models/Role');
const Permission = require('../../models/Permission');

let sequence = 0;

const authenticateAs = async (role) => {
  sequence += 1;
  const user = await global.createTestUser({
    email: `roles-${role}-${sequence}@example.test`,
    role
  });
  const session = await Session.create({
    user: user._id,
    refreshTokenHash: crypto.randomBytes(32).toString('hex'),
    tokenFamilyId: crypto.randomUUID(),
    isActive: true,
    isRevoked: false,
    expiresAt: new Date(Date.now() + 3600000)
  });

  return `Bearer ${TokenService.generateAccessToken({
    userId: user._id,
    sessionId: session._id,
    tokenVersion: user.tokenVersion
  })}`;
};

describe('Roles read-only Admin contract', () => {
  test('requires authentication and Admin authorization', async () => {
    const unauthenticated = await request(app).get('/api/roles');
    expect(unauthenticated.status).toBe(401);

    const customerAuthorization = await authenticateAs('customer');
    const forbidden = await request(app)
      .get('/api/roles')
      .set('Authorization', customerAuthorization);

    expect(forbidden.status).toBe(403);
  });

  test('returns a stable empty response without inventing role definitions', async () => {
    const authorization = await authenticateAs('admin');
    const response = await request(app)
      .get('/api/roles')
      .set('Authorization', authorization);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: {
        roles: [],
        assignmentRoles: expect.any(Array)
      }
    });
    expect(response.body.data.assignmentRoles).toEqual(expect.arrayContaining([
      { name: 'manager', hasRoleDefinition: false },
      { name: 'support', hasRoleDefinition: false },
      { name: 'inventory', hasRoleDefinition: false }
    ]));
  });

  test('returns only selected stored role and permission fields', async () => {
    const permission = await Permission.create({
      module: 'report',
      resource: 'reports',
      action: 'read',
      scope: 'all',
      description: 'Read operational reports'
    });
    await Role.create({
      name: 'ADMIN',
      description: 'Stored administrator definition',
      permissions: [permission._id],
      isSystem: true,
      isActive: true
    });

    const authorization = await authenticateAs('super_admin');
    const response = await request(app)
      .get('/api/roles')
      .set('Authorization', authorization);

    expect(response.status).toBe(200);
    expect(response.body.data.roles).toHaveLength(1);
    expect(response.body.data.roles[0]).toEqual({
      id: expect.any(String),
      name: 'ADMIN',
      description: 'Stored administrator definition',
      isSystem: true,
      isActive: true,
      permissions: [{
        id: expect.any(String),
        module: 'report',
        resource: 'reports',
        action: 'read',
        scope: 'all',
        description: 'Read operational reports',
        isActive: true
      }]
    });
    expect(response.body.data.roles[0]).not.toHaveProperty('createdAt');
    expect(response.body.data.assignmentRoles).toContainEqual({
      name: 'admin',
      hasRoleDefinition: true
    });
  });

  test('uses centralized error handling without exposing internal failures', async () => {
    const authorization = await authenticateAs('admin');
    jest.spyOn(Role, 'find').mockImplementationOnce(() => {
      throw new Error('private database topology detail');
    });

    const response = await request(app)
      .get('/api/roles')
      .set('Authorization', authorization);

    expect(response.status).toBe(500);
    expect(response.body).toMatchObject({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected server error occurred'
      },
      meta: { requestId: expect.any(String) }
    });
    expect(JSON.stringify(response.body)).not.toContain('database topology');
  });
});
