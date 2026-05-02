const express = require('express');
const router = express.Router();
const entityController = require('../controllers/entityController');
const adminAuth = require('../middlewares/authMiddleware');

/**
 * @swagger
 * tags:
 *   name: Admin Entities
 *   description: Admin API for managing user entities
 */

/**
 * @swagger
 * /api/admin/entities:
 *   get:
 *     summary: Get all entities (including inactive)
 *     tags: [Admin Entities]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of all entities
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 count: { type: integer, example: 2 }
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: string, example: "ENT-1" }
 *                       name: { type: string, example: "child" }
 *                       is_active: { type: boolean, example: true }
 *                       created_at: { type: string, format: date-time }
 *                       updated_at: { type: string, format: date-time }
 */
router.get('/', adminAuth, entityController.getAllEntities);

/**
 * @swagger
 * /api/admin/entities:
 *   post:
 *     summary: Create a new entity
 *     tags: [Admin Entities]
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
 *                 example: "child"
 *               is_active:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       201:
 *         description: Entity created successfully
 *       400:
 *         description: Invalid input or entity already exists
 */
router.post('/', adminAuth, entityController.createEntity);

/**
 * @swagger
 * /api/admin/entities/{id}:
 *   put:
 *     summary: Update an entity
 *     tags: [Admin Entities]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: "child"
 *               is_active:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       200:
 *         description: Entity updated successfully
 *       404:
 *         description: Entity not found
 */
router.put('/:id', adminAuth, entityController.updateEntity);

/**
 * @swagger
 * /api/admin/entities/{id}:
 *   delete:
 *     summary: Delete an entity
 *     tags: [Admin Entities]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Entity deleted successfully
 *       404:
 *         description: Entity not found
 */
router.delete('/:id', adminAuth, entityController.deleteEntity);

module.exports = router;
