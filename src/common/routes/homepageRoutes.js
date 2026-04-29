const express = require('express');
const router = express.Router();
const homepageController = require('../controllers/homepageController');

/**
 * @swagger
 * tags:
 *   name: Common - Homepage
 *   description: Shared Homepage APIs
 */

/**
 * @swagger
 * /api/common/homepage:
 *   get:
 *     summary: Get all active homepage entries ordered by display_order
 *     tags: [Common - Homepage]
 *     responses:
 *       200:
 *         description: Homepage entries retrieved successfully
 *       500:
 *         description: Server error
 */
router.get('/', homepageController.getHomepage);

/**
 * @swagger
 * /api/common/homepage/order/{order}:
 *   get:
 *     summary: Get a specific homepage entry based on the display_order
 *     tags: [Common - Homepage]
 *     parameters:
 *       - in: path
 *         name: order
 *         required: true
 *         schema:
 *           type: integer
 *         description: Display order to retrieve
 *     responses:
 *       200:
 *         description: Homepage entry retrieved successfully
 *       400:
 *         description: Invalid order provided
 *       404:
 *         description: Entry not found
 *       500:
 *         description: Server error
 */
router.get('/order/:order', homepageController.getHomepageByOrder);

module.exports = router;
