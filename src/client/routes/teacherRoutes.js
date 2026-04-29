const express = require('express');
const router = express.Router();
const teacherController = require('../controllers/teacherController');
const clientAuthMiddleware = require('../middlewares/authMiddleware');
const commonAuthMiddleware = require('../../common/middlewares/commonAuthMiddleware');

/**
 * @swagger
 * tags:
 *   name: Client Teacher Profile
 *   description: Teacher profile management for Clients
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     TeacherProfile:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           example: "TCH-1"
 *         client_id:
 *           type: string
 *           example: "P-1"
 *         name:
 *           type: string
 *           example: "Mrs. Sarah Smith"
 *         school_college_name:
 *           type: string
 *           example: "Global International School"
 *         city:
 *           type: string
 *           example: "Bangalore"
 *         state:
 *           type: string
 *           example: "Karnataka"
 *         status:
 *           type: string
 *           example: "active"
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 */

/**
 * @swagger
 * /api/client/teacher/profile:
 *   post:
 *     summary: Create or Update teacher profile (Client ONLY)
 *     tags: [Client Teacher Profile]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - school_college_name
 *               - city
 *               - state
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Mrs. Sarah Smith"
 *               school_college_name:
 *                 type: string
 *                 example: "Global International School"
 *               city:
 *                 type: string
 *                 example: "Bangalore"
 *               state:
 *                 type: string
 *                 example: "Karnataka"
 *               status:
 *                 type: string
 *                 example: "active"
 *     responses:
 *       200:
 *         description: Teacher profile saved successfully
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
 *                   example: "Teacher profile created successfully"
 *                 data:
 *                   $ref: '#/components/schemas/TeacherProfile'
 *       403:
 *         description: Forbidden (Mutual exclusivity rule violated - Professional profile already exists)
 *       401:
 *         description: Unauthorized
 */
router.post('/profile', clientAuthMiddleware, teacherController.saveTeacherProfile);

/**
 * @swagger
 * /api/client/teacher/profile:
 *   put:
 *     summary: Update teacher profile (Client ONLY)
 *     tags: [Client Teacher Profile]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Mrs. Sarah Smith"
 *               school_college_name:
 *                 type: string
 *                 example: "Global International School"
 *               city:
 *                 type: string
 *                 example: "Bangalore"
 *               state:
 *                 type: string
 *                 example: "Karnataka"
 *               status:
 *                 type: string
 *                 example: "active"
 *     responses:
 *       200:
 *         description: Teacher profile updated successfully
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
 *                   example: "Teacher profile updated successfully"
 *                 data:
 *                   $ref: '#/components/schemas/TeacherProfile'
 */
router.put('/profile', clientAuthMiddleware, teacherController.saveTeacherProfile);

/**
 * @swagger
 * /api/client/teacher/profile:
 *   get:
 *     summary: Get teacher profile (Client & Admin)
 *     tags: [Client Teacher Profile]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: clientId
 *         schema:
 *           type: string
 *         description: (Admin only) Specific client ID to fetch profile for
 *     responses:
 *       200:
 *         description: Teacher profile details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/TeacherProfile'
 */
router.get('/profile', commonAuthMiddleware, teacherController.getTeacherProfile);

/**
 * @swagger
 * /api/client/teacher/profile:
 *   delete:
 *     summary: Delete teacher profile
 *     tags: [Client Teacher Profile]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: clientId
 *         schema:
 *           type: string
 *         description: (Admin only) Specific client ID to delete profile for
 *     responses:
 *       200:
 *         description: Teacher profile deleted successfully
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
 *                   example: "Teacher profile deleted successfully"
 *                 data:
 *                   $ref: '#/components/schemas/TeacherProfile'
 *       404:
 *         description: Profile not found
 */
router.delete('/profile', commonAuthMiddleware, teacherController.deleteTeacherProfile);

module.exports = router;
