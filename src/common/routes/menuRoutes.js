const express = require('express');
const router = express.Router();
const menuController = require('../controllers/menuController');

/**
 * @swagger
 * /api/common/menu/history/all:
 *   get:
 *     tags: [Common Menu]
 *     summary: Get all menu history
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *     responses:
 *       200:
 *         description: Menu history retrieved successfully
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
 *                   example: 10
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         example: "MN-1"
 *                       image_url:
 *                         type: string
 *                         example: "http://localhost:3000/uploads/menu-169839..."
 *                       items:
 *                         type: string
 *                         example: "Dal Tadka, Rice, Roti, Salad"
 *                       menu_date:
 *                         type: string
 *                         example: "2023-10-27"
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *                         example: "2023-10-27T10:00:00.000Z"
 *       500:
 *         description: Internal Server Error
 */
router.get('/history/all', menuController.getMenuHistory);

/**
 * @swagger
 * /api/common/menu/{date}:
 *   get:
 *     tags: [Common Menu]
 *     summary: Get the menu for a specific date (or 'today')
 *     parameters:
 *       - in: path
 *         name: date
 *         required: true
 *         schema:
 *           type: string
 *           example: "today"
 *         description: Use 'today' or a date format like 'YYYY-MM-DD'
 *     responses:
 *       200:
 *         description: Menu retrieved successfully
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
 *                       example: "MN-1"
 *                     image_url:
 *                       type: string
 *                       example: "http://localhost:3000/uploads/menu-169839..."
 *                     items:
 *                       type: string
 *                       example: "Dal Tadka, Rice, Roti, Salad"
 *                     menu_date:
 *                       type: string
 *                       example: "2023-10-27"
 *                     created_at:
 *                       type: string
 *                       format: date-time
 *                       example: "2023-10-27T10:00:00.000Z"
 *       404:
 *         description: Menu not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "No active menu found for 2023-10-27."
 *       500:
 *         description: Internal Server Error
 */
router.get('/:date', menuController.getMenuByDate);

module.exports = router;
