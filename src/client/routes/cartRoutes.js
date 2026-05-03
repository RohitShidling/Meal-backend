const express = require('express');
const router = express.Router();
const cartController = require('../controllers/cartController');
const clientAuth = require('../middlewares/authMiddleware');

router.use(clientAuth);

/**
 * @swagger
 * tags:
 *   name: Client - Cart
 *   description: Multi-entity subscription cart management
 */

/**
 * @swagger
 * /api/client/cart:
 *   get:
 *     summary: View current active cart with all items and total
 *     tags: [Client - Cart]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Cart retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     cart:
 *                       type: object
 *                       properties:
 *                         id: { type: string, example: "CART-1" }
 *                         total_amount: { type: number, example: 2400.00 }
 *                         status: { type: string, example: "active" }
 *                     items:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id: { type: integer }
 *                           entity_name: { type: string, example: "Raju" }
 *                           entity_type: { type: string, example: "child" }
 *                           plan_name: { type: string, example: "Monthly Plan" }
 *                           unit_price: { type: number, example: 800.00 }
 *                     item_count: { type: integer, example: 3 }
 */
router.get('/', cartController.viewCart);

/**
 * @swagger
 * /api/client/cart/add:
 *   post:
 *     summary: Add an entity (child/teacher/professional) to the cart
 *     tags: [Client - Cart]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [subscriptionId, entityType, entityId]
 *             properties:
 *               subscriptionId:
 *                 type: string
 *                 example: "SUB-1"
 *               entityType:
 *                 type: string
 *                 enum: [child, teacher, professional]
 *                 example: "child"
 *               entityId:
 *                 type: string
 *                 example: "CH-1"
 *               startDate:
 *                 type: string
 *                 format: date
 *                 example: "2026-05-10"
 *                 description: "Date from when meal delivery should start"
 *     responses:
 *       200:
 *         description: Item added to cart successfully
 *       400:
 *         description: Entity already in cart or validation error
 *       404:
 *         description: Entity or subscription not found
 */
router.post('/add', cartController.addToCart);

/**
 * @swagger
 * /api/client/cart/item/{itemId}:
 *   patch:
 *     summary: Update start date for a cart line item
 *     tags: [Client - Cart]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: itemId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [startDate]
 *             properties:
 *               startDate:
 *                 type: string
 *                 format: date
 *                 example: "2026-05-15"
 *     responses:
 *       200:
 *         description: Start date updated
 *       404:
 *         description: Cart item not found
 */
router.patch('/item/:itemId', cartController.updateCartItem);

/**
 * @swagger
 * /api/client/cart/item/{itemId}:
 *   delete:
 *     summary: Remove a specific item from the cart
 *     tags: [Client - Cart]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: itemId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Cart item ID
 *     responses:
 *       200:
 *         description: Item removed successfully
 *       404:
 *         description: Cart item not found
 */
router.delete('/item/:itemId', cartController.removeFromCart);

/**
 * @swagger
 * /api/client/cart/clear:
 *   delete:
 *     summary: Clear all items from the active cart
 *     tags: [Client - Cart]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Cart cleared successfully
 *       404:
 *         description: No active cart found
 */
router.delete('/clear', cartController.clearCart);

module.exports = router;
