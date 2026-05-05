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
const clientSchoolRoutes = require('./client/routes/schoolRoutes');
const adminAuthRoutes = require('./admin/routes/authRoutes');
const adminSchoolRoutes = require('./admin/routes/schoolRoutes');
const adminMasterDataRoutes = require('./admin/routes/masterDataRoutes');
const adminMasterDataReadRoutes = require('./admin/routes/masterDataReadRoutes');
const adminMenuRoutes = require('./admin/routes/menuRoutes');
const commonMenuRoutes = require('./common/routes/menuRoutes');
const commonRoutes = require('./common/routes/commonRoutes');
const commonMasterDataRoutes = require('./common/routes/masterDataRoutes');
const commonProfileRoutes = require('./common/routes/profileRoutes');
const adminSubscriptionRoutes = require('./admin/routes/subscriptionRoutes');
const adminSubscriptionAnalyticsRoutes = require('./admin/routes/subscriptionAnalyticsRoutes');
const commonSubscriptionRoutes = require('./common/routes/subscriptionRoutes');
const clientSubscriptionRoutes = require('./client/routes/subscriptionRoutes');
const adminCorporateLocationRoutes = require('./admin/routes/corporateLocationRoutes');
const commonCorporateLocationRoutes = require('./common/routes/corporateLocationRoutes');
const clientProfessionalRoutes = require('./client/routes/professionalRoutes');
const clientParentRoutes = require('./client/routes/parentRoutes');
const clientTeacherRoutes = require('./client/routes/teacherRoutes');
const clientPaymentRoutes = require('./client/routes/paymentRoutes');
const clientCartRoutes = require('./client/routes/cartRoutes');
const adminPaymentRoutes = require('./admin/routes/paymentRoutes');
const adminHomepageRoutes = require('./admin/routes/homepageRoutes');
const commonHomepageRoutes = require('./common/routes/homepageRoutes');
const adminEntityRoutes = require('./admin/routes/entityRoutes');
const commonEntityRoutes = require('./common/routes/entityRoutes');
const clientMealRoutes = require('./client/routes/mealRoutes');
const clientMenuNutritionRoutes = require('./client/routes/menuNutritionRoutes');
const adminMealRoutes = require('./admin/routes/mealRoutes');
const adminDashboardRoutes = require('./admin/routes/dashboardRoutes');
const adminTrialPlanRoutes = require('./admin/routes/trialPlanRoutes');
const adminSubscriptionPlanDurationRoutes = require('./admin/routes/subscriptionPlanDurationRoutes');
const commonSubscriptionPlanDurationRoutes = require('./common/routes/subscriptionPlanDurationRoutes');
const adminMenuNutritionRoutes = require('./admin/routes/menuNutritionRoutes');
const adminTrialPlanFeatureRoutes = require('./admin/routes/trialPlanFeatureRoutes');

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
  max: 1000, // Limit each IP to 1000 requests per `window` (here, per 15 minutes)
  message: { success: false, message: 'Too many requests from this IP, please try again after 15 minutes' },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// Apply rate limiting to client and common routes
app.use('/api/client', limiter);
app.use('/api/common', limiter);

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
app.use('/api/client/schools', clientSchoolRoutes);
app.use('/api/admin/auth', adminAuthRoutes);
app.use('/api/common', commonRoutes);
app.use('/api/admin/schools', adminSchoolRoutes);
app.use('/api/admin/lookup', adminMasterDataRoutes);
app.use('/api/admin/lookup', adminMasterDataReadRoutes);
app.use('/api/admin/menu', adminMenuRoutes);
app.use('/api/common/menu', commonMenuRoutes);
app.use('/api/admin/subscriptions', adminSubscriptionRoutes);
app.use('/api/admin/subscriptions', adminSubscriptionAnalyticsRoutes);
app.use('/api/common/subscriptions', commonSubscriptionRoutes);
app.use('/api/client/subscriptions', clientSubscriptionRoutes);
app.use('/api/admin/trial-plans', adminTrialPlanRoutes);
app.use('/api/common/subscriptions', commonSubscriptionRoutes);
app.use('/api/common/lookup', commonMasterDataRoutes);
app.use('/api/common/profile', commonProfileRoutes);
app.use('/api/admin/corporate-locations', adminCorporateLocationRoutes);
app.use('/api/common/corporate-locations', commonCorporateLocationRoutes);
app.use('/api/client/professional', clientProfessionalRoutes);
app.use('/api/client/parent', clientParentRoutes);
app.use('/api/client/teacher', clientTeacherRoutes);
app.use('/api/client/payment', clientPaymentRoutes);
app.use('/api/client/cart', clientCartRoutes);
app.use('/api/client/meals', clientMealRoutes);
app.use('/api/client/menu-nutrition', clientMenuNutritionRoutes);
app.use('/api/admin/meals', adminMealRoutes);
app.use('/api/admin/payment', adminPaymentRoutes);
app.use('/api/admin/homepage', adminHomepageRoutes);
app.use('/api/common/homepage', commonHomepageRoutes);
app.use('/api/admin/entities', adminEntityRoutes);
app.use('/api/common/entities', commonEntityRoutes);
app.use('/api/admin/dashboard', adminDashboardRoutes);
app.use('/api/admin/subscription-plan-days', adminSubscriptionPlanDurationRoutes);
app.use('/api/common/subscription-plan-days', commonSubscriptionPlanDurationRoutes);
app.use('/api/admin/menu-nutrition', adminMenuNutritionRoutes);
app.use('/api/admin/trial-plan-features', adminTrialPlanFeatureRoutes);

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
  
  const normalizedErrors =
    Array.isArray(err.details) ? err.details
    : (typeof err.message === 'string' && err.message.includes(' | ')) ? err.message.split(' | ').map(s => s.trim()).filter(Boolean)
    : undefined;

  if (process.env.NODE_ENV === 'development') {
    console.error('Error:', err.message);
    res.status(err.statusCode).json({
      success: false,
      status: err.status,
      message: err.message,
      ...(normalizedErrors ? { errors: normalizedErrors } : {})
    });
  } else {
    // Production
    if (err.isOperational) {
      res.status(err.statusCode).json({
        success: false,
        status: err.status,
        message: err.message,
        ...(normalizedErrors ? { errors: normalizedErrors } : {})
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
const server = app.listen(PORT,"0.0.0.0", async () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Swagger Docs available at http://localhost:${PORT}/api-docs`);

  await initDB();
});


app.get('/health', (req,res)=>{
  res.json({status:'ok'});
});

// Graceful Shutdown (Industrial Standard)
const gracefulShutdown = () => {
  console.log('\nReceived kill signal, shutting down gracefully...');
  server.close(() => {
    console.log('Closed out remaining HTTP connections.');
    const { pool } = require('./common/database');
    if (pool) {
      pool.end(() => {
        console.log('PostgreSQL pool has ended.');
        process.exit(0);
      });
    } else {
      process.exit(0);
    }
  });

  // Force close if it takes too long (e.g., 10 seconds)
  setTimeout(() => {
    console.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
};

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
