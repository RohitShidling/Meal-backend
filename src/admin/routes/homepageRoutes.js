const express = require('express');
const router = express.Router();
const homepageController = require('../controllers/homepageController');
const adminAuth = require('../middlewares/authMiddleware');

/**
 * @swagger
 * tags:
 *   name: Admin - Homepage
 *   description: Admin Homepage Management
 */

/**
 * @swagger
 * /api/admin/homepage:
 *   post:
 *     summary: Create a new homepage entry
 *     tags: [Admin - Homepage]
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
 *               - description
 *               - display_order
 *             properties:
 *               name:
 *                 type: string
 *                 example: Welcome Section
 *               description:
 *                 type: string
 *                 example: This is the main welcome section of the homepage.
 *               display_order:
 *                 type: integer
 *                 example: 1
 *     responses:
 *       201:
 *         description: Homepage entry created successfully
 *       400:
 *         description: Validation error or display order already exists
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
 *         schema:
 *           type: string
 *         description: Homepage entry ID (e.g., HP-1)
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: Updated Welcome Section
 *               description:
 *                 type: string
 *                 example: Updated description.
 *               display_order:
 *                 type: integer
 *                 example: 2
 *               is_active:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       200:
 *         description: Homepage entry updated successfully
 *       400:
 *         description: Validation error or display order already exists
 *       404:
 *         description: Homepage entry not found
 *       401:
 *         description: Unauthorized
 */
router.put('/:id', adminAuth, homepageController.updateHomepage);

module.exports = router;
