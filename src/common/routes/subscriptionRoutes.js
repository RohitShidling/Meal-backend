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
 *                 count:
 *                   type: integer
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *       401:
 *         description: Unauthorized
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
 *         description: Subscription ID
 *     responses:
 *       200:
 *         description: A subscription object
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Subscription not found
 */
router.get('/:id', subscriptionController.getSubscriptionById);

module.exports = router;
