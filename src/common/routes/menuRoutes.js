const express = require('express');
const router = express.Router();
const menuController = require('../controllers/menuController');

/**
 * @swagger
 * /api/common/menu/{school_id}:
 *   get:
 *     tags: [Common Menu]
 *     summary: Get the latest menu for a school
 *     parameters:
 *       - in: path
 *         name: school_id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Latest menu retrieved successfully
 */
router.get('/:school_id', menuController.getLatestMenu);

/**
 * @swagger
 * /api/common/menu/{school_id}/history:
 *   get:
 *     tags: [Common Menu]
 *     summary: Get menu history for a school
 *     parameters:
 *       - in: path
 *         name: school_id
 *         required: true
 *         schema:
 *           type: string
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
router.get('/:school_id/history', menuController.getMenuHistory);

module.exports = router;
