const express = require('express');
const router = express.Router();
const homepageController = require('../controllers/homepageController');
const adminAuth = require('../middlewares/authMiddleware');

/**
 * @swagger
 * tags:
 *   name: Admin - Homepage
 *   description: Admin Homepage Section Management
 */

/**
 * @swagger
 * /api/admin/homepage:
 *   post:
 *     summary: Create a new homepage section entry
 *     tags: [Admin - Homepage]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, description, display_order]
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Welcome Section"
 *               description:
 *                 type: string
 *                 example: "Main welcome banner shown on the homepage."
 *               display_order:
 *                 type: integer
 *                 example: 1
 *     responses:
 *       201:
 *         description: Homepage entry created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Homepage entry created successfully." }
 *                 data:
 *                   type: object
 *                   properties:
 *                     id: { type: string, example: "HP-1" }
 *                     name: { type: string, example: "Welcome Section" }
 *                     description: { type: string, example: "Main welcome banner." }
 *                     display_order: { type: integer, example: 1 }
 *                     is_active: { type: boolean, example: true }
 *                     created_at: { type: string, format: date-time }
 *       400:
 *         description: Validation error or duplicate display_order
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Display order 1 already exists. Please choose a different order like 2." }
 *       401:
 *         description: Unauthorized
 */
router.post('/', adminAuth, homepageController.createHomepage);

/**
 * @swagger
 * /api/admin/homepage/{id}:
 *   put:
 *     summary: Update an existing homepage entry
 *     tags: [Admin - Homepage]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, example: "HP-1" }
 *         description: Homepage entry ID
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string, example: "Updated Welcome Section" }
 *               description: { type: string, example: "Updated description." }
 *               display_order: { type: integer, example: 2 }
 *               is_active: { type: boolean, example: true }
 *     responses:
 *       200:
 *         description: Homepage entry updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Homepage entry updated successfully." }
 *                 data:
 *                   type: object
 *                   properties:
 *                     id: { type: string, example: "HP-1" }
 *                     name: { type: string, example: "Updated Welcome Section" }
 *                     description: { type: string, example: "Updated description." }
 *                     display_order: { type: integer, example: 2 }
 *                     is_active: { type: boolean, example: true }
 *                     updated_at: { type: string, format: date-time }
 *       400:
 *         description: Duplicate display_order
 *       404:
 *         description: Homepage entry not found
 *       401:
 *         description: Unauthorized
 */
router.put('/:id', adminAuth, homepageController.updateHomepage);

/**
 * @swagger
 * /api/admin/homepage/{id}:
 *   delete:
 *     summary: Delete a homepage entry
 *     tags: [Admin - Homepage]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, example: "HP-1" }
 *         description: Homepage entry ID to delete
 *     responses:
 *       200:
 *         description: Homepage entry deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Homepage entry deleted successfully." }
 *                 data:
 *                   type: object
 *                   properties:
 *                     id: { type: string, example: "HP-1" }
 *       404:
 *         description: Homepage entry not found
 *       401:
 *         description: Unauthorized
 */
router.delete('/:id', adminAuth, homepageController.deleteHomepage);

module.exports = router;
