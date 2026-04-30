const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const adminAuthMiddleware = require('../middlewares/authMiddleware');

/**
 * @swagger
 * tags:
 *   name: Admin - Payment
 *   description: Payment tracking and analytics for Administrators
 */

router.use(adminAuthMiddleware);

/**
 * @swagger
 * /api/admin/payment/all:
 *   get:
 *     summary: View all payments with filtering and pagination
 *     tags: [Admin - Payment]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: entityType
 *         schema:
 *           type: string
 *           enum: [child, teacher, professional]
 *         description: Filter by entity type
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, completed, failed, cancelled]
 *         description: Filter by order status
 *       - in: query
 *         name: schoolId
 *         schema:
 *           type: string
 *         description: Filter children payments by school ID
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *           example: "2026-04-01"
 *         description: Start date filter (inclusive)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *           example: "2026-04-30"
 *         description: End date filter (inclusive)
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
 *         description: Payments retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                       example: 50
 *                     page:
 *                       type: integer
 *                       example: 1
 *                     limit:
 *                       type: integer
 *                       example: 10
 *                     totalPages:
 *                       type: integer
 *                       example: 5
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       order_id:
 *                         type: string
 *                         example: "ORD-1"
 *                       order_status:
 *                         type: string
 *                         example: "completed"
 *                       order_type:
 *                         type: string
 *                         example: "single"
 *                       amount:
 *                         type: number
 *                         example: 800.00
 *                       entity_type:
 *                         type: string
 *                         example: "child"
 *                       entity_name:
 *                         type: string
 *                         example: "Raju"
 *                       school_name:
 *                         type: string
 *                         example: "Delhi Public School"
 *                       client_phone:
 *                         type: string
 *                         example: "+919876543210"
 *                       subscription_name:
 *                         type: string
 *                         example: "Monthly Plan"
 *                       merchant_transaction_id:
 *                         type: string
 *                         example: "TXN_1_1714390000000"
 *                       payment_status:
 *                         type: string
 *                         example: "success"
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *       401:
 *         description: Unauthorized — Admin token required
 */
router.get('/all', paymentController.getAllPayments);

/**
 * @swagger
 * /api/admin/payment/stats:
 *   get:
 *     summary: Get overall payment analytics, revenue by entity type, and recent payments
 *     tags: [Admin - Payment]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Payment stats retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     overall:
 *                       type: object
 *                       properties:
 *                         total_orders:
 *                           type: string
 *                           example: "50"
 *                         total_revenue:
 *                           type: string
 *                           example: "40000.00"
 *                         pending_orders:
 *                           type: string
 *                           example: "5"
 *                         failed_orders:
 *                           type: string
 *                           example: "2"
 *                         completed_orders:
 *                           type: string
 *                           example: "43"
 *                     byEntityType:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           entity_type:
 *                             type: string
 *                             example: "child"
 *                           order_count:
 *                             type: string
 *                             example: "30"
 *                           revenue:
 *                             type: string
 *                             example: "24000.00"
 *                     recentPayments:
 *                       type: array
 *                       description: Last 10 completed payments
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                             example: "ORD-24"
 *                           amount:
 *                             type: number
 *                             example: 600.00
 *                           status:
 *                             type: string
 *                             example: "completed"
 *                           entity_name:
 *                             type: string
 *                             example: "Raju"
 *                           phone_number:
 *                             type: string
 *                             example: "+919876543210"
 *                           created_at:
 *                             type: string
 *                             format: date-time
 *       401:
 *         description: Unauthorized — Admin token required
 */
router.get('/stats', paymentController.getPaymentStats);

module.exports = router;
