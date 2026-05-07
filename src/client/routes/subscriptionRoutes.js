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
 *     summary: Get subscription status for the logged-in client (ordered by remaining meals)
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
 *                 alerts:
 *                   type: array
 *                   description: Expiry warnings for subscriptions ending within 4 days
 *                   items:
 *                     type: object
 *                     properties:
 *                       type: { type: string, example: "EXPIRY_WARNING" }
 *                       entity_name: { type: string, example: "Raju" }
 *                       plan_name: { type: string }
 *                       remaining_days: { type: integer, example: 3 }
 *                       message: { type: string, example: "Your subscription for Raju is expiring in 3 day(s)." }
 *                       renew_options:
 *                         type: object
 *                         properties:
 *                           same_plan:
 *                             type: object
 *                             properties:
 *                               plan_id: { type: integer }
 *                               price: { type: number }
 *                           different_plan_url: { type: string }
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

/**
 * @swagger
 * /api/client/subscriptions/update-start-date:
 *   put:
 *     summary: Change the start date of an already paid/active subscription
 *     description: >
 *       If a client already paid for a subscription, they can change the date they
 *       want to start receiving meals. This will automatically shift the end date.
 *       Cannot be used if they have already consumed meals (used_meals > 0).
 *     tags: [Client - Subscription]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [entityType, entityId, startDate]
 *             properties:
 *               entityType:
 *                 type: string
 *                 enum: [child, teacher, professional]
 *                 example: child
 *               entityId:
 *                 type: string
 *                 example: CH-1
 *               startDate:
 *                 type: string
 *                 format: date
 *                 example: "2026-05-10"
 *                 description: The new date they want the meal service to start
 *     responses:
 *       200:
 *         description: Start date updated successfully
 *       400:
 *         description: Invalid date or meals already consumed
 *       403:
 *         description: No active subscription found
 */
router.put('/update-start-date', subscriptionController.updateStartDate);

/**
 * @swagger
 * /api/client/subscriptions/alerts:
 *   get:
 *     summary: Get a list of active subscriptions that are expiring in 4 days or less
 *     description: >
 *       Automatically returns expiring subscriptions for all entities (children/teachers/etc)
 *       under the logged-in client's account. Used to trigger expiration alerts.
 *     tags: [Client - Subscription]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Expiry alerts retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 count: { type: integer, example: 1 }
 *                 alerts:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       alert_type: { type: string, example: "EXPIRY_WARNING" }
 *                       entity_name: { type: string, example: "Raju" }
 *                       entity_type: { type: string, example: "child" }
 *                       entity_id: { type: string, example: "CH-1" }
 *                       plan_name: { type: string, example: "Monthly Plan" }
 *                       remaining_days: { type: integer, example: 3 }
 *                       end_date: { type: string, format: date-time }
 *                       message: { type: string, example: "Your subscription for Raju (Monthly Plan) is expiring in 3 day(s)." }
 *                       renew_options:
 *                         type: object
 *                         properties:
 *                           same_plan_id: { type: integer }
 *                           price: { type: number }
 */
router.get('/alerts', subscriptionController.getSubscriptionAlerts);
router.get('/notifications', subscriptionController.getSubscriptionNotifications);
router.patch('/notifications/:id/read', subscriptionController.markSubscriptionNotificationRead);

module.exports = router;
