const express = require('express');
const router = express.Router();
const mealController = require('../controllers/mealController');
const adminAuthMiddleware = require('../middlewares/authMiddleware');

router.use(adminAuthMiddleware);

/**
 * @swagger
 * tags:
 *   name: Admin - Meals
 *   description: Meal reduction, skip management, and PDF token generation
 */

// ─────────────────────────────────────────────────────────────────────────────
// REDUCE MEALS FOR TODAY
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/admin/meals/reduce-today:
 *   post:
 *     summary: Reduce remaining meals by 1 for ALL active subscribers wanting today's meal
 *     description: >
 *       Admin presses this once per day. It reduces remaining_meals by 1 for every active
 *       subscription entity that does NOT have an approved meal skip for today.
 *       Can only be called ONCE per day (duplicate calls return 409).
 *     tags: [Admin - Meals]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Meals reduced successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Meal reduction completed for 2026-04-30." }
 *                 data:
 *                   type: object
 *                   properties:
 *                     date: { type: string, example: "2026-04-30" }
 *                     total_active_subscriptions: { type: integer, example: 50 }
 *                     meals_reduced: { type: integer, example: 45 }
 *                     skipped_due_to_meal_pause: { type: integer, example: 5 }
 *       409:
 *         description: Already reduced today
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Meals have already been reduced for today." }
 */
router.post('/reduce-today', mealController.reduceMealsForToday);

// ─────────────────────────────────────────────────────────────────────────────
// MEAL REDUCTION HISTORY
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/admin/meals/reduction-history:
 *   get:
 *     summary: Get meal reduction audit log
 *     tags: [Admin - Meals]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Reduction history
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     total: { type: integer }
 *                     page: { type: integer }
 *                     limit: { type: integer }
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: integer }
 *                       reduction_date: { type: string, example: "2026-04-30" }
 *                       affected_count: { type: integer, example: 45 }
 *                       skipped_count: { type: integer, example: 5 }
 *                       admin_phone: { type: string, example: "+919876543210" }
 *                       created_at: { type: string, format: date-time }
 */
router.get('/reduction-history', mealController.getReductionHistory);

// ─────────────────────────────────────────────────────────────────────────────
// RECONCILE MEALS (crash recovery)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/admin/meals/reconcile:
 *   post:
 *     summary: Recompute used_meals from daily_meal_log (crash recovery)
 *     description: >
 *       If the server crashed mid-reduction, used_meals may be wrong.
 *       This endpoint recalculates used_meals from the daily_meal_log (source of truth).
 *     tags: [Admin - Meals]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Reconciliation complete
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Reconciliation complete. 3 subscription(s) corrected." }
 *                 corrected:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: integer }
 *                       corrected_used: { type: integer }
 */
router.post('/reconcile', mealController.reconcileMeals);

// ─────────────────────────────────────────────────────────────────────────────
// DAILY MEAL LOG
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/admin/meals/daily-log/{date}:
 *   get:
 *     summary: View per-entity meal log for a specific date
 *     tags: [Admin - Meals]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: date
 *         required: true
 *         schema: { type: string, example: "today" }
 *         description: Use 'today' or YYYY-MM-DD format
 *     responses:
 *       200:
 *         description: Daily meal log entries
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 date: { type: string, example: "2026-04-30" }
 *                 count: { type: integer, example: 45 }
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: integer }
 *                       entity_type: { type: string }
 *                       entity_name: { type: string }
 *                       client_phone: { type: string }
 *                       meal_date: { type: string }
 */
router.get('/daily-log/:date', mealController.getDailyLog);

// ─────────────────────────────────────────────────────────────────────────────
// VIEW ALL MEAL SKIPS
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/admin/meals/skips:
 *   get:
 *     summary: View all meal skips (admin visibility)
 *     tags: [Admin - Meals]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: entityType
 *         schema:
 *           type: string
 *           enum: [child, teacher, professional]
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [approved, cancelled]
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: All meal skips
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
 *                       client_phone: { type: string }
 *                       entity_type: { type: string }
 *                       entity_name: { type: string }
 *                       skip_start_date: { type: string }
 *                       skip_end_date: { type: string }
 *                       total_skip_days: { type: integer }
 *                       status: { type: string }
 */
router.get('/skips', mealController.getAllMealSkips);

// ─────────────────────────────────────────────────────────────────────────────
// PDF: SCHOOL-SPECIFIC TOKENS
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/admin/meals/tokens/school/{schoolId}:
 *   get:
 *     summary: Download PDF meal tokens for a specific school (grouped by meal size)
 *     tags: [Admin - Meals]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: schoolId
 *         required: true
 *         schema: { type: string, example: "SH-1" }
 *         description: School ID to generate tokens for
 *     responses:
 *       200:
 *         description: PDF file download
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: School not found
 */
router.get('/tokens/school/:schoolId', mealController.getSchoolTokensPDF);

// ─────────────────────────────────────────────────────────────────────────────
// PDF: CORPORATE/PROFESSIONAL TOKENS
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/admin/meals/tokens/corporate/{locationId}:
 *   get:
 *     summary: Download PDF meal tokens for a corporate location
 *     tags: [Admin - Meals]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: locationId
 *         required: true
 *         schema: { type: string, example: "CL-1" }
 *         description: Corporate location ID
 *     responses:
 *       200:
 *         description: PDF file download
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: Location not found
 */
router.get('/tokens/corporate/:locationId', mealController.getCorporateTokensPDF);

// ─────────────────────────────────────────────────────────────────────────────
// PDF: DOWNLOAD ALL TOKENS
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/admin/meals/tokens/all:
 *   get:
 *     summary: Download ALL meal tokens in one PDF (all schools by meal size + all corporate locations)
 *     description: >
 *       Generates a single, structured PDF containing:
 *       1. Cover page with date and totals
 *       2. Each school on separate pages, grouped by meal size
 *       3. Each corporate location with professionals
 *       Order: School A (Small → Medium → Large) → School B → ... → Corporate locations
 *     tags: [Admin - Meals]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: PDF file download (combined)
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 */
router.get('/tokens/all', mealController.getAllTokensPDF);

module.exports = router;
