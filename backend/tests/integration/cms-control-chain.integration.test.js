const crypto = require('crypto');
const request = require('supertest');
const app = require('../../app');
const TokenService = require('../../services/TokenService');
const Session = require('../../models/Session');

let sequence = 0;

const adminAuthorization = async () => {
  sequence += 1;
  const user = await global.createTestUser({
    email: `cms-chain-admin-${sequence}@example.test`,
    role: 'admin'
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
    const auth = await adminAuthorization();

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

  test('strictly excludes draft and scheduled out-of-boundary records from public endpoints', async () => {
    const auth = await adminAuthorization();

    // Create a draft page (isActive: false)
    await request(app)
      .post('/api/content')
      .set('Authorization', auth)
      .send({
        type: 'page',
        title: 'Confidential Internal Policy',
        slug: 'internal-draft',
        content: 'Draft content that must never be visible to shoppers.',
        isActive: false
      });

    const draftPageLookup = await request(app).get('/api/content/slug/internal-draft');
    expect(draftPageLookup.status).toBe(404);

    // Create a banner scheduled in the future
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await request(app)
      .post('/api/content')
      .set('Authorization', auth)
      .send({
        type: 'banner',
        title: 'Future Black Friday Sale',
        startDate: tomorrow,
        isActive: true
      });

    // Create a banner expired in the past
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await request(app)
      .post('/api/content')
      .set('Authorization', auth)
      .send({
        type: 'banner',
        title: 'Expired Flash Sale',
        endDate: yesterday,
        isActive: true
      });

    const publicBanners = await request(app).get('/api/content/public/banner');
    expect(publicBanners.status).toBe(200);
    expect(publicBanners.body.data).toEqual([]);
  });

  test('maintains stable position ordering across public collection queries', async () => {
    const auth = await adminAuthorization();

    await request(app)
      .post('/api/content')
      .set('Authorization', auth)
      .send({
        type: 'slider',
        title: 'Second Slide',
        position: 2,
        isActive: true
      });

    await request(app)
      .post('/api/content')
      .set('Authorization', auth)
      .send({
        type: 'slider',
        title: 'First Slide',
        position: 1,
        isActive: true
      });

    await request(app)
      .post('/api/content')
      .set('Authorization', auth)
      .send({
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
