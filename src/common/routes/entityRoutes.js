const express = require('express');
const router = express.Router();
const entityController = require('../controllers/entityController');

/**
 * @swagger
 * tags:
 *   name: Common Entities
 *   description: Public entity access APIs
 */

/**
 * @swagger
 * /api/common/entities:
 *   get:
 *     summary: Get all active entities
 *     tags: [Common Entities]
 *     responses:
 *       200:
 *         description: A list of active entities
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
 *                         example: "ENT-1"
 *                       name:
 *                         type: string
 *                         example: "child"
 *                       is_active:
 *                         type: boolean
 *                         example: true
 */
router.get('/', entityController.getEntities);

module.exports = router;
