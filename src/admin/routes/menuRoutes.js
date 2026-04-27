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
 *                 example: "Dal Tadka, Rice, Roti, Salad"
 *               menu_date:
 *                 type: string
 *                 format: date
 *                 example: "2023-10-27"
 *               image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Menu uploaded successfully
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
 *                   example: "Menu uploaded successfully."
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       example: "MN-1"
 *                     image_url:
 *                       type: string
 *                       example: "http://res.cloudinary.com/..."
 *                     image_public_id:
 *                       type: string
 *                       example: "menu/abc123"
 *                     items:
 *                       type: string
 *                       example: "Dal Tadka, Rice, Roti, Salad"
 *                     menu_date:
 *                       type: string
 *                       example: "2023-10-27"
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
 *         description: Bad Request (e.g. missing image)
 *       401:
 *         description: Unauthorized
 */
router.post('/upload', upload.single('image'), menuController.uploadMenu);

/**
 * @swagger
 * /api/admin/menu/{id}:
 *   put:
 *     tags: [Admin Menu]
 *     summary: Update an existing menu
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           example: "MN-1"
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               items:
 *                 type: string
 *                 example: "Updated Items: Dal, Chawal"
 *               menu_date:
 *                 type: string
 *                 format: date
 *                 example: "2023-10-27"
 *               is_active:
 *                 type: boolean
 *                 example: true
 *               image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Menu updated successfully
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
 *                   example: "Menu updated successfully."
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       example: "MN-1"
 *                     items:
 *                       type: string
 *                       example: "Updated Items: Dal, Chawal"
 *                     is_active:
 *                       type: boolean
 *                       example: true
 */
router.put('/:id', upload.single('image'), menuController.updateMenu);

/**
 * @swagger
 * /api/admin/menu/{id}:
 *   delete:
 *     tags: [Admin Menu]
 *     summary: Delete a menu
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           example: "MN-1"
 *     responses:
 *       200:
 *         description: Menu deleted successfully
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
 *                   example: "Menu deleted successfully (Cloudinary and DB)"
 *       404:
 *         description: Menu not found
 */
router.delete('/:id', menuController.deleteMenu);

module.exports = router;
