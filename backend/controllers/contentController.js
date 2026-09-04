const Content = require('../models/Content');
const { logActivity } = require('../middleware/activityLogger');
const ContentPublicationService = require('../services/ContentPublicationService');

// @desc    Get all content
// @route   GET /api/content
// @access  Private/Admin
exports.getContent = async (req, res) => {
  try {
    const { type, search, isActive } = req.query;

    let query = {};

    if (type) query.type = type;
    if (isActive !== undefined) query.isActive = isActive === 'true';

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { slug: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const content = await Content.find(query).sort({ position: 1, createdAt: -1 });

    res.json({
      success: true,
      data: content
    });
  } catch (error) {
    console.error('Get content error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get single content by ID
// @route   GET /api/content/:id
// @access  Private/Admin
exports.getSingleContent = async (req, res) => {
  try {
    const content = await Content.findById(req.params.id);

    if (!content) {
      return res.status(404).json({
        success: false,
        message: 'Content not found'
      });
    }

    res.json({
      success: true,
      data: content
    });
  } catch (error) {
    console.error('Get content error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get content by slug
// @route   GET /api/content/slug/:slug
// @access  Public
exports.getContentBySlug = async (req, res) => {
  try {
    const { slug } = req.params;

    if (!ContentPublicationService.isValidSlug(slug)) {
      return res.status(404).json({
        success: false,
        message: 'Content not found'
      });
    }

    const now = new Date();
    const query = ContentPublicationService.buildPublicationQuery({
      slug: slug.toLowerCase().trim(),
      type: 'page',
      referenceDate: now
    });

    const content = await Content.findOne(query).select(ContentPublicationService.PUBLIC_PROJECTION);

    if (!content) {
      return res.status(404).json({
        success: false,
        message: 'Content not found'
      });
    }

    // Atomically increment views only after successful publication filter
    await Content.updateOne({ _id: content._id }, { $inc: { views: 1 } });
    content.views += 1;

    res.json({
      success: true,
      data: content
    });
  } catch (error) {
    console.error('Get content by slug error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Create content
// @route   POST /api/content
// @access  Private/Admin
exports.createContent = async (req, res) => {
  try {
    const { startDate, endDate } = req.body;

    try {
      ContentPublicationService.validateSchedule({ startDate, endDate });
    } catch (schedErr) {
      return res.status(400).json({
        success: false,
        message: schedErr.message
      });
    }

    const contentData = {
      ...req.body,
      slug: req.body.slug || req.body.title.toLowerCase().replace(/ /g, '-').replace(/[^\w-]+/g, '')
    };

    const content = await Content.create(contentData);

    await logActivity(req, 'CONTENT_CREATE', 
      `Created ${content.type}: ${content.title}`, 
      { contentId: content._id, type: content.type }
    );

    res.status(201).json({
      success: true,
      message: 'Content created successfully',
      data: content
    });
  } catch (error) {
    console.error('Create content error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Update content
// @route   PUT /api/content/:id
// @access  Private/Admin
exports.updateContent = async (req, res) => {
  try {
    const existing = await Content.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Content not found'
      });
    }

    const { startDate, endDate } = req.body;
    try {
      ContentPublicationService.validateSchedule({
        startDate,
        endDate,
        existingStartDate: existing.startDate,
        existingEndDate: existing.endDate
      });
    } catch (schedErr) {
      return res.status(400).json({
        success: false,
        message: schedErr.message
      });
    }

    const content = await Content.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    await logActivity(req, 'CONTENT_UPDATE', 
      `Updated ${content.type}: ${content.title}`, 
      { contentId: content._id }
    );

    res.json({
      success: true,
      message: 'Content updated successfully',
      data: content
    });
  } catch (error) {
    console.error('Update content error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Delete content
// @route   DELETE /api/content/:id
// @access  Private/Admin
exports.deleteContent = async (req, res) => {
  try {
    const content = await Content.findByIdAndDelete(req.params.id);

    if (!content) {
      return res.status(404).json({
        success: false,
        message: 'Content not found'
      });
    }

    await logActivity(req, 'CONTENT_DELETE', 
      `Deleted ${content.type}: ${content.title}`, 
      { contentId: content._id }
    );

    res.json({
      success: true,
      message: 'Content deleted successfully'
    });
  } catch (error) {
    console.error('Delete content error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get content statistics
// @route   GET /api/content/stats
// @access  Private/Admin
exports.getContentStats = async (req, res) => {
  try {
    const totalContent = await Content.countDocuments();
    const activeContent = await Content.countDocuments({ isActive: true });
    const inactiveContent = await Content.countDocuments({ isActive: false });
    
    const banners = await Content.countDocuments({ type: 'banner' });
    const sliders = await Content.countDocuments({ type: 'slider' });
    const pages = await Content.countDocuments({ type: 'page' });
    const blogs = await Content.countDocuments({ type: 'blog' });

    res.json({
      success: true,
      data: {
        totalContent,
        activeContent,
        inactiveContent,
        banners,
        sliders,
        pages,
        blogs
      }
    });
  } catch (error) {
    console.error('Content stats error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get public content by type
// @route   GET /api/content/public/:type
// @access  Public
exports.getPublicContent = async (req, res) => {
  try {
    const { type } = req.params;

    if (!ContentPublicationService.isValidContentType(type)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid content type'
      });
    }

    const now = new Date();
    const query = ContentPublicationService.buildPublicationQuery({
      type,
      referenceDate: now
    });

    const content = await Content.find(query)
      .select(ContentPublicationService.PUBLIC_PROJECTION)
      .sort(ContentPublicationService.PUBLIC_CONTENT_SORT);

    res.json({
      success: true,
      data: content
    });
  } catch (error) {
    console.error('Get public content error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};