const express = require('express');
const router = express.Router();
const corporateLocationController = require('../controllers/corporateLocationController');
const adminAuthMiddleware = require('../middlewares/authMiddleware');

/**
 * @swagger
 * tags:
 *   name: Admin Corporate Locations
 *   description: Corporate delivery locations management for Admin
 */

router.use(adminAuthMiddleware);

/**
 * @swagger
 * /api/admin/corporate-locations:
 *   post:
 *     summary: Create a new corporate delivery location
 *     tags: [Admin Corporate Locations]
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
 *               - address
 *               - city
 *               - state
 *             properties:
 *               name:
 *                 type: string
 *               address:
 *                 type: string
 *               city:
 *                 type: string
 *               state:
 *                 type: string
 *               is_active:
 *                 type: boolean
 *                 default: true
 *     responses:
 *       201:
 *         description: Location created successfully
 */
router.post('/', corporateLocationController.createLocation);

module.exports = router;
