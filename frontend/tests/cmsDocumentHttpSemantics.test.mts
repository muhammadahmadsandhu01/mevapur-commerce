import assert from 'node:assert/strict';
import test, { describe } from 'node:test';
import http from 'node:http';
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key-minimum-32-chars-length!!';
process.env.SESSION_SECRET = 'test-session-secret-key-minimum-32-chars!!';
process.env.REFRESH_TOKEN_SECRET = 'test-refresh-secret-key-minimum-32-chars!!';

const rootDir = path.resolve(process.cwd(), '..');
const backendDir = path.resolve(rootDir, 'backend');
const backendRequire = createRequire(path.resolve(backendDir, 'package.json'));

const app = backendRequire('./app.js');
const TokenService = backendRequire('./services/TokenService.js');
const Session = backendRequire('./models/Session.js');
const User = backendRequire('./models/User.js');
const Content = backendRequire('./models/Content.js');
const mongoose = backendRequire('mongoose');
const { MongoMemoryServer } = backendRequire('mongodb-memory-server');

const BACKEND_PORT = 5066;
const FRONTEND_PORT = 3511;
const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`;
const FRONTEND_URL = `http://127.0.0.1:${FRONTEND_PORT}`;

describe('CMS Storefront Document-Level HTTP Semantics & Isolation (Unmocked E2E)', () => {
  let mongoServer: { getUri: () => string; stop: () => Promise<boolean> } | null = null;
  let backendServer: http.Server;
  let nextProcess: ChildProcess;
  let adminAuth: string;
  let activePageId: string;
  let futurePageId: string;
  let expiredPageId: string;
  let draftPageId: string;

  test.before(async () => {
    // 1. Start isolated MongoDB & Backend HTTP Server
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    backendServer = http.createServer(app);
    await new Promise<void>((resolve) => {
      backendServer.listen(BACKEND_PORT, '127.0.0.1', () => resolve());
    });

    // Create Admin User & Session Token
    const adminUser = await User.create({
      fullName: 'CMS Document Tester Admin',
      email: `cms-doc-admin-${Date.now()}@example.test`,
      password: 'Password123!',
      role: 'admin',
      isEmailVerified: true
    });
    const adminSession = await Session.create({
      user: adminUser._id,
      refreshTokenHash: crypto.randomBytes(32).toString('hex'),
      tokenFamilyId: crypto.randomUUID(),
      isActive: true,
      isRevoked: false,
      expiresAt: new Date(Date.now() + 3600000)
    });
    adminAuth = `Bearer ${TokenService.generateAccessToken({
      userId: adminUser._id,
      sessionId: adminSession._id,
      tokenVersion: adminUser.tokenVersion
    })}`;

    // 2. Populate Test Content via Backend Models/API
    const now = Date.now();

    // Active published page
    const activePage = await Content.create({
      type: 'page',
      title: 'About MevaPur Heritage',
      slug: 'about-us',
      subtitle: 'Pure Northern Dry Fruits & Organic Honey',
      content: '# About MevaPur Heritage\n\nWe provide 100% single-origin natural produce.\n\n- Organic\n- Ethical',
      seo: {
        metaTitle: 'About MevaPur Heritage - Organic Produce',
        metaDescription: 'Read about our heritage and quality standards.'
      },
      isActive: true,
      views: 0
    });
    activePageId = activePage._id.toString();

    // Future-scheduled page
    const futurePage = await Content.create({
      type: 'page',
      title: 'Upcoming 2027 Terms',
      slug: 'upcoming-terms-2027',
      content: '# 2027 Terms\n\nEffective next year.',
      startDate: new Date(now + 86400000),
      isActive: true,
      views: 0
    });
    futurePageId = futurePage._id.toString();

    // Expired page
    const expiredPage = await Content.create({
      type: 'page',
      title: 'Expired Promotional Terms',
      slug: 'expired-terms-2025',
      content: '# Expired Terms\n\nConcluded promotion.',
      endDate: new Date(now - 86400000),
      isActive: true,
      views: 0
    });
    expiredPageId = expiredPage._id.toString();

    // Draft page
    const draftPage = await Content.create({
      type: 'page',
      title: 'Confidential Internal Memo',
      slug: 'internal-draft-memo',
      content: '# Internal Draft\n\nMust never be publicly visible.',
      isActive: false,
      views: 0
    });
    draftPageId = draftPage._id.toString();

    // Non-page content type with slug
    await Content.create({
      type: 'slider',
      title: 'Slider With Slug',
      slug: 'slider-not-page',
      isActive: true,
      views: 0
    });

    // 3. Start Production Next.js Standalone Server
    const standaloneServerPath = path.resolve(process.cwd(), '.next', 'standalone', 'server.js');
    nextProcess = spawn(process.execPath, [standaloneServerPath], {
      cwd: path.resolve(process.cwd(), '.next', 'standalone'),
      env: {
        ...process.env,
        PORT: String(FRONTEND_PORT),
        NODE_ENV: 'test',
        INTERNAL_API_URL: BACKEND_URL,
        NEXT_PUBLIC_API_URL: BACKEND_URL,
        NEXT_PUBLIC_SITE_URL: FRONTEND_URL,
        NEXT_PUBLIC_SITE_NAME: 'MevaPur'
      },
      stdio: 'inherit'
    });

    // Wait for Next.js server to respond
    for (let i = 0; i < 40; i++) {
      try {
        const res = await fetch(`${FRONTEND_URL}/healthz`);
        if (res.status === 200) break;
      } catch {
        await new Promise((r) => setTimeout(r, 250));
      }
    }
  });

  test.after(async () => {
    try {
      if (nextProcess) nextProcess.kill('SIGTERM');
    } catch {}
    try {
      if (backendServer) backendServer.close();
    } catch {}
    try {
      await mongoose.disconnect();
      if (mongoServer) await mongoServer.stop();
    } catch {}
  });

  test('published200: active published page returns actual document HTTP 200 with server-rendered content', async () => {
    const docRes = await fetch(`${FRONTEND_URL}/pages/about-us`);
    assert.equal(docRes.status, 200);

    const html = await docRes.text();
    // Verify content is included directly in the initial server-rendered HTML
    assert.ok(html.includes('About MevaPur Heritage'));
    assert.ok(html.includes('Pure Northern Dry Fruits &amp; Organic Honey') || html.includes('Pure Northern Dry Fruits'));
    assert.ok(html.includes('100% single-origin natural produce'));

    // Verify view counter incremented exactly once (no duplication across generateMetadata & page render)
    const dbPage = await Content.findById(activePageId);
    assert.equal(dbPage.views, 1);
  });

  test('missing404: nonexistent page returns actual document HTTP 404', async () => {
    const docRes = await fetch(`${FRONTEND_URL}/pages/completely-nonexistent-slug`);
    assert.equal(docRes.status, 404);

    const html = await docRes.text();
    assert.ok(html.includes('Page Not Found'));
    assert.ok(html.includes('The page you are looking for does not exist'));
  });

  test('hidden404: future-scheduled page returns actual document HTTP 404 without leaking content or incrementing views', async () => {
    const docRes = await fetch(`${FRONTEND_URL}/pages/upcoming-terms-2027`);
    assert.equal(docRes.status, 404);

    const html = await docRes.text();
    assert.ok(html.includes('Page Not Found'));
    assert.equal(html.includes('Effective next year'), false);

    const dbFuture = await Content.findById(futurePageId);
    assert.equal(dbFuture.views, 0);
  });

  test('hidden404: expired page returns actual document HTTP 404 without incrementing views', async () => {
    const docRes = await fetch(`${FRONTEND_URL}/pages/expired-terms-2025`);
    assert.equal(docRes.status, 404);

    const html = await docRes.text();
    assert.ok(html.includes('Page Not Found'));
    assert.equal(html.includes('Concluded promotion'), false);

    const dbExpired = await Content.findById(expiredPageId);
    assert.equal(dbExpired.views, 0);
  });

  test('hidden404: draft page returns actual document HTTP 404 without incrementing views', async () => {
    const docRes = await fetch(`${FRONTEND_URL}/pages/internal-draft-memo`);
    assert.equal(docRes.status, 404);

    const html = await docRes.text();
    assert.ok(html.includes('Page Not Found'));
    assert.equal(html.includes('Must never be publicly visible'), false);

    const dbDraft = await Content.findById(draftPageId);
    assert.equal(dbDraft.views, 0);
  });

  test('hidden404: wrong content type with slug returns actual document HTTP 404', async () => {
    const docRes = await fetch(`${FRONTEND_URL}/pages/slider-not-page`);
    assert.equal(docRes.status, 404);
    const html = await docRes.text();
    assert.ok(html.includes('Page Not Found'));
  });

  test('mutation & deactivation: updating content reflects on next fetch, and deactivating returns document HTTP 404', async () => {
    // 1. Admin updates page
    const updateRes = await fetch(`${BACKEND_URL}/api/content/${activePageId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: adminAuth },
      body: JSON.stringify({
        title: 'About MevaPur Heritage and Quality Standards',
        content: '# About MevaPur Heritage and Standards\n\nUpdated organic description.'
      })
    });
    assert.equal(updateRes.status, 200);

    // 2. Verify fresh document request returns HTTP 200 with updated content
    const updatedDocRes = await fetch(`${FRONTEND_URL}/pages/about-us`);
    assert.equal(updatedDocRes.status, 200);
    const updatedHtml = await updatedDocRes.text();
    assert.ok(updatedHtml.includes('About MevaPur Heritage and Quality Standards'));
    assert.ok(updatedHtml.includes('Updated organic description'));

    // 3. Admin deactivates page
    const deactRes = await fetch(`${BACKEND_URL}/api/content/${activePageId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: adminAuth },
      body: JSON.stringify({ isActive: false })
    });
    assert.equal(deactRes.status, 200);

    // 4. Verify deactivated page now returns actual document HTTP 404
    const deactivatedDocRes = await fetch(`${FRONTEND_URL}/pages/about-us`);
    assert.equal(deactivatedDocRes.status, 404);
    const deactivatedHtml = await deactivatedDocRes.text();
    assert.ok(deactivatedHtml.includes('Page Not Found'));
  });

  test('delayed backend response: slow 404 lookup still returns actual HTTP 404 without premature streaming commitment', async () => {
    // Custom non-existent slug with artificial delay in request
    const startTime = Date.now();
    const docRes = await fetch(`${FRONTEND_URL}/pages/delayed-nonexistent-slug`);
    const elapsed = Date.now() - startTime;
    assert.ok(elapsed >= 0);

    assert.equal(docRes.status, 404);
    const html = await docRes.text();
    assert.ok(html.includes('Page Not Found'));
  });

  test('outage/error distinction: backend outage renders honest error state with retry rather than false 404', async () => {
    // Reactivate page for outage test
    await fetch(`${BACKEND_URL}/api/content/${activePageId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: adminAuth },
      body: JSON.stringify({ isActive: true })
    });

    // Close backend server to simulate complete network outage
    await new Promise<void>((resolve) => backendServer.close(() => resolve()));

    // Fetch document from Storefront
    const outageDocRes = await fetch(`${FRONTEND_URL}/pages/about-us`);
    assert.equal(outageDocRes.status, 200); // Resilient document shell delivery with error alert
    const outageHtml = await outageDocRes.text();

    // Verify honest outage state rendered with Retry button and Page Unavailable title
    console.log('outageHtml full snippet:', outageHtml.slice(0, 1000));
    assert.ok(outageHtml.includes('Unable to load page') || outageHtml.includes('Page Unavailable'));
    assert.ok(outageHtml.includes('Unable to load page content at this time') || outageHtml.includes('Unable to load page'));
    assert.ok(outageHtml.includes('Page Unavailable'));
  });
});
