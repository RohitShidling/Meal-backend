const express = require('express');
const router = express.Router();
const { sendOtpController, verifyOtpController, logoutController, refreshTokenController } = require('../controllers/authController');
const clientAuthMiddleware = require('../middlewares/authMiddleware');

/**
 * @swagger
 * tags:
 *   name: Client Auth
 *   description: Client authentication API
 */

/**
 * @swagger
 * /api/client/auth/send-otp:
 *   post:
 *     summary: Send OTP for login or registration
 *     tags: [Client Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - phoneNumber
 *             properties:
 *               phoneNumber:
 *                 type: string
 *                 example: "+911234567890"
 *     responses:
 *       200:
 *         description: OTP sent successfully
 *       400:
 *         description: Bad request
 *       404:
 *         description: User not found (if action is login)
 */
router.post('/send-otp', sendOtpController);

/**
 * @swagger
 * /api/client/auth/verify-otp:
 *   post:
 *     summary: Verify OTP and login/register
 *     tags: [Client Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - phoneNumber
 *               - code
 *             properties:
 *               phoneNumber:
 *                 type: string
 *                 example: "+911234567890"
 *               code:
 *                 type: string
 *                 example: "123456"
 *     responses:
 *       200:
 *         description: Authentication successful
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
 *                     accessToken:
 *                       type: string
 *                     refreshToken:
 *                       type: string
 *                     user:
 *                       type: object
 *       400:
 *         description: Invalid OTP
 */
router.post('/verify-otp', verifyOtpController);

/**
 * @swagger
 * /api/client/auth/logout:
 *   post:
 *     summary: Logout a client user
 *     tags: [Client Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logged out successfully
 *       401:
 *         description: Unauthorized
 */
router.post('/logout', clientAuthMiddleware, logoutController);

/**
 * @swagger
 * /api/client/auth/refresh:
 *   post:
 *     summary: Refresh access and refresh tokens
 *     tags: [Client Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - refreshToken
 *             properties:
 *               refreshToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: Tokens refreshed successfully
 *       400:
 *         description: Bad request
 *       403:
 *         description: Invalid or expired refresh token
 */
router.post('/refresh', refreshTokenController);

module.exports = router;
