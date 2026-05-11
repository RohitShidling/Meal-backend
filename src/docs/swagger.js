const swaggerJsDoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

function ensureResponseContent(specs) {
  const apiSuccessRef = { $ref: '#/components/schemas/ApiSuccess' };
  const apiErrorRef = { $ref: '#/components/schemas/ApiError' };
  const pdfBinarySchema = { type: 'string', format: 'binary' };

  if (!specs.paths) return specs;

  for (const [, pathItem] of Object.entries(specs.paths)) {
    if (!pathItem || typeof pathItem !== 'object') continue;

    for (const [method, op] of Object.entries(pathItem)) {
      if (!op || typeof op !== 'object') continue;
      if (!['get', 'post', 'put', 'patch', 'delete', 'options', 'head'].includes(method)) continue;

      op.responses = op.responses || {};

      // If the operation has no responses at all, add safe defaults.
      if (Object.keys(op.responses).length === 0) {
        op.responses['200'] = { description: 'OK' };
        op.responses['500'] = { description: 'Internal Server Error' };
      }

      for (const [statusCode, response] of Object.entries(op.responses)) {
        if (!response || typeof response !== 'object') continue;

        const codeNum = Number(statusCode);
        const isSuccess = !Number.isNaN(codeNum) ? (codeNum >= 200 && codeNum < 300) : false;

        // Swagger shows "No response body" when content is missing.
        if (!response.content) {
          response.content = {
            'application/json': {
              schema: isSuccess ? apiSuccessRef : apiErrorRef,
            },
          };
        } else {
          // If content exists, make sure at least one schema is present.
          if (response.content['application/pdf'] && !response.content['application/pdf'].schema) {
            response.content['application/pdf'].schema = pdfBinarySchema;
          }
          if (response.content['application/json'] && !response.content['application/json'].schema) {
            response.content['application/json'].schema = isSuccess ? apiSuccessRef : apiErrorRef;
          }
        }
      }

      // Ensure common error responses exist for consistency in docs.
      const commonErrors = {
        '400': { description: 'Bad Request' },
        '401': { description: 'Unauthorized' },
        '403': { description: 'Forbidden' },
        '404': { description: 'Not Found' },
        '500': { description: 'Internal Server Error' },
      };

      for (const [code, def] of Object.entries(commonErrors)) {
        if (!op.responses[code]) {
          op.responses[code] = {
            ...def,
            content: {
              'application/json': {
                schema: apiErrorRef,
              },
            },
          };
        } else if (!op.responses[code].content) {
          op.responses[code].content = {
            'application/json': { schema: apiErrorRef },
          };
        }
      }
    }
  }

  return specs;
}

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
        url: process.env.SWAGGER_SERVER_URL || process.env.PUBLIC_API_BASE_URL || `http://localhost:${process.env.PORT || 3000}`,
        description: process.env.SWAGGER_SERVER_DESCRIPTION || 'API server',
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
        ApiSuccess: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string', nullable: true, example: 'OK' },
            count: { type: 'integer', nullable: true, example: 1 },
            data: {
              description: 'Response payload (object/array), depends on endpoint',
              oneOf: [{ type: 'object' }, { type: 'array' }, { type: 'string' }, { type: 'number' }, { type: 'boolean' }, { type: 'null' }],
            },
            alerts: {
              type: 'array',
              nullable: true,
              items: { type: 'object' },
            },
          },
          additionalProperties: true,
        },
        ApiError: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            status: { type: 'string', example: 'fail' },
            message: { type: 'string', example: 'Validation failed.' },
            errors: {
              type: 'array',
              nullable: true,
              items: { type: 'string' },
              example: ['phoneNumber is required.'],
            },
          },
          additionalProperties: true,
        },
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

const specs = ensureResponseContent(swaggerJsDoc(options));

module.exports = {
  swaggerUi,
  specs,
};
