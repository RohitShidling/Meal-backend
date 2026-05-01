const express = require('express');
const router = express.Router();
const {
  registerSendOtp,
  registerVerifyOtp,
  loginSendOtp,
  loginVerifyOtp,
  logoutController,
  refreshTokenController,
  getMe
} = require('../controllers/authController');
const clientAuthMiddleware = require('../middlewares/authMiddleware');
const { 
  validateRegister, 
  validateLogin, 
  validateVerifyOtp 
} = require('../validators/authValidator');

/**
 * @swagger
 * tags:
 *   name: Client Auth
 *   description: Authentication APIs for Clients (Phone + OTP)
 */

/**
 * @swagger
 * /api/client/auth/register/send-otp:
 *   post:
 *     summary: Send OTP for NEW client registration
 *     tags: [Client Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - phoneNumber
 *               - username
 *             properties:
 *               phoneNumber:
 *                 type: string
 *                 example: "+911234567890"
 *               username:
 *                 type: string
 *                 example: "Rohit"
 *     responses:
 *       200:
 *         description: OTP sent successfully
 *       400:
 *         description: User already registered or validation error
 */
router.post('/register/send-otp', validateRegister, registerSendOtp);

/**
 * @swagger
 * /api/client/auth/register/verify-otp:
 *   post:
 *     summary: Verify OTP and complete registration
 *     tags: [Client Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - phoneNumber
 *               - username
 *               - code
 *             properties:
 *               phoneNumber:
 *                 type: string
 *               username:
 *                 type: string
 *               code:
 *                 type: string
 *     responses:
 *       201:
 *         description: Registration successful, returns tokens
 *       400:
 *         description: Invalid OTP or already registered
 */
router.post('/register/verify-otp', validateRegister, validateVerifyOtp, registerVerifyOtp);

/**
 * @swagger
 * /api/client/auth/login/send-otp:
 *   post:
 *     summary: Send OTP for EXISTING client login
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
 *       404:
 *         description: User not registered
 */
router.post('/login/send-otp', validateLogin, loginSendOtp);

/**
 * @swagger
 * /api/client/auth/login/verify-otp:
 *   post:
 *     summary: Verify OTP and login existing client
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
 *               code:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful, returns tokens
 *       400:
 *         description: Invalid OTP
 *       404:
 *         description: User not found
 */
router.post('/login/verify-otp', validateLogin, validateVerifyOtp, loginVerifyOtp);

/**
 * @swagger
 * /api/client/auth/logout:
 *   post:
 *     summary: Logout client
 *     tags: [Client Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logout successful
 */
router.post('/logout', clientAuthMiddleware, logoutController);

/**
 * @swagger
 * /api/client/auth/refresh:
 *   post:
 *     summary: Refresh access token
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
 *         description: Token refreshed
 */
router.post('/refresh', refreshTokenController);

/**
 * @swagger
 * /api/client/auth/me:
 *   get:
 *     summary: Get current client profile status
 *     tags: [Client Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Profile status fetched successfully
 */
router.get('/me', clientAuthMiddleware, getMe);

module.exports = router;

