const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const clientAuth = require('../middlewares/authMiddleware');
const rateLimit = require('express-rate-limit');

const paymentWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many payment write requests. Please retry after 15 minutes.' },
});

const paymentSyncLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many payment sync requests. Please retry after 5 minutes.' },
});

/**
 * @swagger
 * tags:
 *   name: Client - Payment
 *   description: Payment initiation, status sync, and subscription management
 */

// ─── SINGLE PAYMENT ──────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/client/payment/initiate:
 *   post:
 *     summary: Initiate payment for a single entity (child/teacher/professional)
 *     tags: [Client - Payment]
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
 *               subscriptionId: { type: string, example: "SUB-1" }
 *               entityType:
 *                 type: string
 *                 enum: [child, teacher, professional]
 *                 example: "child"
 *               entityId: { type: string, example: "CH-1" }
 *               startDate: { type: string, format: date, example: "2026-05-10", description: "Date from when meal delivery should start" }
 *               redirectUrl: { type: string, example: "https://yourdomain.com/payment-result" }
 *     responses:
 *       200:
 *         description: Payment URL generated. Redirect client to paymentUrl.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     orderId: { type: string, example: "ORD-1" }
 *                     merchantTransactionId: { type: string, example: "TXN_1_1714390000000" }
 *                     entityName: { type: string, example: "Raju" }
 *                     amount: { type: number, example: 800.00 }
 *                     planName: { type: string, example: "Monthly Plan" }
 *                     paymentUrl: { type: string, example: "https://phonepe.com/pay/..." }
 *       400:
 *         description: Validation error
 *       404:
 *         description: Entity or subscription not found
 */
router.post('/initiate', paymentWriteLimiter, clientAuth, paymentController.initiatePayment);

// ─── CART CHECKOUT ───────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/client/payment/checkout-cart:
 *   post:
 *     summary: Checkout entire cart — pay total for all entities in one transaction
 *     tags: [Client - Payment]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               redirectUrl: { type: string, example: "https://yourdomain.com/payment-result" }
 *     responses:
 *       200:
 *         description: Cart checkout initiated. Redirect to paymentUrl.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     orderId: { type: string, example: "ORD-2" }
 *                     merchantTransactionId: { type: string, example: "TXNC_2_1714390000000" }
 *                     totalAmount: { type: number, example: 2400.00 }
 *                     itemCount: { type: integer, example: 3 }
 *                     items:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           entityName: { type: string, example: "Raju" }
 *                           entityType: { type: string, example: "child" }
 *                           plan: { type: string, example: "Monthly Plan" }
 *                           price: { type: number, example: 800.00 }
 *                     paymentUrl: { type: string, example: "https://phonepe.com/pay/..." }
 *       400:
 *         description: Cart is empty
 */
router.post('/checkout-cart', paymentWriteLimiter, clientAuth, paymentController.checkoutCart);

// ─── WEBHOOK (no auth — called by PhonePe server) ────────────────────────────
/**
 * @swagger
 * /api/client/payment/webhook:
 *   post:
 *     summary: PhonePe webhook callback (DO NOT call manually)
 *     tags: [Client - Payment]
 *     description: PhonePe calls this endpoint server-to-server after payment completes. No auth needed.
 *     responses:
 *       200:
 *         description: OK
 */
router.post('/webhook', paymentController.handleWebhook);

// ─── INSTANT CALLBACK (Backend Redirect) ──────────────────────────────────
/**
 * @swagger
 * /api/client/payment/callback:
 *   post:
 *     summary: Instant callback handler for PhonePe redirects (Do not call manually)
 *     tags: [Client - Payment]
 *   get:
 *     summary: Instant callback handler for PhonePe redirects (Do not call manually)
 *     tags: [Client - Payment]
 */
router.post('/callback', paymentController.handleRedirectCallback);
router.get('/callback', paymentController.handleRedirectCallback);

// ─── STATUS PAGE (browser redirect) ──────────────────────────────────────────
/**
 * @swagger
 * /api/client/payment/status-page:
 *   get:
 *     summary: Browser redirect landing page — auto-syncs status and shows result UI
 *     tags: [Client - Payment]
 *     parameters:
 *       - in: query
 *         name: tid
 *         required: true
 *         schema:
 *           type: string
 *         description: Merchant transaction ID (passed automatically by PhonePe redirect)
 *     responses:
 *       200:
 *         description: HTML page showing payment success or failure with amount and entity name
 */
