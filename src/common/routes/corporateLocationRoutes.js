const express = require('express');
const router = express.Router();
const corporateLocationController = require('../controllers/corporateLocationController');
const commonAuthMiddleware = require('../middlewares/commonAuthMiddleware');

/**
 * @swagger
 * tags:
 *   name: Common Corporate Locations
 *   description: Fetch corporate delivery locations for dropdowns
 */

router.use(commonAuthMiddleware);

/**
 * @swagger
 * /api/common/corporate-locations:
 *   get:
 *     summary: Get all active corporate delivery locations
 *     tags: [Common Corporate Locations]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of corporate locations
 */
router.get('/', corporateLocationController.getLocations);

module.exports = router;
