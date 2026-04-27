const express = require('express');
const router = express.Router();
const menuController = require('../controllers/menuController');
const adminAuth = require('../middlewares/authMiddleware');
const upload = require('../../common/middlewares/uploadMiddleware');

// All routes are protected by adminAuth
router.use(adminAuth);

/**
 * @swagger
 * /api/admin/menu/upload:
 *   post:
 *     tags: [Admin Menu]
 *     summary: Upload a daily menu image
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               items:
 *                 type: string
 *               menu_date:
 *                 type: string
 *                 format: date
 *               image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Menu uploaded successfully
 */
router.post('/upload', upload.single('image'), menuController.uploadMenu);

/**
 * @swagger
 * /api/admin/menu/{date}:
 *   put:
 *     tags: [Admin Menu]
 *     summary: Update an existing menu by date
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: date
 *         required: true
 *         schema:
 *           type: string
 *         description: Use 'today' or a date format like 'YYYY-MM-DD'
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               items:
 *                 type: string
 *               is_active:
 *                 type: boolean
 *               image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Menu updated successfully
 */
router.put('/:date', upload.single('image'), menuController.updateMenu);

/**
 * @swagger
 * /api/admin/menu/{date}:
 *   delete:
 *     tags: [Admin Menu]
 *     summary: Delete a menu by date
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: date
 *         required: true
 *         schema:
 *           type: string
 *         description: Use 'today' or a date format like 'YYYY-MM-DD'
 *     responses:
 *       200:
 *         description: Menu deleted successfully
 */
router.delete('/:date', menuController.deleteMenu);

module.exports = router;