router.get('/status-page', paymentController.statusPage);

// ─── STATUS CHECK (API) ───────────────────────────────────────────────────────
/**
 * @swagger
 * /api/client/payment/status/{txnId}:
 *   get:
 *     summary: Poll payment status from PhonePe and auto-sync local DB
 *     tags: [Client - Payment]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: txnId
 *         required: true
 *         schema:
 *           type: string
 *         description: Merchant transaction ID
 *     responses:
 *       200:
 *         description: Payment status with entity info and amount paid
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 source: { type: string, example: "gateway_synced" }
 *                 data:
 *                   type: object
 *                   properties:
 *                     transactionId: { type: string }
 *                     localStatus: { type: string, example: "success" }
 *                     gatewayState: { type: string, example: "COMPLETED" }
 *                     orderStatus: { type: string, example: "completed" }
 *                     orderType: { type: string, example: "single" }
 *                     amountPaid: { type: number, example: 800.00 }
 *                     entityType: { type: string, example: "child" }
 *                     entityName: { type: string, example: "Raju" }
 *                     planName: { type: string, example: "Monthly Plan" }
 *                     clientPhone: { type: string, example: "+919876543210" }
 *                     cartItems:
 *                       type: array
 *                       description: Populated only for cart-type orders
 *                       items:
 *                         type: object
 *       404:
 *         description: Transaction not found
 */
router.get('/status/:txnId', paymentSyncLimiter, clientAuth, paymentController.checkPaymentStatus);

// ─── HISTORY & SUBSCRIPTIONS ─────────────────────────────────────────────────
/**
 * @swagger
 * /api/client/payment/history:
 *   get:
 *     summary: Get client's full payment history with entity name and amount
 *     tags: [Client - Payment]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *     responses:
 *       200:
 *         description: List of all orders with payment status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     total: { type: integer }
 *                     page: { type: integer }
 *                     limit: { type: integer }
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       order_id: { type: string }
 *                       order_status: { type: string }
 *                       order_type: { type: string }
 *                       amount: { type: number }
 *                       entity_name: { type: string }
 *                       entity_type: { type: string }
 *                       plan_name: { type: string }
 *                       payment_status: { type: string }
 *                       merchant_transaction_id: { type: string }
 */
router.get('/history', clientAuth, paymentController.getMyPaymentHistory);

/**
 * @swagger
 * /api/client/payment/active-subscriptions:
 *   get:
 *     summary: Get all active subscriptions — who is subscribed, amount paid, days remaining
 *     tags: [Client - Payment]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Active subscriptions list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 has_active_subscription: { type: boolean }
 *                 count: { type: integer }
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       entity_name: { type: string, example: "Raju" }
 *                       entity_type: { type: string, example: "child" }
 *                       plan_name: { type: string, example: "Monthly Plan" }
 *                       amount_paid: { type: number, example: 800.00 }
 *                       start_date: { type: string, format: date-time }
 *                       end_date: { type: string, format: date-time }
 *                       days_remaining: { type: integer, example: 28 }
 */
router.get('/active-subscriptions', clientAuth, paymentController.getMyActiveSubscriptions);

/**
 * @swagger
 * /api/client/payment/force-sync/{txnId}:
 *   post:
 *     summary: Force-sync payment status from PhonePe if webhook/redirect both failed
 *     tags: [Client - Payment]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: txnId
 *         required: true
 *         schema:
 *           type: string
 *         description: Merchant Transaction ID to force sync
 *     responses:
 *       200:
 *         description: Sync result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 message: { type: string, example: "Payment synced and subscription activated!" }
 *                 gatewayState: { type: string, example: "COMPLETED" }
 *       404:
 *         description: Transaction not found
 *       502:
 *         description: PhonePe gateway unreachable
 */
router.post('/force-sync/:txnId', paymentSyncLimiter, clientAuth, paymentController.forceSync);

module.exports = router;

