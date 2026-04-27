const express = require('express');
const router = express.Router();
const parentController = require('../controllers/parentController');
const authMiddleware = require('../../common/middlewares/commonAuthMiddleware');

/**
 * @swagger
 * tags:
 *   name: Client Parent Profile
 *   description: Parent profile management for Clients
 */

router.use(authMiddleware);

/**
 * @swagger
 * /api/client/parent/profile:
 *   post:
 *     summary: Create or Update parent profile
 *     tags: [Client Parent Profile]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Jane Doe"
 *     responses:
 *       200:
 *         description: Parent profile saved successfully
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
 *                   example: "Parent profile created successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       example: "PAR-1"
 *                     client_id:
 *                       type: string
 *                       example: "P-1"
 *                     name:
 *                       type: string
 *                       example: "Jane Doe"
 *                     created_at:
 *                       type: string
 *                       example: "2023-10-27T10:00:00.000Z"
 *                     updated_at:
 *                       type: string
 *                       example: "2023-10-27T10:00:00.000Z"
 *       400:
 *         description: Bad Request (missing name)
 */
router.post('/profile', parentController.saveParentProfile);

/**
 * @swagger
 * /api/client/parent/profile:
 *   get:
 *     summary: Get parent profile
 *     tags: [Client Parent Profile]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Parent profile details
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
 *                       example: "PAR-1"
 *                     client_id:
 *                       type: string
 *                       example: "P-1"
 *                     name:
 *                       type: string
 *                       example: "Jane Doe"
 */
router.get('/profile', parentController.getParentProfile);

module.exports = router;
