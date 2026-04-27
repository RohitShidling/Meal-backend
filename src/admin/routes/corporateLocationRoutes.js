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
 *                 example: "Main Tech Hub"
 *               address:
 *                 type: string
 *                 example: "123 Business Park, Electronic City"
 *               city:
 *                 type: string
 *                 example: "Bangalore"
 *               state:
 *                 type: string
 *                 example: "Karnataka"
 *               is_active:
 *                 type: boolean
 *                 default: true
 *                 example: true
 *     responses:
 *       201:
 *         description: Location created successfully
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
 *                   example: "Corporate location created successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       example: "CL-1"
 *                     name:
 *                       type: string
 *                       example: "Main Tech Hub"
 *                     address:
 *                       type: string
 *                       example: "123 Business Park, Electronic City"
 *                     city:
 *                       type: string
 *                       example: "Bangalore"
 *                     state:
 *                       type: string
 *                       example: "Karnataka"
 *                     is_active:
 *                       type: boolean
 *                       example: true
 *                     created_by:
 *                       type: integer
 *                       example: 1
 *                     created_at:
 *                       type: string
 *                       example: "2023-10-27T10:00:00.000Z"
 *                     updated_at:
 *                       type: string
 *                       example: "2023-10-27T10:00:00.000Z"
 *       400:
 *         description: Bad Request (missing fields)
 *       401:
 *         description: Unauthorized
 */
router.post('/', corporateLocationController.createLocation);

module.exports = router;
