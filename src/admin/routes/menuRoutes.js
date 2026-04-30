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
 * /api/admin/menu/bulk-upload:
 *   post:
 *     tags: [Admin Menu]
 *     summary: Upload multiple daily menus in bulk
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               menus:
 *                 type: string
 *                 description: JSON stringified array of menu objects [{ menu_date, items, image_url (optional) }]
 *                 example: '[{"menu_date": "2023-11-01", "items": "Dal, Rice"}, {"menu_date": "2023-11-02", "items": "Paneer, Roti"}]'
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: Array of image files (must match length of menus array)
 *     responses:
 *       201:
 *         description: Menus uploaded successfully
 *       400:
 *         description: Bad Request
 *       401:
 *         description: Unauthorized
 */
router.post('/bulk-upload', upload.array('images', 30), menuController.uploadBulkMenu);

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
 *           example: "MN-1"
 *         description: Use 'today' or a date format like 'YYYY-MM-DD'
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
 *           example: "MN-1"
 *         description: Use 'today' or a date format like 'YYYY-MM-DD'
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
router.delete('/:date', menuController.deleteMenu);

module.exports = router;
