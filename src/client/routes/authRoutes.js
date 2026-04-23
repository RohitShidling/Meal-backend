const express = require('express');
const router = express.Router();
const { sendOtpController, verifyOtpController } = require('../controllers/authController');

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
 *               - action
 *             properties:
 *               phoneNumber:
 *                 type: string
 *                 example: "+911234567890"
 *               action:
 *                 type: string
 *                 enum: [login, register]
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
 *               - action
 *             properties:
 *               phoneNumber:
 *                 type: string
 *                 example: "+911234567890"
 *               code:
 *                 type: string
 *                 example: "123456"
 *               action:
 *                 type: string
 *                 enum: [login, register]
 *     responses:
 *       200:
 *         description: Authentication successful
 *       400:
 *         description: Invalid OTP
 */
router.post('/verify-otp', verifyOtpController);

module.exports = router;
