const express = require('express');
const router = express.Router();
const tokenController = require('../controllers/tokenController');
const adminAuthMiddleware = require('../middlewares/authMiddleware');

router.use(adminAuthMiddleware);

/**
 * @swagger
 * tags:
 *   name: Admin - Token
 *   description: Admin token generation, policy and manual adjustments
 */

/**
 * @swagger
 * /api/admin/tokens/schools:
 *   get:
 *     summary: School token overview — every active master meal size per school (counts may be 0) + download tracking
 *     tags: [Admin - Token]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: date
 *         required: false
 *         schema: { type: string, example: "2026-05-05" }
 *         description: Optional token date (YYYY-MM-DD). Default is today.
 *     responses:
 *       200:
 *         description: School token summary
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 date: { type: string, example: "2026-05-04" }
 *                 count: { type: integer, example: 2 }
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       school_id: { type: string, example: "SH-1", description: Use this in path URLs (not undefined). }
 *                       schoolId:
 *                         type: string
 *                         example: "SH-1"
 *                         description: Same as school_id (alias for brittle frontends).
 *                       school_name: { type: string, example: "St. Mary's School" }
 *                       total_students: { type: integer, example: 44 }
 *                       whole_school_pdf:
 *                         type: object
 *                         properties:
 *                           downloaded: { type: boolean }
 *                           download_count: { type: integer }
 *                           last_downloaded_at: { type: string, format: date-time, nullable: true }
 *                       meal_sizes:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             meal_size_id: { type: integer, example: 1 }
 *                             meal_size_key: { type: string, example: "small" }
 *                             meal_size: { type: string, example: "Small" }
 *                             sort_order: { type: integer, example: 1 }
 *                             students_count: { type: integer, example: 12 }
 *                             can_download_pdf: { type: boolean, example: true }
 *                             downloaded: { type: boolean, example: true }
 *                             download_count: { type: integer, example: 2 }
 *                             last_downloaded_at: { type: string, format: date-time, nullable: true }
 *       400:
 *         description: Invalid date query
 */
router.get('/schools', tokenController.getSchoolTokenOverview);

/**
 * @swagger
 * /api/admin/tokens/schools/panel:
 *   get:
 *     summary: Minimal UI payload — school name + meal-size button metadata (uses same catalog as GET /api/common/lookup/meal-sizes)
 *     tags: [Admin - Token]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: date
 *         required: false
 *         schema: { type: string, example: "2026-05-05" }
 *     responses:
 *       200:
 *         description: Panel data with meal_sizes_catalog and per-school meal_size_buttons
 */
router.get('/schools/panel', tokenController.getSchoolTokenPanel);

/**
 * @swagger
 * /api/admin/tokens/export/schools/pdf:
 *   get:
 *     summary: Global PDF — all schools; per school, meal sizes in sort_order (empty sizes skipped)
 *     tags: [Admin - Token]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: date
 *         required: false
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: PDF
 *         content:
 *           application/pdf:
 *             schema: { type: string, format: binary }
 */
router.get('/export/schools/pdf', tokenController.downloadExportSchoolsBundlePdf);

/**
 * @swagger
 * /api/admin/tokens/export/corporate/pdf:
 *   get:
 *     summary: Global PDF — all corporate locations (college/office) in name order
 *     tags: [Admin - Token]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: date
 *         required: false
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: PDF
 *         content:
 *           application/pdf:
 *             schema: { type: string, format: binary }
 */
router.get('/export/corporate/pdf', tokenController.downloadExportCorporateBundlePdf);

/**
 * @swagger
 * /api/admin/tokens/export/all/pdf:
 *   get:
 *     summary: Combined PDF — Part A schools (same ordering as export/schools), then Part B corporate
 *     tags: [Admin - Token]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: date
 *         required: false
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: PDF
 *         content:
 *           application/pdf:
 *             schema: { type: string, format: binary }
 */
router.get('/export/all/pdf', tokenController.downloadExportAllBundlePdf);

