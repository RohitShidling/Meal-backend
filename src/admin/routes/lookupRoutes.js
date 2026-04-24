const express = require('express');
const router = express.Router();
const adminAuthMiddleware = require('../middlewares/authMiddleware');
const { getMealSizes, getStandards } = require('../controllers/lookupController');

// All lookup routes require admin JWT
router.use(adminAuthMiddleware);

/**
 * @swagger
 * tags:
 *   name: Admin - Lookup
 *   description: Fixed lookup data APIs (Meal Sizes and Standards) — Admin only
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     MealSize:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           example: 1
 *         name:
 *           type: string
 *           example: "small"
 *         display_name:
 *           type: string
 *           example: "Small"
 *         sort_order:
 *           type: integer
 *           example: 1
 *
 *     Standard:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           example: 1
 *         name:
 *           type: string
 *           example: "1st"
 *         display_name:
 *           type: string
 *           example: "1st Standard"
 *         numeric_value:
 *           type: integer
 *           example: 1
 */

/**
 * @swagger
 * /api/admin/lookup/meal-sizes:
 *   get:
 *     summary: Get all fixed meal sizes (Small, Medium, Large)
 *     tags: [Admin - Lookup]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Meal sizes fetched successfully
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
 *                   example: "Meal sizes fetched successfully."
 *                 data:
 *                   type: object
 *                   properties:
 *                     mealSizes:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/MealSize'
 *                       example:
 *                         - id: 1
 *                           name: "small"
 *                           display_name: "Small"
 *                           sort_order: 1
 *                         - id: 2
 *                           name: "medium"
 *                           display_name: "Medium"
 *                           sort_order: 2
 *                         - id: 3
 *                           name: "large"
 *                           display_name: "Large"
 *                           sort_order: 3
 *       401:
 *         description: Unauthorized - Admin JWT required
 */
router.get('/meal-sizes', getMealSizes);

/**
 * @swagger
 * /api/admin/lookup/standards:
 *   get:
 *     summary: Get all fixed student standards (1st to 12th)
 *     tags: [Admin - Lookup]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Standards fetched successfully
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
 *                   example: "Standards fetched successfully."
 *                 data:
 *                   type: object
 *                   properties:
 *                     standards:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Standard'
 *                       example:
 *                         - id: 1
 *                           name: "1st"
 *                           display_name: "1st Standard"
 *                           numeric_value: 1
 *                         - id: 12
 *                           name: "12th"
 *                           display_name: "12th Standard"
 *                           numeric_value: 12
 *       401:
 *         description: Unauthorized - Admin JWT required
 */
router.get('/standards', getStandards);

module.exports = router;
