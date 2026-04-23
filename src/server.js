require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { initDB } = require('./common/database');
const { swaggerUi, specs } = require('./docs/swagger');

// Import routes
const clientAuthRoutes = require('./client/routes/authRoutes');
const adminAuthRoutes = require('./admin/routes/authRoutes');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
app.use('/api/admin/auth', adminAuthRoutes);

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} not found.`,
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled Error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error.',
    error: err.message,
  });
});

// Start Server & Init DB
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`\n🚀 Server running at http://localhost:${PORT}`);
  console.log(`📚 Swagger Docs available at http://localhost:${PORT}/api-docs`);
  
  // Initialize PostgreSQL database tables
  await initDB();
});
