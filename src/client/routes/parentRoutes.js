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
 *     responses:
 *       200:
 *         description: Parent profile saved successfully
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
 */
router.get('/profile', parentController.getParentProfile);

module.exports = router;
