const express = require('express');
const router = express.Router();
const adminAuthMiddleware = require('../middlewares/authMiddleware');
const masterDataReadController = require('../controllers/masterDataReadController');

router.use(adminAuthMiddleware);

/**
 * @swagger
 * /api/admin/lookup/states:
 *   get:
 *     summary: Get all states (including inactive)
 *     tags: [Admin Master Data]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Success
 */
router.get('/states', masterDataReadController.getAllStates);

/**
 * @swagger
 * /api/admin/lookup/cities:
 *   get:
 *     summary: Get all cities (including inactive)
 *     tags: [Admin Master Data]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Success
 */
router.get('/cities', masterDataReadController.getAllCities);

/**
 * @swagger
 * /api/admin/lookup/companies:
 *   get:
 *     summary: Get all companies (including inactive)
 *     tags: [Admin Master Data]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Success
 */
router.get('/companies', masterDataReadController.getAllCompanies);

/**
 * @swagger
 * /api/admin/lookup/meal-sizes:
 *   get:
 *     summary: Get all meal sizes (including inactive)
 *     tags: [Admin Master Data]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Success
 */
router.get('/meal-sizes', masterDataReadController.getAllMealSizes);

/**
 * @swagger
 * /api/admin/lookup/standards:
 *   get:
 *     summary: Get all standards (including inactive)
 *     tags: [Admin Master Data]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Success
 */
router.get('/standards', masterDataReadController.getAllStandards);

module.exports = router;
