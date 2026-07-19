const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'MevaPur E-Commerce API',
      version: '1.0.0',
      description: 'Professional REST API for MevaPur Fresh Fruits & Vegetables Store. Includes Auth, Products, Orders, and Admin features.',
      contact: {
        name: 'MevaPur Support',
        email: 'support@mevapur.com'
      }
    },
    servers: [
      {
        url: 'http://localhost:5000',
        description: 'Development Server'
      },
      {
        url: 'https://api.mevapur.com',
        description: 'Production Server'
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