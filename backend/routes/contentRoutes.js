const express = require('express');
const router = express.Router();
const { protect, admin } = require('../middleware/auth');
const {
  getContent,
  getSingleContent,
  getContentBySlug,
  createContent,
  updateContent,
  deleteContent,
  getContentStats,
  getPublicContent
} = require('../controllers/contentController');

// Public routes
router.get('/public/:type', getPublicContent);
router.get('/slug/:slug', getContentBySlug);

// Protected admin routes
router.use(protect, admin);

router.get('/stats', getContentStats);
router.get('/', getContent);
router.get('/:id', getSingleContent);
router.post('/', createContent);
router.put('/:id', updateContent);
router.delete('/:id', deleteContent);

module.exports = router;