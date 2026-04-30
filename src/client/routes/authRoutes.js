const express = require('express');
const router = express.Router();
const {
  sendOtpController,
  loginSendOtpController,
  verifyOtpController,
  logoutController,
  refreshTokenController,
  getMe
} = require('../controllers/authController');
const clientAuthMiddleware = require('../middlewares/authMiddleware');
const { validateLoginSendOtp } = require('../validators/authValidator');

/**
 * @swagger
 * tags:
 *   name: Client Auth
 *   description: Authentication APIs for Clients (Phone + OTP)
 */

/**
 * @swagger
 * /api/client/auth/send-otp:
 *   post:
 *     summary: Send OTP to a phone number
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
 *                   example: "OTP sent to +911234567890."
 *       400:
 *         description: Bad Request
 */
router.post('/send-otp', sendOtpController);

/**
 * @swagger
 * /api/client/auth/login/send-otp:
 *   post:
 *     summary: Send OTP for client login with username
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
 *         description: Login OTP sent successfully
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
 *                   example: "Login OTP sent to +911234567890."
 *                 data:
 *                   type: object
 *                   properties:
 *                     phoneNumber:
 *                       type: string
 *                       example: "+911234567890"
 *                     username:
 *                       type: string
 *                       example: "Rohit"
 *       400:
 *         description: Validation or OTP provider error
 */
router.post('/login/send-otp', validateLoginSendOtp, loginSendOtpController);

/**
 * @swagger
 * /api/client/auth/verify-otp:
 *   post:
 *     summary: Verify OTP and Login/Register
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
 *         description: Login successful
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
 *                   example: "Authentication successful."
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
 *                           type: string
 *                           example: "P-1"
 *                         username:
 *                           type: string
 *                           nullable: true
 *                           example: "Rohit"
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
router.post('/verify-otp', verifyOtpController);

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
router.post('/refresh', refreshTokenController);

/**
 * @swagger
 * /api/client/auth/me:
 *   get:
 *     summary: Get current client profile status (Parent/Professional/Both)
 *     tags: [Client Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Profile status fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     user:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                           example: "P-1"
 *                         username:
 *                           type: string
 *                           nullable: true
 *                           example: "Rohit"
 *                         phone_number:
 *                           type: string
 *                           example: "+911234567890"
 *                         last_login:
 *                           type: string
 *                           format: date-time
 *                     profiles:
 *                       type: object
 *                       properties:
 *                         isParent:
 *                           type: boolean
 *                         parentProfile:
 *                           type: object
 *                           nullable: true
 *                         childrenCount:
 *                           type: integer
 *                         isProfessional:
 *                           type: boolean
 *                         professionalProfile:
 *                           type: object
 *                           nullable: true
 *                         isTeacher:
 *                           type: boolean
 *                         teacherProfile:
 *                           type: object
 *                           nullable: true
 */
router.get('/me', clientAuthMiddleware, getMe);

module.exports = router;
