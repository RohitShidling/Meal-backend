const swaggerJsDoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Meal Subscription OTP API',
      version: '1.0.0',
      description: 'Industrial level backend for Admin and Client OTP Service',
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        Order: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'ORD-123' },
            client_id: { type: 'string', example: 'P-45' },
            subscription_id: { type: 'string', example: 'SUB-1' },
            entity_type: { type: 'string', enum: ['child', 'teacher', 'professional'] },
            entity_id: { type: 'string', example: 'CH-88' },
            amount: { type: 'number', example: 499.00 },
            status: { type: 'string', enum: ['pending', 'completed', 'failed', 'cancelled'] },
            created_at: { type: 'string', format: 'date-time' }
          }
        },
        Transaction: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'TXN-789' },
            merchant_transaction_id: { type: 'string' },
            gateway_transaction_id: { type: 'string' },
            amount: { type: 'number' },
            status: { type: 'string', enum: ['pending', 'success', 'failure'] },
            created_at: { type: 'string', format: 'date-time' }
          }
        }
      }
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: [
    './src/client/routes/*.js',
    './src/admin/routes/*.js',
    './src/common/routes/*.js'
  ],
};

const specs = swaggerJsDoc(options);

module.exports = {
  swaggerUi,
  specs,
};
