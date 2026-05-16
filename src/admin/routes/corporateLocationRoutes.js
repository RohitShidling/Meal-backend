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
 *   get:
 *     summary: Get all corporate delivery locations (active and inactive)
 *     tags: [Admin Corporate Locations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Filter by name, city, or address (ILIKE)
 *     responses:
 *       200:
 *         description: Paginated corporate locations
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
 *                   example: 5
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     currentPage: { type: integer }
 *                     totalPages: { type: integer }
 *                     totalItems: { type: integer }
 *                     itemsPerPage: { type: integer }
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: string, example: "CL-1" }
 *                       name: { type: string, example: "Main Tech Hub" }
 *                       address: { type: string, example: "123 Business Park" }
 *                       city: { type: string, example: "Bangalore" }
 *                       state: { type: string, example: "Karnataka" }
 *                       is_active: { type: boolean, example: true }
 *                       created_by_name: { type: string, example: "admin_user" }
 *                       created_at: { type: string, format: date-time }
 */
router.get('/', corporateLocationController.getAllLocations);

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
router.put('/:id', corporateLocationController.updateLocation);
router.delete('/:id', corporateLocationController.deleteLocation);
router.patch('/:id/status', corporateLocationController.updateLocationStatus);

/**
 * @swagger
 * /api/admin/corporate-locations/{id}:
 *   put:
 *     summary: Update an existing corporate delivery location
 *     tags: [Admin Corporate Locations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The corporate location ID (e.g., CL-1)
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Updated Tech Hub"
 *               address:
 *                 type: string
 *                 example: "456 New Plaza, Tech Park"
 *               city:
 *                 type: string
 *                 example: "Bangalore"
 *               state:
 *                 type: string
 *                 example: "Karnataka"
 *               is_active:
 *                 type: boolean
 *                 example: false
 *     responses:
 *       200:
 *         description: Location updated successfully
 *       404:
 *         description: Location not found
 *       401:
 *         description: Unauthorized
 */
router.put('/:id', corporateLocationController.updateLocation);

/**
 * @swagger
 * /api/admin/corporate-locations/{id}:
 *   delete:
 *     summary: Delete a corporate delivery location
 *     tags: [Admin Corporate Locations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The corporate location ID to delete
 *     responses:
 *       200:
 *         description: Location deleted successfully
 *       400:
 *         description: Bad Request (location in use)
 *       404:
 *         description: Location not found
 *       401:
 *         description: Unauthorized
 */
router.delete('/:id', corporateLocationController.deleteLocation);

module.exports = router;
