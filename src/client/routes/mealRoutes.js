const express = require('express');
const router = express.Router();
const mealController = require('../controllers/mealController');
const clientAuthMiddleware = require('../middlewares/authMiddleware');

router.use(clientAuthMiddleware);

/**
 * @swagger
 * tags:
 *   name: Client - Meals
 *   description: Subscription-gated meal access, status tracking, and skip management
 */

// ─────────────────────────────────────────────────────────────────────────────
// TODAY'S MENU
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/client/meals/today:
 *   get:
 *     summary: Get today's meal menu (subscription required)
 *     description: Returns today's menu ONLY if the user has any active subscription. If not subscribed, returns available plans.
 *     tags: [Client - Meals]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Menu returned for subscribed user
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 is_subscribed: { type: boolean, example: true }
 *                 subscription_summary:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       entity_type: { type: string, example: "child" }
 *                       entity_name: { type: string, example: "Raju" }
 *                       remaining_meals: { type: integer, example: 22 }
 *                       end_date: { type: string, format: date-time }
 *                 menu:
 *                   type: object
 *                   nullable: true
 *                   properties:
 *                     id: { type: string, example: "MN-5" }
 *                     image_url: { type: string }
 *                     items: { type: string, example: "Dal, Rice, Roti" }
 *                     menu_date: { type: string, example: "2026-04-30" }
 *       403:
 *         description: User is NOT subscribed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 is_subscribed: { type: boolean, example: false }
 *                 message: { type: string, example: "You do not have an active subscription." }
 *                 available_plans:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: string, example: "SUB-1" }
 *                       plan_name: { type: string }
 *                       price: { type: number }
 *                       billing_cycle: { type: string }
 */
router.get('/today', mealController.getTodayMenu);

// ─────────────────────────────────────────────────────────────────────────────
// WEEKLY MENU
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/client/meals/weekly:
 *   get:
 *     summary: Get this week's meal menu (next 7 days, subscription required)
 *     tags: [Client - Meals]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Weekly menu for subscribed user
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 is_subscribed: { type: boolean, example: true }
 *                 count: { type: integer, example: 5 }
 *                 subscription_summary:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       entity_type: { type: string }
 *                       entity_name: { type: string }
 *                       remaining_meals: { type: integer }
 *                       end_date: { type: string, format: date-time }
 *                 menu:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: string }
 *                       image_url: { type: string }
 *                       items: { type: string }
 *                       menu_date: { type: string }
 *       403:
 *         description: Not subscribed
 */
router.get('/weekly', mealController.getWeeklyMenu);

// ─────────────────────────────────────────────────────────────────────────────
// MEAL STATUS
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/client/meals/status:
 *   get:
 *     summary: Get remaining meals status for all subscribed entities
 *     tags: [Client - Meals]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Meal remaining status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 count: { type: integer, example: 2 }
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       entity_type: { type: string, example: "child" }
 *                       entity_name: { type: string, example: "Raju" }
 *                       total_meals: { type: integer, example: 30 }
 *                       remaining_meals: { type: integer, example: 22 }
 *                       start_date: { type: string, format: date-time }
 *                       end_date: { type: string, format: date-time }
 *                       plan_name: { type: string, example: "Monthly Plan" }
 */
router.get('/status', mealController.getMealStatus);

// ─────────────────────────────────────────────────────────────────────────────
// REQUEST MEAL SKIP
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/client/meals/skip:
 *   post:
 *     summary: Request a meal skip (policy-driven minimum days and advance notice)
 *     description: >
 *       User can skip meals for a date range. Rules:
 *       - Start date must satisfy admin-configured advance notice policy
 *       - Minimum consecutive days follow admin-configured skip policy
 *       - During skip, remaining meals will NOT be reduced
 *     tags: [Client - Meals]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [entityType, entityId, startDate, endDate]
 *             properties:
 *               entityType:
 *                 type: string
 *                 enum: [child, teacher, professional]
 *                 example: "child"
 *               entityId:
 *                 type: string
 *                 example: "CH-1"
 *               startDate:
 *                 type: string
 *                 format: date
 *                 example: "2026-05-05"
 *                 description: Must be >= tomorrow
 *               endDate:
 *                 type: string
 *                 format: date
 *                 example: "2026-05-09"
 *                 description: Must be at least 2 days after startDate (min 3-day range)
 *     responses:
 *       201:
 *         description: Meal skip approved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Meal skip approved for 5 days." }
 *                 data:
 *                   type: object
 *                   properties:
 *                     id: { type: integer, example: 1 }
 *                     entity_type: { type: string }
 *                     entity_id: { type: string }
 *                     skip_start_date: { type: string }
 *                     skip_end_date: { type: string }
 *                     total_skip_days: { type: integer, example: 5 }
 *       400:
 *         description: Validation error (less than 3 days, past date, etc.)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Minimum 3 consecutive days required." }
 *       409:
 *         description: Overlapping skip exists
 */
router.post('/skip', mealController.requestMealSkip);

// ─────────────────────────────────────────────────────────────────────────────
// VIEW MY SKIPS
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/client/meals/skips:
 *   get:
 *     summary: View all my meal skips
 *     tags: [Client - Meals]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of meal skips
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 count: { type: integer }
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: integer }
 *                       entity_type: { type: string }
 *                       entity_name: { type: string }
 *                       skip_start_date: { type: string }
 *                       skip_end_date: { type: string }
 *                       total_skip_days: { type: integer }
 *                       status: { type: string, example: "approved" }
 */
router.get('/skips', mealController.getMyMealSkips);

// ─────────────────────────────────────────────────────────────────────────────
// CANCEL A SKIP
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/client/meals/skip/{skipId}:
 *   delete:
 *     summary: Cancel a future meal skip (before it starts)
 *     tags: [Client - Meals]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: skipId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Skip cancelled
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Meal skip cancelled successfully." }
 *       400:
 *         description: Skip already started, cannot cancel
 *       404:
 *         description: Skip not found
 */
router.delete('/skip/:skipId', mealController.cancelMealSkip);

module.exports = router;
