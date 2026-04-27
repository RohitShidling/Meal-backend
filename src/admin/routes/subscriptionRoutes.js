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
 *           example: "SUB-1"
 *         description: Subscription ID
 *     responses:
 *       200:
 *         description: Subscription deleted successfully
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
 *                   example: "Subscription deleted successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       example: "SUB-1"
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Subscription not found
 */
router.delete('/:id', subscriptionController.deleteSubscription);

module.exports = router;
