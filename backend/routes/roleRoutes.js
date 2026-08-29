const express = require('express');
const { protect, admin } = require('../middleware/auth');
const { getRoles } = require('../controllers/roleController');

const router = express.Router();

router.get('/', protect, admin, getRoles);

module.exports = router;
