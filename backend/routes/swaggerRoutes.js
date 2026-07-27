const express = require('express');
const router = express.Router();
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('../docs/swagger');
const { protect } = require('../middleware/authenticate');

// Public Swagger UI
router.use('/api-docs', swaggerUi.serve);
router.get('/api-docs', swaggerUi.setup(swaggerSpec, {
  explorer: true,
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'MevaPur API Docs'
}));

// Protected JSON Spec (Optional: Remove protect for public docs)
router.get('/docs.json', swaggerSpec);

module.exports = router;