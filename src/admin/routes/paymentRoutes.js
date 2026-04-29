const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const adminAuthMiddleware = require('../middlewares/authMiddleware');

/**
 * @swagger
 * tags:
 *   name: Admin Payment
 *   description: Payment tracking and analytics for Administrators
 */

router.use(adminAuthMiddleware);

/**
 * @swagger
 * /api/admin/payment/all:
 *   get:
 *     summary: View all payments with filtering and pagination
 *     tags: [Admin Payment]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: schoolId
 *         schema:
 *           type: string
 *         description: Filter by School ID
 *       - in: query
 *         name: entityType
 *         schema:
 *           type: string
 *           enum: [child, teacher, professional]
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, completed, failed, cancelled]
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: List of payments retrieved successfully
 */
router.get('/all', paymentController.getAllPayments);

/**
 * @swagger
 * /api/admin/payment/stats:
 *   get:
 *     summary: Get overall payment analytics and revenue stats
 *     tags: [Admin Payment]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Stats retrieved successfully
 */
router.get('/stats', paymentController.getPaymentStats);

module.exports = router;
