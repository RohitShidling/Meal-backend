const express = require('express');
const router = express.Router();
const homepageController = require('../controllers/homepageController');

/**
 * @swagger
 * tags:
 *   name: Common - Homepage
 *   description: Public homepage section APIs
 */

/**
 * @swagger
 * /api/common/homepage:
 *   get:
 *     summary: Get all active homepage entries ordered by display_order
 *     tags: [Common - Homepage]
 *     parameters:
 *       - in: query
 *         name: entity_id
 *         schema:
 *           type: string
 *         description: Optional entity ID to filter homepage entries
 *     responses:
 *       200:
 *         description: Homepage entries retrieved successfully
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
 *                   example: 3
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         example: "HP-1"
 *                       entity_id:
 *                         type: string
 *                         example: "ENT-1"
 *                       name: { type: string, example: "Welcome Section" }
 *                       description: { type: string, example: "Main welcome banner." }
 *                       display_order: { type: integer, example: 1 }
 *                       is_active: { type: boolean, example: true }
 *                       created_at: { type: string, format: date-time }
 *       500:
 *         description: Server error
 */
router.get('/', homepageController.getHomepage);

/**
 * @swagger
 * /api/common/homepage/order/{order}:
 *   get:
 *     summary: Get a specific homepage entry by display_order number
 *     tags: [Common - Homepage]
 *     parameters:
 *       - in: path
 *         name: order
 *         required: true
 *         schema:
 *           type: integer
 *           example: 1
 *         description: The display_order value to look up
 *       - in: query
 *         name: entity_id
 *         schema:
 *           type: string
 *         description: Optional entity ID to filter homepage entries by entity
 *     responses:
 *       200:
 *         description: Homepage entry retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       example: "HP-1"
 *                     entity_id:
 *                       type: string
 *                       example: "ENT-1"
 *                     name: { type: string, example: "Welcome Section" }
 *                     description: { type: string, example: "Main welcome banner." }
 *                     display_order: { type: integer, example: 1 }
 *                     is_active: { type: boolean, example: true }
 *                     created_at: { type: string, format: date-time }
 *       400:
 *         description: Invalid order number provided
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Invalid display order provided." }
 *       404:
 *         description: Entry not found for given order
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "No homepage entry found for display order 5." }
 */
router.get('/order/:order', homepageController.getHomepageByOrder);

module.exports = router;
