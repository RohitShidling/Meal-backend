const express = require('express');
const router = express.Router();
const subscriptionController = require('../controllers/subscriptionController');
const clientAuthMiddleware = require('../middlewares/authMiddleware');

router.use(clientAuthMiddleware);

/**
 * @swagger
 * tags:
 *   name: Client - Subscription
 *   description: Client Subscription Management
 */

/**
 * @swagger
 * /api/client/subscriptions/status:
 *   get:
 *     summary: Get subscription status for the logged-in client
 *     tags: [Client - Subscription]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Subscription status retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 has_active_subscription:
 *                   type: boolean
 *                   example: true
 *                 count:
 *                   type: integer
 *                   example: 1
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       client_subscription_id:
 *                         type: integer
 *                       entity_type:
 *                         type: string
 *                       entity_id:
 *                         type: string
 *                       start_date:
 *                         type: string
 *                         format: date-time
 *                       end_date:
 *                         type: string
 *                         format: date-time
 *                       subscription_status:
 *                         type: boolean
 *                       plan_name:
 *                         type: string
 *                       price:
 *                         type: string
 *                       billing_cycle:
 *                         type: string
 *       401:
 *         description: Unauthorized
 */
router.get('/status', subscriptionController.getMySubscriptionStatus);

module.exports = router;
