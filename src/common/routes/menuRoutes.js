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
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Menu history retrieved successfully
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
 *         description: Use 'today' or a date format like 'YYYY-MM-DD'
 *     responses:
 *       200:
 *         description: Menu retrieved successfully
 */
router.get('/:date', menuController.getMenuByDate);

module.exports = router;
