const express = require('express');
const router = express.Router();
const commonAuthMiddleware = require('../middlewares/commonAuthMiddleware');
const { getStates, getCities, getCompanies } = require('../controllers/lookupController');

/**
 * @swagger
 * tags:
 *   name: Common Master Data
 *   description: Shared read APIs for state, city and company
 */

router.use(commonAuthMiddleware);

/**
 * @swagger
 * /api/common/lookup/states:
 *   get:
 *     summary: Get active states
 *     tags: [Common Master Data]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Success" }
 *                 data: { type: object }
 *       400:
 *         description: Bad Request
 *       500:
 *         description: Server Error
 */
router.get('/states', getStates);
/**
 * @swagger
 * /api/common/lookup/cities:
 *   get:
 *     summary: Get active cities
 *     tags: [Common Master Data]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: stateId
 *         schema:
 *           type: integer
 *         description: Optional state ID to filter cities
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Success" }
 *                 data: { type: object }
 *       400:
 *         description: Bad Request
 *       500:
 *         description: Server Error
 */
router.get('/cities', getCities);
/**
 * @swagger
 * /api/common/lookup/companies:
 *   get:
 *     summary: Get active companies
 *     tags: [Common Master Data]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: cityId
 *         schema:
 *           type: integer
 *         description: Optional city ID to filter companies
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Success" }
 *                 data: { type: object }
 *       400:
 *         description: Bad Request
 *       500:
 *         description: Server Error
 */
router.get('/companies', getCompanies);
const { getMealSizes, getStandards } = require('../controllers/lookupController');

/**
 * @swagger
 * /api/common/lookup/meal-sizes:
 *   get:
 *     summary: Get active meal sizes
 *     tags: [Common Master Data]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Success
 */
router.get('/meal-sizes', getMealSizes);

/**
 * @swagger
 * /api/common/lookup/standards:
 *   get:
 *     summary: Get active standards
 *     tags: [Common Master Data]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Success
 */
router.get('/standards', getStandards);

module.exports = router;