/**
 * @swagger
 * /api/admin/tokens/schools/{schoolId}/pdf:
 *   get:
 *     summary: Download school token PDF — all meal sizes (card layout); generated only when this URL is opened
 *     tags: [Admin - Token]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: schoolId
 *         required: true
 *         schema: { type: string, example: "SH-1" }
 *       - in: query
 *         name: date
 *         required: false
 *         schema: { type: string, example: "2026-05-07" }
 *         description: Delivery / token date (YYYY-MM-DD). Default is today (server session calendar).
 *     responses:
 *       200:
 *         description: PDF file download
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 */
router.get('/schools/:schoolId/pdf', tokenController.downloadSchoolAllSizesTokensPdf);

/**
 * @swagger
 * /api/admin/tokens/schools/{schoolId}/meal-sizes/{mealSizeId}:
 *   get:
 *     summary: Get token list for one school and one meal size
 *     tags: [Admin - Token]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: schoolId
 *         required: true
 *         schema: { type: string, example: "SH-1" }
 *       - in: path
 *         name: mealSizeId
 *         required: true
 *         schema: { type: integer, example: 1 }
 *       - in: query
 *         name: date
 *         required: false
 *         schema: { type: string, example: "2026-05-05" }
 *         description: Optional token date (YYYY-MM-DD). Default is today.
 *       - in: query
 *         name: includeTokens
 *         required: false
 *         schema: { type: boolean, default: false }
 *         description: When true, response includes full `tokens` array. Omit or false returns counts and download metadata only (lighter panel).
 *     responses:
 *       200:
 *         description: Token records for selected school and meal size
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 date: { type: string, example: "2026-05-04" }
 *                 data:
 *                   type: object
 *                   properties:
 *                     school_id: { type: string, example: "SH-1" }
 *                     school_name: { type: string, example: "St. Mary's School" }
 *                     meal_size_id: { type: integer, example: 1 }
 *                     meal_size: { type: string, example: "Small" }
 *                     count: { type: integer, example: 10 }
 *                     downloaded: { type: boolean, example: true }
 *                     download_count: { type: integer, example: 1 }
 *                     last_downloaded_at: { type: string, format: date-time, nullable: true }
 *                     tokens:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           entity_id: { type: string, example: "CH-1" }
 *                           entity_type: { type: string, example: "child" }
 *                           student_name: { type: string, example: "Raju" }
 *                           roll_number: { type: string, example: "A12" }
 *                           standard: { type: string, example: "5th Standard" }
 *                           meal_size: { type: string, example: "Small" }
 *                           remaining_meals: { type: integer, example: 18 }
 */
router.get('/schools/:schoolId/meal-sizes/:mealSizeId', tokenController.getSchoolMealSizeTokens);

/**
 * @swagger
 * /api/admin/tokens/schools/{schoolId}/meal-sizes/{mealSizeId}/pdf:
 *   get:
 *     summary: Download token PDF for one school and one meal size
 *     tags: [Admin - Token]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: schoolId
 *         required: true
 *         schema: { type: string, example: "SH-1" }
 *       - in: path
 *         name: mealSizeId
 *         required: true
 *         schema: { type: integer, example: 2 }
 *       - in: query
 *         name: date
 *         required: false
 *         schema: { type: string, example: "2026-05-05" }
 *         description: Optional token date (YYYY-MM-DD). Default is today.
 *     responses:
 *       200:
 *         description: PDF file
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 */
router.get('/schools/:schoolId/meal-sizes/:mealSizeId/pdf', tokenController.downloadSchoolMealSizeTokensPdf);

/**
 * @swagger
 * /api/admin/tokens/corporate:
 *   get:
 *     summary: Get today's corporate token overview
 *     tags: [Admin - Token]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: date
 *         required: false
 *         schema: { type: string, example: "2026-05-05" }
 *         description: Optional token date (YYYY-MM-DD). Default is today.
 *     responses:
 *       200:
 *         description: Corporate token summary
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 date: { type: string, example: "2026-05-04" }
 *                 count: { type: integer, example: 3 }
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       corporate_location_id: { type: string, example: "CL-1" }
 *                       corporate_location_name: { type: string, example: "Tech Park A" }
 *                       professionals_count: { type: integer, example: 21 }
 *                       downloaded: { type: boolean, example: true }
 *                       download_count: { type: integer, example: 4 }
 *                       last_downloaded_at: { type: string, format: date-time, nullable: true }
 */
