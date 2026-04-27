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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 count:
 *                   type: integer
 *                   example: 1
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         example: "CL-1"
 *                       name:
 *                         type: string
 *                         example: "Main Tech Hub"
 *                       address:
 *                         type: string
 *                         example: "123 Business Park"
 *                       city:
 *                         type: string
 *                         example: "Bangalore"
 *                       state:
 *                         type: string
 *                         example: "Karnataka"
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal Server Error
 */
router.get('/', corporateLocationController.getLocations);

module.exports = router;
