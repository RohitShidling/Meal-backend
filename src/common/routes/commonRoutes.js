const express = require('express');
const router = express.Router();
const commonAuthMiddleware = require('../middlewares/commonAuthMiddleware');
const { getAllSchools } = require('../../admin/controllers/schoolController');
const { getMealSizes, getStandards } = require('../../admin/controllers/lookupController');

// All common routes require either Admin or Client JWT
router.use(commonAuthMiddleware);

/**
 * @swagger
 * tags:
 *   name: Common - Shared APIs
 *   description: APIs accessible by both Admin and Client roles
 */

/**
 * @swagger
 * /api/common/schools:
 *   get:
 *     summary: Get all schools (Common)
 *     tags: [Common - Shared APIs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by school name or city
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Items per page
 *     responses:
 *       200:
 *         description: Schools fetched successfully
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
 *                   example: "Schools fetched successfully."
 *                 data:
 *                   type: object
 *                   properties:
 *                     schools:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/School'
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         currentPage:
 *                           type: integer
 *                         totalPages:
 *                           type: integer
 *                         totalItems:
 *                           type: integer
 *                         itemsPerPage:
 *                           type: integer
 *       401:
 *         description: Unauthorized
 */
router.get('/schools', getAllSchools);

/**
 * @swagger
 * /api/common/lookup/meal-sizes:
 *   get:
 *     summary: Get all meal sizes (Common)
 *     tags: [Common - Shared APIs]
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
 */
router.get('/lookup/meal-sizes', getMealSizes);

/**
 * @swagger
 * /api/common/lookup/standards:
 *   get:
 *     summary: Get all standards (Common)
 *     tags: [Common - Shared APIs]
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
 */
router.get('/lookup/standards', getStandards);

module.exports = router;
