const express = require('express');
const router = express.Router();
const subscriptionController = require('../controllers/subscriptionController');
const commonAuthMiddleware = require('../middlewares/commonAuthMiddleware');

/**
 * @swagger
 * tags:
 *   name: Common Subscriptions
 *   description: Common Subscription Endpoints (Admin & Client)
 */

// Common subscription routes require common authentication (Client or Admin)
router.use(commonAuthMiddleware);

/**
 * @swagger
 * /api/common/subscriptions:
 *   get:
 *     summary: Get all active subscriptions (Clients only see active)
 *     tags: [Common Subscriptions]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: A list of subscriptions
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 count:
 *                   type: integer
 *                   example: 3
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         example: "SUB-1"
 *                       plan_name:
 *                         type: string
 *                         example: "Basic Plan"
 *                       price:
 *                         type: string
 *                         example: "99.99"
 *                       billing_cycle:
 *                         type: string
 *                         example: "Monthly"
 *                       trial_days:
 *                         type: integer
 *                         example: 7
 *                       display_order:
 *                         type: integer
 *                         example: 1
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal Server Error
 */
router.get('/', subscriptionController.getSubscriptions);

/**
 * @swagger
 * /api/common/subscriptions/{id}:
 *   get:
 *     summary: Get a subscription by ID
 *     tags: [Common Subscriptions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           example: "SUB-1"
 *         description: Subscription ID
 *     responses:
 *       200:
 *         description: A subscription object
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
 *                     id:
 *                       type: string
 *                       example: "SUB-1"
 *                     plan_name:
 *                       type: string
 *                       example: "Basic Plan"
 *                     price:
 *                       type: string
 *                       example: "99.99"
 *                     billing_cycle:
 *                       type: string
 *                       example: "Monthly"
 *                     trial_days:
 *                       type: integer
 *                       example: 7
 *                     display_order:
 *                       type: integer
 *                       example: 1
 *                     is_active:
 *                       type: boolean
 *                       example: true
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Subscription not found
 */
router.get('/:id', subscriptionController.getSubscriptionById);

module.exports = router;