router.get('/corporate', tokenController.getCorporateTokenOverview);

/**
 * @swagger
 * /api/admin/tokens/corporate/{locationId}:
 *   get:
 *     summary: Get token list for one corporate location
 *     tags: [Admin - Token]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: locationId
 *         required: true
 *         schema: { type: string, example: "CL-1" }
 *       - in: query
 *         name: date
 *         required: false
 *         schema: { type: string, example: "2026-05-05" }
 *         description: Optional token date (YYYY-MM-DD). Default is today.
 *     responses:
 *       200:
 *         description: Corporate token records
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 date: { type: string, example: "2026-05-04" }
 *                 data:
 *                   type: object
 *                   properties:
 *                     corporate_location_id: { type: string, example: "CL-1" }
 *                     corporate_location_name: { type: string, example: "Tech Park A" }
 *                     count: { type: integer, example: 21 }
 *                     downloaded: { type: boolean, example: false }
 *                     download_count: { type: integer, example: 0 }
 *                     last_downloaded_at: { type: string, format: date-time, nullable: true }
 *                     tokens:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           entity_id: { type: string, example: "PRO-2" }
 *                           entity_type: { type: string, example: "professional" }
 *                           professional_name: { type: string, example: "Anita Sharma" }
 *                           company_name: { type: string, example: "Acme Corp" }
 *                           remaining_meals: { type: integer, example: 11 }
 *                           meal_size: { type: string, example: "Professional" }
 */
router.get('/corporate/:locationId', tokenController.getCorporateTokens);

/**
 * @swagger
 * /api/admin/tokens/corporate/{locationId}/pdf:
 *   get:
 *     summary: Download token PDF for one corporate location
 *     tags: [Admin - Token]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: locationId
 *         required: true
 *         schema: { type: string, example: "CL-1" }
 *       - in: query
 *         name: date
 *         required: false
 *         schema: { type: string, example: "2026-05-05" }
 *         description: Optional token date (YYYY-MM-DD). Default is today.
 *     responses:
 *       200:
 *         description: PDF file
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 */
router.get('/corporate/:locationId/pdf', tokenController.downloadCorporateTokensPdf);

/**
 * @swagger
 * /api/admin/tokens/subscriptions/{subscriptionId}/extra-meals:
 *   post:
 *     summary: Add extra meals to a subscription (admin benefit)
 *     tags: [Admin - Token]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: subscriptionId
 *         required: true
 *         schema: { type: string, example: "CT-SUB-1" }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [extraMeals, reason]
 *             properties:
 *               extraMeals: { type: integer, example: 5 }
 *               reason: { type: string, example: "Festival bonus meals" }
 *     responses:
 *       200:
 *         description: Extra meals added
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Extra meals added successfully." }
 *                 data:
 *                   type: object
 *                   properties:
 *                     subscription_id: { type: string, example: "CT-SUB-1" }
 *                     added_meals: { type: integer, example: 5 }
 *                     total_meals: { type: integer, example: 35 }
 *                     used_meals: { type: integer, example: 10 }
 *                     remaining_meals: { type: integer, example: 25 }
 */
router.post('/subscriptions/:subscriptionId/extra-meals', tokenController.addExtraMeals);

/**
 * @swagger
 * /api/admin/tokens/skip-policy:
 *   get:
 *     summary: Get current meal skip policy
 *     tags: [Admin - Token]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Skip policy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     min_skip_days: { type: integer, example: 3 }
 *                     min_notice_days: { type: integer, example: 1 }
 *   put:
 *     summary: Update meal skip policy (min days and notice days)
 *     tags: [Admin - Token]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               minSkipDays: { type: integer, example: 3 }
 *               minNoticeDays: { type: integer, example: 1 }
 *     responses:
 *       200:
 *         description: Policy updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Meal skip policy updated successfully." }
 *                 data:
 *                   type: object
 *                   properties:
 *                     min_skip_days: { type: integer, example: 5 }
 *                     min_notice_days: { type: integer, example: 2 }
 */
router.get('/skip-policy', tokenController.getMealSkipPolicy);
router.put('/skip-policy', tokenController.updateMealSkipPolicy);

module.exports = router;
