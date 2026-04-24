const express = require('express');
const router = express.Router();
const clientAuthMiddleware = require('../middlewares/authMiddleware');
const { addChildren, getMyChildren } = require('../controllers/childController');
const { validateAddChildren } = require('../validators/childValidator');

// All child routes require client JWT
router.use(clientAuthMiddleware);

/**
 * @swagger
 * tags:
 *   name: Client - Children
 *   description: Child/Student management APIs (Client only)
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     Child:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           example: "CH-1"
 *         parent_id:
 *           type: string
 *           example: "P-1"
 *         name:
 *           type: string
 *           example: "Rahul Kumar"
 *         roll_number:
 *           type: string
 *           example: "STU12345"
 *         school_id:
 *           type: string
 *           example: "SH-1"
 *         standard_id:
 *           type: integer
 *           example: 5
 *         meal_size_id:
 *           type: integer
 *           example: 2
 *         meal_time:
 *           type: string
 *           example: "12:30"
 *         created_at:
 *           type: string
 *           format: date-time
 *
 *     AddChildrenRequest:
 *       type: object
 *       required:
 *         - children
 *       properties:
 *         children:
 *           type: array
 *           items:
 *             type: object
 *             required:
 *               - name
 *               - rollNumber
 *               - schoolId
 *               - standardId
 *               - mealSizeId
 *               - mealTime
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Rahul Kumar"
 *               rollNumber:
 *                 type: string
 *                 example: "STU12345"
 *               schoolId:
 *                 type: string
 *                 example: "SH-1"
 *               standardId:
 *                 type: integer
 *                 example: 5
 *               mealSizeId:
 *                 type: integer
 *                 example: 2
 *               mealTime:
 *                 type: string
 *                 example: "12:30"
 */

/**
 * @swagger
 * /api/client/children:
 *   post:
 *     summary: Register one or more children (Max 3 total per parent)
 *     tags: [Client - Children]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AddChildrenRequest'
 *     responses:
 *       201:
 *         description: Children registered successfully
 *       400:
 *         description: Validation error or limit exceeded
 *       401:
 *         description: Unauthorized
 */
router.post('/', validateAddChildren, addChildren);

/**
 * @swagger
 * /api/client/children:
 *   get:
 *     summary: Get all children registered by the authenticated client
 *     tags: [Client - Children]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Children fetched successfully
 *       401:
 *         description: Unauthorized
 */
router.get('/', getMyChildren);

module.exports = router;
