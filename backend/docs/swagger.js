const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'MevaPur Enterprise API',
      version: '1.0.0',
      description: 'Enterprise E-commerce Platform - Authentication & Security Module',
      contact: {
        name: 'API Support',
        email: 'support@mevapur.com'
      }
    },
    servers: [
      {
        url: 'http://localhost:5000/api/v1',
        description: 'Development Server'
      },
      {
        url: 'https://api.mevapur.com/api/v1',
        description: 'Production Server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter your JWT access token'
        },
        cookieAuth: {
          type: 'apiKey',
          in: 'cookie',
          name: 'refreshToken',
          description: 'Authentication via HttpOnly cookies'
        }
      },
      schemas: {
        User: {
          type: 'object',
          properties: {
            _id: { type: 'string', example: '60d5ecb5c7f6a92c8c3e4f1a' },
            fullName: { type: 'string', example: 'Ahmed Khan' },
            email: { type: 'string', example: 'ahmed@example.com' },
            phone: { type: 'string', example: '03001234567' },
            role: { type: 'string', enum: ['customer', 'support', 'admin'], example: 'customer' },
            isVerified: { type: 'boolean', example: true },
            createdAt: { type: 'string', format: 'date-time' },
            lastLogin: { type: 'string', format: 'date-time' }
          }
        },
        Error: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: {
              type: 'object',
              properties: {
                code: { type: 'string', example: 'AUTH_INVALID_CREDENTIALS' },
                message: { type: 'string', example: 'Invalid email or password' }
              }
            }
          }
        },
        LoginRequest: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email', example: 'user@example.com' },
            password: { type: 'string', minLength: 8, example: 'SecurePass123!' }
          }
        },
        RegisterRequest: {
          type: 'object',
          required: ['fullName', 'email', 'password'],
          properties: {
            fullName: { type: 'string', minLength: 3, example: 'Ahmed Khan' },
            email: { type: 'string', format: 'email', example: 'ahmed@example.com' },
            password: { type: 'string', minLength: 12, example: 'SecurePass123!' },
            phone: { type: 'string', pattern: '^03\\d{9}$', example: '03001234567' }
          }
        }
      }
    },
    tags: [
      { name: 'Authentication', description: 'User registration, login, and token management' },
      { name: 'Session', description: 'Multi-device session management' },
      { name: 'Password', description: 'Password reset and recovery' },
      { name: 'User Profile', description: 'User profile operations' }
    ]
  },
  apis: [
    './backend/routes/*.js',
    './backend/controllers/*.js'
  ]
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;