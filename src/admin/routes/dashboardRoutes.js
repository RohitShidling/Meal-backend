const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const adminAuth = require('../middlewares/authMiddleware');

/**
 * @swagger
 * tags:
 *   name: Admin Dashboard
 *   description: High-performance dashboard analytics
 */

/**
 * @swagger
 * /api/admin/dashboard:
 *   get:
 *     summary: Get comprehensive dashboard statistics
 *     tags: [Admin Dashboard]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Success
 */
router.get('/', adminAuth, dashboardController.getDashboardStats);

module.exports = router;
