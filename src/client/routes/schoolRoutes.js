const express = require('express');
const router = express.Router();
const schoolController = require('../controllers/schoolController');
const clientAuthMiddleware = require('../middlewares/authMiddleware');

/**
 * @swagger
 * tags:
 *   name: Client - Schools
 *   description: School fetching APIs for Clients
 */

/**
 * @swagger
 * /api/client/schools:
 *   get:
 *     summary: Get all active schools (Client)
 *     tags: [Client - Schools]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Optional search by school name or city
 *     responses:
 *       200:
 *         description: Active schools fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Active schools fetched successfully."
 *                 data:
 *                   type: object
 *                   properties:
 *                     schools:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/School'
 *       401:
 *         description: Unauthorized
 */
router.get('/', clientAuthMiddleware, schoolController.getActiveSchools);

module.exports = router;
