const request = require('supertest');
const mongoose = require('mongoose');
const crypto = require('crypto');
const app = require('../../app');
const User = require('../../models/User');
const Session = require('../../models/Session');
const Order = require('../../models/Order');
const Refund = require('../../models/Refund');
const FinancialMetricsService = require('../../services/order/FinancialMetricsService');
const SessionService = require('../../services/SessionService');
const TokenService = require('../../services/TokenService');
const AuditLog = require('../../models/AuditLog');
const { ORDER_STATUSES } = require('../../constants/orderConstants');
const { PAYMENT_STATUSES, REFUND_STATUSES } = require('../../constants/paymentConstants');

const generateStaffToken = async (user) => {
  const session = await Session.create({
    user: user._id,
    refreshTokenHash: crypto.randomBytes(32).toString('hex'),
    tokenFamilyId: crypto.randomUUID(),
    isActive: true,
    isRevoked: false,
    expiresAt: new Date(Date.now() + 3600000)
  });

  return TokenService.generateAccessToken({
    userId: user._id,
    sessionId: session._id,
    tokenVersion: user.tokenVersion || 0
  });
};

describe('Phase 3 — Customer Contract and Realized Finance Integrity', () => {
  let superAdminUser;
  let adminUser;
  let managerUser;
  let supportUser;
  let inventoryUser;
  let customerRoleUser;
  let invalidRoleUser;

  let superAdminToken;
  let adminToken;
  let managerToken;
  let supportToken;
  let inventoryToken;
  let customerRoleToken;
  let invalidRoleToken;

  let customer1;
  let customer2;
  let customer3;

  beforeEach(async () => {
    await User.deleteMany({});
    await Session.deleteMany({});
    await Order.deleteMany({});
    await Refund.deleteMany({});
    try { await AuditLog.collection.deleteMany({}); } catch { /* ignore */ }

    // Create staff users with test-specific emails
    superAdminUser = await User.create({
      fullName: 'Super Admin',
      email: 'superadmin-cust@mevapur.test',
      password: 'Password123!',
      role: 'super_admin',
      tokenVersion: 0,
      isVerified: true
    });
    superAdminToken = await generateStaffToken(superAdminUser);

    adminUser = await User.create({
      fullName: 'Admin User',
      email: 'admin-cust@mevapur.test',
      password: 'Password123!',
      role: 'admin',
      tokenVersion: 0,
      isVerified: true
    });
    adminToken = await generateStaffToken(adminUser);

    managerUser = await User.create({
      fullName: 'Manager User',
      email: 'manager-cust@mevapur.test',
      password: 'Password123!',
      role: 'manager',
      tokenVersion: 0,
      isVerified: true
    });
    managerToken = await generateStaffToken(managerUser);

    supportUser = await User.create({
      fullName: 'Support User',
      email: 'support-cust@mevapur.test',
      password: 'Password123!',
      role: 'support',
      tokenVersion: 0,
      isVerified: true
    });
    supportToken = await generateStaffToken(supportUser);

    inventoryUser = await User.create({
      fullName: 'Inventory User',
      email: 'inventory-cust@mevapur.test',
      password: 'Password123!',
      role: 'inventory',
      tokenVersion: 0,
      isVerified: true
    });
    inventoryToken = await generateStaffToken(inventoryUser);

    customerRoleUser = await User.create({
      fullName: 'Customer Role User',
      email: 'customerrole-cust@mevapur.test',
      password: 'Password123!',
      role: 'customer',
      tokenVersion: 0,
      isVerified: true
    });
    customerRoleToken = await generateStaffToken(customerRoleUser);

    // Create test customer fixtures
    customer1 = await User.create({
      fullName: 'Ahmad Khan',
      email: 'ahmad-cust@example.com',
      password: 'Password123!',
      phone: '+923001234567',
      role: 'customer',
      isBlocked: false,
      tokenVersion: 0,
      isVerified: true,
      addresses: [{
        fullName: 'Ahmad Khan',
        phone: '+923001234567',
        address: '123 Main Blvd',
        city: 'Lahore',
        country: 'Pakistan',
        isDefault: true
      }]
    });

    customer2 = await User.create({
      fullName: 'Sara Ali',
      email: 'sara-cust@example.com',
      password: 'Password123!',
      phone: '+923007654321',
      role: 'customer',
      isBlocked: true,
      tokenVersion: 1,
      isVerified: true
    });

    customer3 = await User.create({
      fullName: 'Bilal Tariq',
      email: 'bilal-cust@example.com',
      password: 'Password123!',
      phone: '+923009998888',
      role: 'customer',
      isBlocked: false,
      tokenVersion: 0,
      isVerified: true
    });
  });

  describe('1. Comprehensive Table-Driven Role Authorization Matrix', () => {
    it('enforces authorized and forbidden roles on customer list (GET /api/customers)', async () => {
      const tokens = {
        super_admin: superAdminToken,
        admin: adminToken,
        manager: managerToken,
        support: supportToken,
        inventory: inventoryToken,
        customer: customerRoleToken
      };
      const expected = { super_admin: 200, admin: 200, manager: 200, support: 200, inventory: 403, customer: 403 };
      for (const [role, status] of Object.entries(expected)) {
        const res = await request(app).get('/api/customers').set('Authorization', `Bearer ${tokens[role]}`);
        expect(res.status).toBe(status);
      }
    });

    it('enforces authorized and forbidden roles on customer detail (GET /api/customers/:id)', async () => {
      const tokens = {
        super_admin: superAdminToken,
        admin: adminToken,
        manager: managerToken,
        support: supportToken,
        inventory: inventoryToken,
        customer: customerRoleToken
      };
      const expected = { super_admin: 200, admin: 200, manager: 200, support: 200, inventory: 403, customer: 403 };
      for (const [role, status] of Object.entries(expected)) {
        const res = await request(app).get(`/api/customers/${customer1._id}`).set('Authorization', `Bearer ${tokens[role]}`);
        expect(res.status).toBe(status);
      }
    });

    it('enforces authorized and forbidden roles on customer profile edit (PATCH /api/customers/:id/profile)', async () => {
      const tokens = {
        super_admin: superAdminToken,
        admin: adminToken,
        manager: managerToken,
        support: supportToken,
        inventory: inventoryToken,
        customer: customerRoleToken
      };
      const expected = { super_admin: 200, admin: 200, manager: 200, support: 403, inventory: 403, customer: 403 };
      for (const [role, status] of Object.entries(expected)) {
        const res = await request(app)
          .patch(`/api/customers/${customer1._id}/profile`)
          .set('Authorization', `Bearer ${tokens[role]}`)
          .send({ fullName: 'Ahmad Khan Updated' });
        expect(res.status).toBe(status);
      }
    });

    it('enforces authorized and forbidden roles on customer CSV export (GET /api/customers/export)', async () => {
      const tokens = {
        super_admin: superAdminToken,
        admin: adminToken,
        manager: managerToken,
        support: supportToken,
        inventory: inventoryToken,
        customer: customerRoleToken
      };
      const expected = { super_admin: 200, admin: 200, manager: 200, support: 403, inventory: 403, customer: 403 };
      for (const [role, status] of Object.entries(expected)) {
        const res = await request(app).get('/api/customers/export').set('Authorization', `Bearer ${tokens[role]}`);
        expect(res.status).toBe(status);
      }
    });

    it('enforces authorized and forbidden roles on customer block/unblock (PUT /api/customers/:id/block)', async () => {
      const tokens = {
        super_admin: superAdminToken,
        admin: adminToken,
        manager: managerToken,
        support: supportToken,
        inventory: inventoryToken,
        customer: customerRoleToken
      };
      const expected = { super_admin: 200, admin: 200, manager: 403, support: 403, inventory: 403, customer: 403 };
      for (const [role, status] of Object.entries(expected)) {
        const res = await request(app)
          .put(`/api/customers/${customer1._id}/block`)
          .set('Authorization', `Bearer ${tokens[role]}`)
          .send({ isBlocked: true, reason: 'Valid test block reason' });
        expect(res.status).toBe(status);
      }
    });

    it('specifically forbids manager from blocking or unblocking customers (403)', async () => {
      const resBlock = await request(app)
        .put(`/api/customers/${customer1._id}/block`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ isBlocked: true, reason: 'Manager attempt' });
      expect(resBlock.status).toBe(403);

      const resUnblock = await request(app)
        .put(`/api/customers/${customer2._id}/block`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ isBlocked: false, reason: 'Manager unblock attempt' });
      expect(resUnblock.status).toBe(403);
    });

    it('fails closed with 401 for unauthenticated requests and invalid tokens', async () => {
      const resNoAuth = await request(app).get('/api/customers');
      expect(resNoAuth.status).toBe(401);

      const resInvalidToken = await request(app)
        .get('/api/customers')
        .set('Authorization', 'Bearer invalid.token.payload');
      expect(resInvalidToken.status).toBe(401);
    });
  });

  describe('2. Phase 1 Realized Finance Reconciliation and Customer Metrics', () => {
    it('reconciles realized spend across FinancialMetricsService and customerController exactly', async () => {
      const dummyProductId = new mongoose.Types.ObjectId();

      const createTestOrder = async ({
        orderId,
        user,
        orderStatus,
        paymentStatus,
        totalAmount
      }) => {
        return Order.create({
          orderId,
          user,
          idempotencyKey: crypto.randomUUID(),
          requestHash: crypto.randomBytes(32).toString('hex'),
          orderStatus,
          paymentStatus,
          paymentMethod: 'stripe',
          subtotal: totalAmount,
          totalAmount,
          shippingCost: 0,
          discount: 0,
          items: [{
            product: dummyProductId,
            name: 'Test Item',
            price: totalAmount,
            quantity: 1,
            lineTotal: totalAmount
          }],
          shippingAddress: {
            fullName: 'Ahmad Khan',
            phone: '123456789',
            address: '123 St',
            city: 'Lahore',
            province: 'Punjab',
            country: 'PK'
          },
          statusTimeline: [{
            status: orderStatus,
            actor: user,
            actorRole: 'customer',
            timestamp: new Date(),
            note: ''
          }]
        });
      };

      // Order 1: Paid Delivered order for Rs. 5,000
      await createTestOrder({
        orderId: 'ORD-1001',
        user: customer1._id,
        orderStatus: ORDER_STATUSES.DELIVERED,
        paymentStatus: 'Paid',
        totalAmount: 5000
      });

      // Order 2: Processing Paid order for Rs. 3,000 with a completed refund of Rs. 1,000
      const order2 = await createTestOrder({
        orderId: 'ORD-1002',
        user: customer1._id,
        orderStatus: ORDER_STATUSES.PROCESSING,
        paymentStatus: 'PartiallyRefunded',
        totalAmount: 3000
      });
      await Refund.create({
        payment: new mongoose.Types.ObjectId(),
        order: order2._id,
        customer: customer1._id,
        provider: 'stripe',
        amount: 1000,
        currency: 'PKR',
        status: REFUND_STATUSES.COMPLETED,
        processedBy: superAdminUser._id,
        idempotencyKey: crypto.randomUUID(),
        requestHash: crypto.randomBytes(32).toString('hex'),
        providerIdempotencyKey: crypto.randomUUID(),
        reason: 'Damaged packaging'
      });

      // Order 3: Cancelled order for Rs. 10,000 (must be EXCLUDED from realized spend)
      await createTestOrder({
        orderId: 'ORD-1003',
        user: customer1._id,
        orderStatus: ORDER_STATUSES.CANCELLED,
        paymentStatus: 'Paid',
        totalAmount: 10000
      });

      // Order 4: Unpaid Pending order for Rs. 2,500 (must be EXCLUDED from realized spend)
      await createTestOrder({
        orderId: 'ORD-1004',
        user: customer1._id,
        orderStatus: ORDER_STATUSES.PENDING,
        paymentStatus: 'Pending',
        totalAmount: 2500
      });

      // Customer 3: Paid Delivered order for Rs. 4,000
      await createTestOrder({
        orderId: 'ORD-1005',
        user: customer3._id,
        orderStatus: ORDER_STATUSES.DELIVERED,
        paymentStatus: 'Paid',
        totalAmount: 4000
      });

      // Run authoritative Dashboard / FinancialMetricsService calculation
      const dashboardStats = await FinancialMetricsService.getDashboardStats();
      // Total realized: (5000) + (3000 - 1000 = 2000) + (4000) = Rs. 11,000
      expect(dashboardStats.totalRevenue).toBe(11000);

      // Fetch customer list endpoint
      const res = await request(app)
        .get('/api/customers')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.summary.global.totalRealizedSpend).toBe(11000);

      const cust1Data = res.body.data.find((c) => c.id === customer1._id.toString());
      expect(cust1Data).toBeDefined();
      expect(cust1Data.totalOrders).toBe(4);       // All 4 orders
      expect(cust1Data.realizedOrders).toBe(2);    // Order 1 & 2 only
      expect(cust1Data.totalSpent).toBe(7000);     // 5000 + (3000 - 1000) = 7000
      expect(cust1Data.averageOrderValue).toBe(3500); // 7000 / 2 = 3500

      // Individual customer detail endpoint
      const detailRes = await request(app)
        .get(`/api/customers/${customer1._id}`)
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(detailRes.status).toBe(200);
      expect(detailRes.body.data.totalOrders).toBe(4);
      expect(detailRes.body.data.realizedOrders).toBe(2);
      expect(detailRes.body.data.totalSpent).toBe(7000);
      expect(detailRes.body.data.averageOrderValue).toBe(3500);
      expect(detailRes.body.data.recentOrders.length).toBe(4);
    });
  });

  describe('3. Profile Update Strict Allowlist and Security Projections', () => {
    it('allows updating fullName and phone, rejecting unauthorized fields', async () => {
      const resValid = await request(app)
        .patch(`/api/customers/${customer1._id}/profile`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          fullName: 'Ahmad M. Khan',
          phone: '+923000000000'
        });

      expect(resValid.status).toBe(200);
      expect(resValid.body.data.fullName).toBe('Ahmad M. Khan');
      expect(resValid.body.data.phone).toBe('+923000000000');

      // Attempt to modify email or role (must fail with 400)
      const resMalicious = await request(app)
        .patch(`/api/customers/${customer1._id}/profile`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          fullName: 'Ahmad Khan',
          email: 'hacked@example.com',
          role: 'super_admin',
          isVerified: true
        });

      expect(resMalicious.status).toBe(400);
      expect(resMalicious.body.error?.message || resMalicious.body.message).toContain('Unallowed fields');

      // Verify customer in database remains intact
      const freshUser = await User.findById(customer1._id);
      expect(freshUser.email).toBe(customer1.email);
      expect(freshUser.role).toBe('customer');
    });

    it('sanitizes password and session internals from responses', async () => {
      const res = await request(app)
        .get(`/api/customers/${customer1._id}`)
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.password).toBeUndefined();
      expect(res.body.data.tokenVersion).toBeUndefined();
      expect(res.body.data.resetPasswordTokenHash).toBeUndefined();
      expect(res.body.data.loginAttempts).toBeUndefined();
    });
  });

  describe('4. Blocking, Unblocking, and Complete Immutable Audit Logs', () => {
    it('increments tokenVersion, revokes active sessions, and logs CUSTOMER.BLOCKED on block', async () => {
      // Create active session
      const session = await Session.create({
        user: customer1._id,
        refreshTokenHash: crypto.randomBytes(32).toString('hex'),
        tokenFamilyId: crypto.randomUUID(),
        isActive: true,
        isRevoked: false,
        expiresAt: new Date(Date.now() + 3600000)
      });

      expect(session.isActive).toBe(true);

      // Block customer
      const resBlock = await request(app)
        .put(`/api/customers/${customer1._id}/block`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ isBlocked: true, reason: 'Suspicious order activity' });

      expect(resBlock.status).toBe(200);
      expect(resBlock.body.data.isBlocked).toBe(true);
      expect(resBlock.body.data.isActive).toBe(false);

      // Verify tokenVersion incremented in database
      const reloaded = await User.findById(customer1._id).select('+tokenVersion');
      expect(reloaded.isBlocked).toBe(true);
      expect(reloaded.tokenVersion).toBe(1);

      // Verify session was revoked in database
      const reloadedSession = await Session.findById(session._id);
      expect(reloadedSession.isActive).toBe(false);
      expect(reloadedSession.isRevoked).toBe(true);

      // Verify CUSTOMER.BLOCKED audit log
      const blockAudit = await AuditLog.findOne({ eventName: 'CUSTOMER.BLOCKED' });
      expect(blockAudit).not.toBeNull();
      expect(blockAudit.status).toBe('SUCCESS');
      expect(blockAudit.userId.toString()).toBe(superAdminUser._id.toString());
      expect(blockAudit.metadata.targetCustomerId).toBe(customer1._id.toString());
      expect(blockAudit.metadata.isBlocked).toBe(true);
      expect(blockAudit.metadata.reason).toBe('Suspicious order activity');
      expect(blockAudit.metadata.password).toBeUndefined();
      expect(blockAudit.metadata.addresses).toBeUndefined();
    });

    it('logs CUSTOMER.UNBLOCKED when an admin unblocks a customer and does not log on unauthorized attempt', async () => {
      // 1. Unauthorized attempt by support should fail with 403 and write no audit log
      const initialLogsCount = await AuditLog.countDocuments({});
      const resUnauthorized = await request(app)
        .put(`/api/customers/${customer2._id}/block`)
        .set('Authorization', `Bearer ${supportToken}`)
        .send({ isBlocked: false, reason: 'Unauthorized unblock' });

      expect(resUnauthorized.status).toBe(403);
      const afterUnauthorizedCount = await AuditLog.countDocuments({});
      expect(afterUnauthorizedCount).toBe(initialLogsCount);

      // 2. Authorized unblock by admin
      const resUnblock = await request(app)
        .put(`/api/customers/${customer2._id}/block`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isBlocked: false, reason: 'Account verified via direct phone call' });

      expect(resUnblock.status).toBe(200);
      expect(resUnblock.body.data.isBlocked).toBe(false);
      expect(resUnblock.body.data.isActive).toBe(true);

      const unblockAudit = await AuditLog.findOne({ eventName: 'CUSTOMER.UNBLOCKED' });
      expect(unblockAudit).not.toBeNull();
      expect(unblockAudit.status).toBe('SUCCESS');
      expect(unblockAudit.userId.toString()).toBe(adminUser._id.toString());
      expect(unblockAudit.metadata.targetCustomerId).toBe(customer2._id.toString());
      expect(unblockAudit.metadata.isBlocked).toBe(false);
      expect(unblockAudit.metadata.reason).toBe('Account verified via direct phone call');
      expect(unblockAudit.metadata.password).toBeUndefined();
      expect(unblockAudit.metadata.addresses).toBeUndefined();
    });
  });

  describe('5. Full Dataset CSV Export Privacy, Exact Columns, and Formula Neutralization', () => {
    it('exports exact approved columns, neutralizes formulas, and omits internal/sensitive fields', async () => {
      // Create a customer with a formula in their name
      await User.create({
        fullName: '=cmd|"/C calc"!A0',
        email: 'formula@example.com',
        password: 'Password123!',
        phone: '+923001112222',
        role: 'customer',
        isVerified: true
      });

      const res = await request(app)
        .get('/api/customers/export')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toContain('attachment; filename="customers_export_');

      const lines = res.text.trim().split('\n');
      const headerLine = lines[0].replace(/\r$/, '');

      // Verify exact 11 approved columns
      expect(headerLine).toBe(
        'Customer ID,Full Name,Email,Phone,Account Status,Total Orders,Realized Orders,Total Realized Spend (PKR),Average Order Value (PKR),Joined Date,Last Order Date'
      );

      // Verify privacy requirements: Blocked Reason, Role, Passwords, Addresses are strictly absent
      expect(headerLine).not.toContain('Blocked Reason');
      expect(headerLine).not.toContain('Role');
      expect(headerLine).not.toContain('Delivered Orders');
      expect(headerLine).not.toContain('Password');
      expect(headerLine).not.toContain('Address');

      // Formula injection neutralized
      expect(res.text).toContain("'=cmd");

      // Verify audit event recorded for export
      const exportAudit = await AuditLog.findOne({ eventName: 'CUSTOMER.EXPORTED' });
      expect(exportAudit).not.toBeNull();
      expect(exportAudit.status).toBe('SUCCESS');
      expect(exportAudit.metadata.totalExported).toBeGreaterThanOrEqual(1);
    });
  });
});
