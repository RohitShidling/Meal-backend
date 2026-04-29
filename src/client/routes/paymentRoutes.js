const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const clientAuthMiddleware = require('../middlewares/authMiddleware');

/**
 * @swagger
 * tags:
 *   name: Client Payment
 *   description: Payment and Subscription management for Clients
 */

/**
 * @swagger
 * /api/client/payment/initiate:
 *   post:
 *     summary: Initiate a payment for a subscription plan
 *     tags: [Client Payment]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - subscriptionId
 *               - entityType
 *               - entityId
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
 *               customRedirectUrl:
 *                 type: string
 *                 description: "Optional URL to override the default .env redirection page"
 *                 example: "https://myapp.com/payment-result"
 *     responses:
 *       200:
 *         description: Industrial Checkout session created. User should be redirected to data.paymentUrl.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     orderId:
 *                       type: string
 *                     merchantTransactionId:
 *                       type: string
 *                     paymentUrl:
 *                       type: string
 *                     redirectionMethod:
 *                       type: string
 *                       example: "GET"
 */
router.post('/initiate', clientAuthMiddleware, paymentController.initiatePayment);

/**
 * @swagger
 * /api/client/payment/webhook:
 *   post:
 *     summary: Internal PhonePe Webhook callback
 *     tags: [Client Payment]
 *     description: This endpoint is called by PhonePe servers to notify payment status.
 *     responses:
 *       200:
 *         description: OK
 */
router.post('/webhook', paymentController.handleWebhook);

/**
 * @swagger
 * /api/client/payment/status/{txnId}:
 *   get:
 *     summary: Check final payment status from Gateway
 *     tags: [Client Payment]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: txnId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Transaction status details
 */
router.get('/status/:txnId', clientAuthMiddleware, paymentController.checkPaymentStatus);

/**
 * @swagger
 * /api/client/payment/status-page:
 *   get:
 *     summary: Industrial Redirection Landing Page
 *     tags: [Client Payment]
 *     description: The gateway redirects users here. It automatically syncs status and shows a Success/Failure UI.
 *     parameters:
 *       - in: query
 *         name: tid
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Visual HTML Landing Page
 */
router.get('/status-page', paymentController.statusPage);

/**
 * @swagger
 * /api/client/payment/history:
 *   get:
 *     summary: Get logged-in client's payment history
 *     tags: [Client Payment]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of past payments
 */
router.get('/history', clientAuthMiddleware, paymentController.getMyPaymentHistory);

/**
 * @swagger
 * /api/client/payment/active-subscriptions:
 *   get:
 *     summary: View all currently active subscriptions
 *     tags: [Client Payment]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of active plans for children/profiles
 */
router.get('/active-subscriptions', clientAuthMiddleware, paymentController.getMyActiveSubscriptions);

module.exports = router;
