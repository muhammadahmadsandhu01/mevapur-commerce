const crypto = require('crypto');
const request = require('supertest');
const app = require('../../app');
const TokenService = require('../../services/TokenService');
const Session = require('../../models/Session');
const Content = require('../../models/Content');

let sequence = 0;

const createAuthToken = async (role = 'admin') => {
  sequence += 1;
  const user = await global.createTestUser({
    email: `cms-chain-${role}-${sequence}@example.test`,
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

describe('CMS Admin-to-Storefront Content Control Chain Integration Tests', () => {
  test('executes complete control chain: Admin create -> Public retrieval -> Admin update -> Visibility removal', async () => {
    const auth = await createAuthToken('admin');

    // 1. Admin creates a Slider
    const sliderRes = await request(app)
      .post('/api/content')
      .set('Authorization', auth)
      .send({
        type: 'slider',
        title: 'Fresh Harvest 2026',
        subtitle: 'Organic Almonds & Walnuts',
        description: 'Directly sourced from northern orchards.',
        image: 'https://images.example.test/hero-slider.jpg',
        button: { text: 'Shop Harvest', link: '/products?category=dry-fruits' },
        position: 1,
        isActive: true
      });
    expect(sliderRes.status).toBe(201);
    const sliderId = sliderRes.body.data._id;
    expect(sliderId).toBeDefined();

    // 2. Admin creates a Banner
    const bannerRes = await request(app)
      .post('/api/content')
      .set('Authorization', auth)
      .send({
        type: 'banner',
        title: 'Free Shipping Over Rs. 2,500',
        subtitle: 'Special weekend offer',
        image: 'https://images.example.test/banner.jpg',
        position: 1,
        isActive: true
      });
    expect(bannerRes.status).toBe(201);
    const bannerId = bannerRes.body.data._id;
    expect(bannerId).toBeDefined();

    // 3. Admin creates a CMS Page
    const pageRes = await request(app)
      .post('/api/content')
      .set('Authorization', auth)
      .send({
        type: 'page',
        title: 'About MevaPur Heritage',
        slug: 'about-us',
        content: '# MevaPur Heritage\n\nWe provide 100% natural, single-origin dry fruits.\n\n- Organic\n- Lab Tested',
        seo: {
          metaTitle: 'About MevaPur Heritage - Organic Dry Fruits',
          metaDescription: 'Learn about our natural sourcing and quality standards.'
        },
        position: 1,
        isActive: true
      });
    expect(pageRes.status).toBe(201);
    const pageId = pageRes.body.data._id;
    expect(pageId).toBeDefined();

    // 4. Verify Public Retrieval of Slider
    const publicSliders = await request(app).get('/api/content/public/slider');
    expect(publicSliders.status).toBe(200);
    expect(publicSliders.body.success).toBe(true);
    expect(publicSliders.body.data).toHaveLength(1);
    expect(publicSliders.body.data[0]).toMatchObject({
      type: 'slider',
      title: 'Fresh Harvest 2026',
      subtitle: 'Organic Almonds & Walnuts',
      isActive: true
    });

    // 5. Verify Public Retrieval of Banner
    const publicBanners = await request(app).get('/api/content/public/banner');
    expect(publicBanners.status).toBe(200);
    expect(publicBanners.body.success).toBe(true);
    expect(publicBanners.body.data).toHaveLength(1);
    expect(publicBanners.body.data[0]).toMatchObject({
      type: 'banner',
      title: 'Free Shipping Over Rs. 2,500',
      isActive: true
    });

    // 6. Verify Public Retrieval of Page by Slug
    const publicPage = await request(app).get('/api/content/slug/about-us');
    expect(publicPage.status).toBe(200);
    expect(publicPage.body.success).toBe(true);
    expect(publicPage.body.data).toMatchObject({
      type: 'page',
      title: 'About MevaPur Heritage',
      slug: 'about-us',
      isActive: true
    });
    expect(publicPage.body.data.content).toContain('# MevaPur Heritage');
    expect(publicPage.body.data.views).toBe(1);

    // 7. Admin updates Page Content
    const updateRes = await request(app)
      .put(`/api/content/${pageId}`)
      .set('Authorization', auth)
      .send({
        title: 'About MevaPur Heritage & Quality Standards',
        content: '# MevaPur Heritage & Quality\n\nUpdated organic description.'
      });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.title).toBe('About MevaPur Heritage & Quality Standards');

    // 8. Verify Updated Content reflects immediately upon Public Retrieval
    const updatedPublicPage = await request(app).get('/api/content/slug/about-us');
    expect(updatedPublicPage.status).toBe(200);
    expect(updatedPublicPage.body.data.title).toBe('About MevaPur Heritage & Quality Standards');
    expect(updatedPublicPage.body.data.content).toContain('# MevaPur Heritage & Quality');

    // 9. Admin deactivates Page (Unpublish)
    const deactivatePage = await request(app)
      .put(`/api/content/${pageId}`)
      .set('Authorization', auth)
      .send({ isActive: false });
    expect(deactivatePage.status).toBe(200);
    expect(deactivatePage.body.data.isActive).toBe(false);

    // 10. Verify Deactivated Page returns 404
    const deactivatedPublicPage = await request(app).get('/api/content/slug/about-us');
    expect(deactivatedPublicPage.status).toBe(404);

    // 11. Admin deactivates Banner
    const deactivateBanner = await request(app)
      .put(`/api/content/${bannerId}`)
      .set('Authorization', auth)
      .send({ isActive: false });
    expect(deactivateBanner.status).toBe(200);

    // 12. Verify Deactivated Banner is excluded from Public list
    const bannersAfterDeactivation = await request(app).get('/api/content/public/banner');
    expect(bannersAfterDeactivation.status).toBe(200);
    expect(bannersAfterDeactivation.body.data).toEqual([]);
  });

  test('enforces temporal publication windows and boundary semantics across collection and slug endpoints', async () => {
    const auth = await createAuthToken('admin');
    const now = Date.now();

    // 1. Active content with open bounds (missing dates)
    await request(app).post('/api/content').set('Authorization', auth).send({
      type: 'banner',
      title: 'Always Active Open Bounds',
      isActive: true
    });

    // 2. Active content with explicit null dates
    await request(app).post('/api/content').set('Authorization', auth).send({
      type: 'banner',
      title: 'Explicit Null Bounds',
      startDate: null,
      endDate: null,
      isActive: true
    });

    // 3. Past start with no end (visible)
    await request(app).post('/api/content').set('Authorization', auth).send({
      type: 'banner',
      title: 'Past Start No End',
      startDate: new Date(now - 3600000),
      isActive: true
    });

    // 4. Inside valid bounded window (visible)
    await request(app).post('/api/content').set('Authorization', auth).send({
      type: 'banner',
      title: 'Inside Bounded Window',
      startDate: new Date(now - 3600000),
      endDate: new Date(now + 3600000),
      isActive: true
    });

    // 5. Future start with no end (hidden - old duplicate $or bug allowed this!)
    await request(app).post('/api/content').set('Authorization', auth).send({
      type: 'banner',
      title: 'Future Start No End',
      startDate: new Date(now + 86400000),
      isActive: true
    });

    // 6. Expired end with no start (hidden)
    await request(app).post('/api/content').set('Authorization', auth).send({
      type: 'banner',
      title: 'Expired End No Start',
      endDate: new Date(now - 86400000),
      isActive: true
    });

    // 7. Inactive within valid window (hidden)
    await request(app).post('/api/content').set('Authorization', auth).send({
      type: 'banner',
      title: 'Inactive In Valid Window',
      startDate: new Date(now - 3600000),
      endDate: new Date(now + 3600000),
      isActive: false
    });

    // Query public banners: only 4 valid active records must be returned
    const bannersRes = await request(app).get('/api/content/public/banner');
    expect(bannersRes.status).toBe(200);
    const titles = bannersRes.body.data.map(b => b.title);
    expect(titles).toContain('Always Active Open Bounds');
    expect(titles).toContain('Explicit Null Bounds');
    expect(titles).toContain('Past Start No End');
    expect(titles).toContain('Inside Bounded Window');
    expect(titles).not.toContain('Future Start No End');
    expect(titles).not.toContain('Expired End No Start');
    expect(titles).not.toContain('Inactive In Valid Window');
    expect(bannersRes.body.data).toHaveLength(4);

    // Test CMS Page temporal boundary via slug endpoint
    // A. Future scheduled page -> 404
    await request(app).post('/api/content').set('Authorization', auth).send({
      type: 'page',
      title: 'Future Policy Page',
      slug: 'future-policy',
      content: 'This policy is not yet effective.',
      startDate: new Date(now + 86400000),
      isActive: true
    });
    const futurePageRes = await request(app).get('/api/content/slug/future-policy');
    expect(futurePageRes.status).toBe(404);

    // B. Expired page -> 404
    await request(app).post('/api/content').set('Authorization', auth).send({
      type: 'page',
      title: 'Expired Event Page',
      slug: 'expired-event',
      content: 'This event has concluded.',
      endDate: new Date(now - 86400000),
      isActive: true
    });
    const expiredPageRes = await request(app).get('/api/content/slug/expired-event');
    expect(expiredPageRes.status).toBe(404);

    // C. Valid active page -> 200
    await request(app).post('/api/content').set('Authorization', auth).send({
      type: 'page',
      title: 'Active Current Policy',
      slug: 'current-policy',
      content: 'This policy is currently active.',
      startDate: new Date(now - 3600000),
      endDate: new Date(now + 3600000),
      isActive: true
    });
    const activePageRes = await request(app).get('/api/content/slug/current-policy');
    expect(activePageRes.status).toBe(200);
    expect(activePageRes.body.data.title).toBe('Active Current Policy');
  });

  test('enforces slug endpoint isolation, validation, safe projection and view-count protection', async () => {
    const auth = await createAuthToken('admin');

    // 1. Create a non-page content with a slug (e.g., banner)
    const banner = await Content.create({
      type: 'banner',
      title: 'Hero Promo Banner',
      slug: 'promo-banner-slug',
      isActive: true,
      views: 0
    });

    // Public lookup via /api/content/slug/:slug must return 404 because type !== 'page'
    const nonPageRes = await request(app).get('/api/content/slug/promo-banner-slug');
    expect(nonPageRes.status).toBe(404);

    // Verify view count was NOT incremented on non-page content
    const unmutatedBanner = await Content.findById(banner._id);
    expect(unmutatedBanner.views).toBe(0);

    // 2. Test invalid slug syntax
    const invalidSlugRes1 = await request(app).get('/api/content/slug/INVALID_SLUG!');
    expect(invalidSlugRes1.status).toBe(404);

    const invalidSlugRes2 = await request(app).get('/api/content/slug/bad--slug');
    expect(invalidSlugRes2.status).toBe(404);

    // 3. Test non-existent slug
    const notFoundRes = await request(app).get('/api/content/slug/does-not-exist');
    expect(notFoundRes.status).toBe(404);

    // 4. Test view count behavior on hidden / draft page
    const draftPage = await Content.create({
      type: 'page',
      title: 'Secret Internal Page',
      slug: 'secret-page',
      content: 'Super secret draft',
      isActive: false,
      views: 0
    });

    const draftLookupRes = await request(app).get('/api/content/slug/secret-page');
    expect(draftLookupRes.status).toBe(404);

    const unmutatedDraft = await Content.findById(draftPage._id);
    expect(unmutatedDraft.views).toBe(0);

    // 5. Successful page lookup increments view count exactly by 1
    const livePage = await Content.create({
      type: 'page',
      title: 'FAQ Page',
      slug: 'faq',
      content: 'Frequently Asked Questions',
      isActive: true,
      views: 5
    });

    const liveLookup1 = await request(app).get('/api/content/slug/faq');
    expect(liveLookup1.status).toBe(200);
    expect(liveLookup1.body.data.views).toBe(6);

    const liveLookup2 = await request(app).get('/api/content/slug/faq');
    expect(liveLookup2.status).toBe(200);
    expect(liveLookup2.body.data.views).toBe(7);

    const dbLivePage = await Content.findById(livePage._id);
    expect(dbLivePage.views).toBe(7);
  });

  test('validates schedule mutations on create and partial update', async () => {
    const auth = await createAuthToken('admin');

    // 1. Create with startDate > endDate -> 400
    const invalidCreate = await request(app)
      .post('/api/content')
      .set('Authorization', auth)
      .send({
        type: 'banner',
        title: 'Reversed Schedule Banner',
        startDate: '2026-12-31T00:00:00Z',
        endDate: '2026-01-01T00:00:00Z',
        isActive: true
      });
    expect(invalidCreate.status).toBe(400);
    expect(invalidCreate.body.message).toContain('startDate cannot be later than endDate');

    // 2. Create with invalid date string -> 400
    const malformedDate = await request(app)
      .post('/api/content')
      .set('Authorization', auth)
      .send({
        type: 'banner',
        title: 'Malformed Date Banner',
        startDate: 'not-a-valid-date',
        isActive: true
      });
    expect(malformedDate.status).toBe(400);
    expect(malformedDate.body.message).toContain('Invalid date format');

    // 3. Create a valid record
    const validCreate = await request(app)
      .post('/api/content')
      .set('Authorization', auth)
      .send({
        type: 'banner',
        title: 'Scheduled Promo Banner',
        startDate: '2026-06-01T00:00:00Z',
        endDate: '2026-06-30T23:59:59Z',
        isActive: true
      });
    expect(validCreate.status).toBe(201);
    const contentId = validCreate.body.data._id;

    // 4. Partial update: change endDate to be earlier than existing startDate -> 400
    const badEndUpdate = await request(app)
      .put(`/api/content/${contentId}`)
      .set('Authorization', auth)
      .send({
        endDate: '2026-05-15T00:00:00Z'
      });
    expect(badEndUpdate.status).toBe(400);
    expect(badEndUpdate.body.message).toContain('startDate cannot be later than endDate');

    // 5. Partial update: change startDate to be later than existing endDate -> 400
    const badStartUpdate = await request(app)
      .put(`/api/content/${contentId}`)
      .set('Authorization', auth)
      .send({
        startDate: '2026-07-15T00:00:00Z'
      });
    expect(badStartUpdate.status).toBe(400);
    expect(badStartUpdate.body.message).toContain('startDate cannot be later than endDate');

    // 6. Valid partial update -> 200
    const validUpdate = await request(app)
      .put(`/api/content/${contentId}`)
      .set('Authorization', auth)
      .send({
        endDate: '2026-07-31T23:59:59Z'
      });
    expect(validUpdate.status).toBe(200);
    expect(new Date(validUpdate.body.data.endDate).toISOString()).toBe('2026-07-31T23:59:59.000Z');
  });

  test('validates public content type parameter and denies unauthorized mutations', async () => {
    // 1. Invalid public content type -> 400
    const invalidType = await request(app).get('/api/content/public/invalid-type');
    expect(invalidType.status).toBe(400);
    expect(invalidType.body.message).toBe('Invalid content type');

    // 2. Unauthorized caller cannot create content -> 401
    const anonCreate = await request(app)
      .post('/api/content')
      .send({
        type: 'banner',
        title: 'Hacker Banner',
        isActive: true
      });
    expect(anonCreate.status).toBe(401);

    // 3. Customer role cannot create content -> 403
    const customerAuth = await createAuthToken('customer');
    const customerCreate = await request(app)
      .post('/api/content')
      .set('Authorization', customerAuth)
      .send({
        type: 'banner',
        title: 'Customer Banner',
        isActive: true
      });
    expect(customerCreate.status).toBe(403);
  });

  test('maintains stable deterministic position ordering across public collection queries', async () => {
    const auth = await createAuthToken('admin');

    await request(app).post('/api/content').set('Authorization', auth).send({
      type: 'slider',
      title: 'Second Slide',
      position: 2,
      isActive: true
    });

    await request(app).post('/api/content').set('Authorization', auth).send({
      type: 'slider',
      title: 'First Slide',
      position: 1,
      isActive: true
    });

    await request(app).post('/api/content').set('Authorization', auth).send({
      type: 'slider',
      title: 'Third Slide',
      position: 3,
      isActive: true
    });

    const sliders = await request(app).get('/api/content/public/slider');
    expect(sliders.status).toBe(200);
    expect(sliders.body.data.map(s => s.title)).toEqual([
      'First Slide',
      'Second Slide',
      'Third Slide'
    ]);
  });
});
