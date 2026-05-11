const express = require('express');
const router = express.Router();
const { loginController, verifyOtpController, logoutController, refreshTokenController } = require('../controllers/authController');
const adminAuth = require('../middlewares/authMiddleware');
const { validateAdminLogin, validateAdminVerifyOtp, validateAdminRefresh } = require('../validators/authValidator');

/**
 * @swagger
 * tags:
 *   name: Admin Auth
 *   description: Authentication APIs for Admins (Phone/Password + OTP)
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
 *               username:
 *                 type: string
 *                 example: "Admin Rohit"
 *     responses:
 *       200:
 *         description: Credentials verified, OTP sent
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
 *                   example: "Credentials verified. OTP sent to +911234567890."
 *       401:
 *         description: Invalid credentials
 */
router.post('/login', validateAdminLogin, loginController);

/**
 * @swagger
 * /api/admin/auth/verify-otp:
 *   post:
 *     summary: Verify admin OTP and Login
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
 *                   example: "Admin authentication successful."
 *                 data:
 *                   type: object
 *                   properties:
 *                     accessToken:
 *                       type: string
 *                     refreshToken:
 *                       type: string
 *                     user:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                           example: 1
 *                         username:
 *                           type: string
 *                           example: "Admin Rohit"
 *                         phoneNumber:
 *                           type: string
 *                           example: "+911234567890"
 *                         isLoggedIn:
 *                           type: boolean
 *                           example: true
 *                         lastLogin:
 *                           type: string
 *                           format: date-time
 *       400:
 *         description: Invalid OTP
 */
router.post('/verify-otp', validateAdminVerifyOtp, verifyOtpController);

/**
 * @swagger
 * /api/admin/auth/logout:
 *   post:
 *     summary: Logout admin
 *     tags: [Admin Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logout successful
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
 *                   example: "Logged out successfully."
 */
router.post('/logout', adminAuth, logoutController);

/**
 * @swagger
 * /api/admin/auth/refresh:
 *   post:
 *     summary: Refresh admin access token
 *     tags: [Admin Auth]
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
 *                   example: "Tokens refreshed successfully."
 *                 data:
 *                   type: object
 *                   properties:
 *                     accessToken:
 *                       type: string
 *                     refreshToken:
 *                       type: string
 */
router.post('/refresh', validateAdminRefresh, refreshTokenController);

module.exports = router;
