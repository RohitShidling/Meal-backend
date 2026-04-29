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
 */
router.get('/states', getStates);
/**
 * @swagger
 * /api/common/lookup/cities:
 *   get:
 *     summary: Get active cities
 *     tags: [Common Master Data]
 *     security: [{ bearerAuth: [] }]
 */
router.get('/cities', getCities);
/**
 * @swagger
 * /api/common/lookup/companies:
 *   get:
 *     summary: Get active companies
 *     tags: [Common Master Data]
 *     security: [{ bearerAuth: [] }]
 */
router.get('/companies', getCompanies);

module.exports = router;
