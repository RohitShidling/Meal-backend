const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/mealSizeUpgradeAdminController');
const adminAuthMiddleware = require('../middlewares/authMiddleware');

router.use(adminAuthMiddleware);

/**
 * @swagger
 * /api/admin/meal-size-upgrade-prices:
 *   get:
 *     summary: Meal size upgrade rate matrix
 *     tags: [Admin - Meals]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Rows
 */
router.get('/', ctrl.listMealSizeUpgradePrices);

router.get('/history', ctrl.listMealSizeUpgradeOrders);

/**
 * @swagger
 * /api/admin/meal-size-upgrade-prices:
 *   post:
 *     summary: Create / update an upgrade price pair
 *     tags: [Admin - Meals]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [fromMealSizeId, toMealSizeId, price]
 *             properties:
 *               fromMealSizeId: { type: integer }
 *               toMealSizeId: { type: integer }
 *               price: { type: number }
 *               is_active: { type: boolean }
 *     responses:
 *       200:
 *         description: Saved
 */
router.post('/', ctrl.upsertMealSizeUpgradePrice);

/**
 * @swagger
 * /api/admin/meal-size-upgrade-prices/{id}:
 *   delete:
 *     summary: Remove an upgrade price row
 *     tags: [Admin - Meals]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Deleted
 */
router.delete('/:id', ctrl.deleteMealSizeUpgradePrice);

module.exports = router;
