process.env.DOTENVX_QUIET = '1';
require('dotenv').config({ quiet: true });
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { initDB } = require('./common/database');
const { swaggerUi, specs } = require('./docs/swagger');

// Import routes
const clientAuthRoutes = require('./client/routes/authRoutes');
const clientChildRoutes = require('./client/routes/childRoutes');
const adminAuthRoutes = require('./admin/routes/authRoutes');
const commonRoutes = require('./common/routes/commonRoutes');
const adminSchoolRoutes = require('./admin/routes/schoolRoutes');
const adminLookupRoutes = require('./admin/routes/lookupRoutes');

const app = express();

// Middleware
app.use(helmet()); // Security Headers
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// HTTP Logging (Industrial Standard)
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Global Rate Limiting (Industrial Standard)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per `window` (here, per 15 minutes)
  message: { success: false, message: 'Too many requests from this IP, please try again after 15 minutes' },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});
app.use('/api', limiter);

// Swagger Documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));

// Health Check
app.get('/', (req, res) => {
  res.json({
    status: 'running',
    message: 'Meal Subscription Backend API',
    version: '1.0.0',
    docs: '/api-docs',
  });
});

// Routes Mounting
app.use('/api/client/auth', clientAuthRoutes);
app.use('/api/client/children', clientChildRoutes);
app.use('/api/admin/auth', adminAuthRoutes);
app.use('/api/common', commonRoutes);
app.use('/api/admin/schools', adminSchoolRoutes);
app.use('/api/admin/lookup', adminLookupRoutes);

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} not found.`,
  });
});

// Global Error Handler (Industrial Standard)
app.use((err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  if (process.env.NODE_ENV === 'development') {
    console.error('Error:', err.message);
    res.status(err.statusCode).json({
      success: false,
      status: err.status,
      message: err.message
    });
  } else {
    // Production
    if (err.isOperational) {
      res.status(err.statusCode).json({
        success: false,
        status: err.status,
        message: err.message
      });
    } else {
      // Programming or other unknown error: don't leak error details
      console.error('ERROR:', err);
      res.status(500).json({
        success: false,
        status: 'error',
        message: 'Something went very wrong!'
      });
    }
  }
});

// Start Server & Init DB
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, async () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Swagger Docs available at http://localhost:${PORT}/api-docs`);
  
  // Initialize PostgreSQL database tables
  await initDB();
});

// Graceful Shutdown (Industrial Standard)
const gracefulShutdown = () => {
  console.log('\n🔄 Received kill signal, shutting down gracefully...');
  server.close(() => {
    console.log('🛑 Closed out remaining HTTP connections.');
    const { pool } = require('./common/database');
    if (pool) {
      pool.end(() => {
        console.log('🔌 PostgreSQL pool has ended.');
        process.exit(0);
      });
    } else {
      process.exit(0);
    }
  });

  // Force close if it takes too long (e.g., 10 seconds)
  setTimeout(() => {
    console.error('🚨 Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
};

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
