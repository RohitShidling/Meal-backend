const express = require('express');
const router = express.Router();
const subscriptionController = require('../controllers/subscriptionController');
const adminAuthMiddleware = require('../middlewares/authMiddleware');

/**
 * @swagger
 * tags:
 *   name: Admin - Subscriptions
 *   description: Admin Subscription Plan Management
 */

router.use(adminAuthMiddleware);

/**
 * @swagger
 * /api/admin/subscriptions:
 *   get:
 *     summary: Get all subscription plans (including inactive)
 *     tags: [Admin - Subscriptions]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All subscription plans
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
 *                       id: { type: string, example: "SUB-1" }
 *                       plan_name: { type: string, example: "Monthly Plan" }
 *                       price: { type: number, example: 800.00 }
 *                       billing_cycle: { type: string, example: "monthly" }
 *                       trial_days: { type: integer, example: 0 }
 *                       display_order: { type: integer, example: 1 }
 *                       is_active: { type: boolean, example: true }
 *                       created_at: { type: string, format: date-time }
 */
router.get('/', subscriptionController.getAllSubscriptions);

/**
 * @swagger
 * /api/admin/subscriptions/{id}:
 *   get:
 *     summary: Get a single subscription plan by ID
 *     tags: [Admin - Subscriptions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, example: "SUB-1" }
 *     responses:
 *       200:
 *         description: Subscription plan found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     id: { type: string, example: "SUB-1" }
 *                     plan_name: { type: string, example: "Monthly Plan" }
 *                     price: { type: number, example: 800.00 }
 *                     billing_cycle: { type: string, example: "monthly" }
 *                     is_active: { type: boolean, example: true }
 *       404:
 *         description: Subscription not found
 */
router.get('/:id', subscriptionController.getSubscriptionById);

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
 *                 example: "Basic Plan"
 *               price:
 *                 type: number
 *                 example: 99.99
 *               billing_cycle:
 *                 type: string
 *                 example: "Monthly"
 *               trial_days:
 *                 type: integer
 *                 default: 0
 *                 example: 7
 *               display_order:
 *                 type: integer
 *                 default: 1
 *                 example: 1
 *               is_active:
 *                 type: boolean
 *                 default: true
 *                 example: true
 *     responses:
 *       201:
 *         description: Subscription created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Subscription created successfully"
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
 *                     created_by:
 *                       type: integer
 *                       example: 1
 *                     updated_by:
 *                       type: integer
 *                       example: 1
 *                     created_at:
 *                       type: string
 *                       example: "2023-10-27T10:00:00.000Z"
 *                     updated_at:
 *                       type: string
 *                       example: "2023-10-27T10:00:00.000Z"
 *       400:
 *         description: Missing required fields
 *       401:
 *         description: Unauthorized
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
 *           example: "SUB-1"
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
 *                 example: "Updated Basic Plan"
 *               price:
 *                 type: number
 *                 example: 109.99
 *     responses:
 *       200:
 *         description: Subscription updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Subscription updated successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       example: "SUB-1"
 *                     plan_name:
 *                       type: string
 *                       example: "Updated Basic Plan"
 *                     price:
 *                       type: string
 *                       example: "109.99"
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Subscription not found
 */
router.put('/:id', subscriptionController.updateSubscription);

/**
 * @swagger
 * /api/admin/subscriptions/client-subscription/{subscriptionId}:
 *   delete:
 *     summary: Cancel/deactivate a client's subscription (admin action)
 *     description: >
 *       Admin can cancel any client's active subscription by its client_subscriptions ID.
 *       One phone number can have multiple subscriptions (child, teacher, professional).
 *       This deactivates the specific one identified by its ID.
 *       Sets is_active=false and cancels any future meal skips for that entity.
 *       Data is preserved for audit — NOT hard-deleted.
 *     tags: [Admin - Subscriptions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: subscriptionId
 *         required: true
 *         schema:
 *           type: string
 *           example: "CT-SUB-1"
 *         description: The client_subscriptions ID (e.g. CT-SUB-1, CT-SUB-2)
 *     responses:
 *       200:
 *         description: Client subscription deactivated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Client subscription deactivated successfully." }
 *                 data:
 *                   type: object
 *                   properties:
 *                     subscription_id: { type: string, example: "CT-SUB-1" }
 *                     client_phone: { type: string, example: "+919876543210" }
 *                     entity_type: { type: string, example: "child" }
 *                     entity_name: { type: string, example: "Raju" }
 *                     total_meals: { type: integer, example: 30 }
 *                     used_meals: { type: integer, example: 12 }
 *                     remaining_at_deletion: { type: integer, example: 18 }
 *                     was_active_until: { type: string, format: date-time }
 *       400:
 *         description: Subscription already inactive
 *       404:
 *         description: Client subscription not found
 *       401:
 *         description: Unauthorized
 */
router.delete('/client-subscription/:subscriptionId', subscriptionController.deleteClientSubscription);

/**
 * @swagger
 * /api/admin/subscriptions/{id}:
 *   delete:
 *     summary: Delete a subscription plan (admin plan management)
 *     tags: [Admin - Subscriptions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           example: "SUB-1"
 *         description: Subscription plan ID
 *     responses:
 *       200:
 *         description: Subscription plan deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Subscription deleted successfully" }
 *                 data:
 *                   type: object
 *                   properties:
 *                     id: { type: string, example: "SUB-1" }
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Subscription not found
 */
router.delete('/:id', subscriptionController.deleteSubscription);

/**
 * @swagger
 * /api/admin/subscriptions/client-subscription/{subscriptionId}:
 *   delete:
 *     summary: Cancel/Deactivate a specific client's active subscription
 *     tags: [Admin - Subscription Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: subscriptionId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the client_subscription (e.g., CT-SUB-1)
 *     responses:
 *       200:
 *         description: Subscription successfully deactivated
 *       400:
 *         description: Subscription already inactive
 *       404:
 *         description: Subscription not found
 */
router.delete('/client-subscription/:subscriptionId', subscriptionController.deleteClientSubscription);

module.exports = router;

