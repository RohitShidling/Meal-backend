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
 */
router.get('/lookup/standards', getStandards);

module.exports = router;
