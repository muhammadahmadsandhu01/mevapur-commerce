const swaggerJsdoc = require('swagger-jsdoc');
const { getRuntimeConfig } = require('./runtime.config');

const runtimeConfig = getRuntimeConfig();

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'HARZAAR Commerce API',
      version: '1.0.0',
      description: 'REST API for the configurable HARZAAR multi-category commerce platform.',
    },
    servers: [
      {
        url: runtimeConfig.origins.backend,
        description: 'Configured API server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      }
    }
  },
  apis: ['./routes/*.js', './models/*.js'] // Paths to files containing annotations
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;
