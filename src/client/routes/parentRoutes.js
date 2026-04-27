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

/**
 * @swagger
 * components:
 *   schemas:
 *     ParentProfile:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           example: "PAR-1"
 *         client_id:
 *           type: string
 *           example: "P-1"
 *         name:
 *           type: string
 *           example: "Jane Doe"
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
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
 *                   $ref: '#/components/schemas/ParentProfile'
 */
router.post('/profile', parentController.saveParentProfile);

/**
 * @swagger
 * /api/client/parent/profile:
 *   put:
 *     summary: Update parent profile
 *     tags: [Client Parent Profile]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Jane Doe"
 *     responses:
 *       200:
 *         description: Parent profile updated successfully
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
 *                   example: "Parent profile updated successfully"
 *                 data:
 *                   $ref: '#/components/schemas/ParentProfile'
 */
router.put('/profile', parentController.saveParentProfile);

/**
 * @swagger
 * /api/client/parent/profile:
 *   get:
 *     summary: Get parent profile
 *     tags: [Client Parent Profile]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: clientId
 *         schema:
 *           type: string
 *         description: (Admin only) Specific client ID to fetch profile for
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
 *                   $ref: '#/components/schemas/ParentProfile'
 */
router.get('/profile', parentController.getParentProfile);

/**
 * @swagger
 * /api/client/parent/profile:
 *   delete:
 *     summary: Delete parent profile
 *     tags: [Client Parent Profile]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: clientId
 *         schema:
 *           type: string
 *         description: (Admin only) Specific client ID to delete profile for
 *     responses:
 *       200:
 *         description: Parent profile deleted successfully
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
 *                   example: "Parent profile deleted successfully"
 *                 data:
 *                   $ref: '#/components/schemas/ParentProfile'
 */
router.delete('/profile', parentController.deleteParentProfile);

module.exports = router;
