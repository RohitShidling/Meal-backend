const express = require('express');
const router = express.Router();
const { loginController, verifyOtpController } = require('../controllers/authController');

/**
 * @swagger
 * tags:
 *   name: Admin Auth
 *   description: Admin authentication API
 */

/**
 * @swagger
 * /api/admin/auth/login:
 *   post:
 *     summary: Verify admin credentials and send OTP
 *     tags: [Admin Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - phoneNumber
 *               - password
 *             properties:
 *               phoneNumber:
 *                 type: string
 *                 example: "+911234567890"
 *               password:
 *                 type: string
 *                 example: "adminpassword"
 *     responses:
 *       200:
 *         description: Credentials verified, OTP sent
 *       400:
 *         description: Bad request
 *       401:
 *         description: Invalid credentials
 */
router.post('/login', loginController);

/**
 * @swagger
 * /api/admin/auth/verify-otp:
 *   post:
 *     summary: Verify OTP and complete login
 *     tags: [Admin Auth]
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
 *       400:
 *         description: Invalid OTP
 */
router.post('/verify-otp', verifyOtpController);

module.exports = router;
