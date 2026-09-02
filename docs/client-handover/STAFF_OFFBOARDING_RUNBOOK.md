# Staff Offboarding & Access Revocation Runbook

**Version**: 1.0.0  
**Target**: SuperAdmins, HR Operations & Security Officers

---

## 1. Immediate Offboarding Checklist (Execution within 15 Minutes)

When an employee or contractor departs the organization, perform the following sequential actions:

### Step 1: Block User Account in Admin Panel
1. Navigate to **Staff Management** (`/users`).
2. Search for the user by email or name.
3. Click the **Block Account** (UserX) action button.
4. Confirm the prompt.
5. *Result*: Setting `isBlocked: true` immediately invalidates all active JWT access tokens, destroys existing session records in MongoDB, and forbids any new login attempts.

### Step 2: Revoke Any Pending Staff Invitations
1. Under the **Invitations** tab in `/users`, inspect pending invitations issued by or intended for the offboarded staff.
2. Click **Revoke** on any matching invitations.

### Step 3: Rotate Shared Service Credentials (If Applicable)
If the departing staff member possessed SuperAdmin privileges or access to shared infrastructure credentials, rotate the following:
- `JWT_SECRET` and `JWT_REFRESH_SECRET`
- `MFA_ENCRYPTION_KEY`
- Database credentials (`MONGODB_URI`)
- Third-party API keys (Stripe secret key, Courier API keys, Resend/SMTP passwords)

---

## 2. SuperAdmin Ownership Transfer & Demotion Protection

The platform enforces immutable safeguards protecting the root SuperAdmin role:
1. **Minimum SuperAdmin Quorum**: The system strictly prevents blocking, deleting, or demoting the last active `super_admin` in the database.
2. **Transferring Root Ownership**:
   - SuperAdmin A invites or promotes Staff B to `super_admin`.
   - Once Staff B confirms enrollment and configures MFA, Staff B can safely demote or remove SuperAdmin A.
   - All role modifications generate immutable audit logs (`ROLE.ASSIGNED`, `ROLE.REMOVED`, `USER.BLOCKED`).
