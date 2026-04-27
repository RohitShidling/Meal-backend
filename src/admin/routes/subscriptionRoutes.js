const express = require('express');
const router = express.Router();
const subscriptionController = require('../controllers/subscriptionController');
const adminAuthMiddleware = require('../middlewares/authMiddleware');

/**
 * @swagger
 * tags:
 *   name: Admin Subscriptions
 *   description: Admin Subscription Management
 */

// All subscription modification routes require admin authentication
router.use(adminAuthMiddleware);

/**
 * @swagger
 * /api/admin/subscriptions:
 *   post:
 *     summary: Create a new subscription plan
 *     tags: [Admin Subscriptions]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - plan_name
 *               - price
 *               - billing_cycle
 *             properties:
 *               plan_name:
 *                 type: string
 *               price:
 *                 type: number
 *               billing_cycle:
 *                 type: string
 *               trial_days:
 *                 type: integer
 *                 default: 0
 *               display_order:
 *                 type: integer
 *                 default: 1
 *               is_active:
 *                 type: boolean
 *                 default: true
 *     responses:
 *       201:
 *         description: Subscription created successfully
 *       400:
 *         description: Missing required fields
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (Admin only)
 */
router.post('/', subscriptionController.createSubscription);

/**
 * @swagger
 * /api/admin/subscriptions/{id}:
 *   put:
 *     summary: Update an existing subscription plan
 *     tags: [Admin Subscriptions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Subscription ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               plan_name:
 *                 type: string
 *               price:
 *                 type: number
 *               billing_cycle:
 *                 type: string
 *               trial_days:
 *                 type: integer
 *               display_order:
 *                 type: integer
 *               is_active:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Subscription updated successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (Admin only)
 *       404:
 *         description: Subscription not found
 */
router.put('/:id', subscriptionController.updateSubscription);

/**
 * @swagger
 * /api/admin/subscriptions/{id}:
 *   delete:
 *     summary: Delete a subscription plan
 *     tags: [Admin Subscriptions]
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
 *         description: Subscription deleted successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (Admin only)
 *       404:
 *         description: Subscription not found
 */
router.delete('/:id', subscriptionController.deleteSubscription);

module.exports = router;
