const express = require('express');
const router = express.Router();
const clientAuthMiddleware = require('../middlewares/authMiddleware');
const { addChildren, getMyChildren, updateChild, deleteChild } = require('../controllers/childController');
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
 *           example: "12:30:00"
 *         created_at:
 *           type: string
 *           format: date-time
 *         school_name:
 *           type: string
 *           example: "St. Mary's High School"
 *         standard_name:
 *           type: string
 *           example: "5th Standard"
 *         meal_size_name:
 *           type: string
 *           example: "Medium"
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
 *                 example: "12:30:00"
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
 *                   example: "Children registered successfully."
 *                 data:
 *                   type: object
 *                   properties:
 *                     children:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Child'
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
 *                   example: "Children fetched successfully."
 *                 data:
 *                   type: object
 *                   properties:
 *                     children:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Child'
 *       401:
 *         description: Unauthorized
 */
router.get('/', getMyChildren);

/**
 * @swagger
 * /api/client/children/{childId}:
 *   put:
 *     summary: Update specific child details
 *     tags: [Client - Children]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: childId
 *         required: true
 *         schema:
 *           type: string
 *         example: "CH-1"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
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
 *                 example: "12:30:00"
 *     responses:
 *       200:
 *         description: Child updated successfully
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
 *                   example: "Child updated successfully."
 *                 data:
 *                   $ref: '#/components/schemas/Child'
 *       404:
 *         description: Child not found or unauthorized
 */
router.put('/:childId', updateChild);

/**
 * @swagger
 * /api/client/children/{childId}:
 *   delete:
 *     summary: Delete a specific child
 *     tags: [Client - Children]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: childId
 *         required: true
 *         schema:
 *           type: string
 *         example: "CH-1"
 *     responses:
 *       200:
 *         description: Child deleted successfully
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
 *                   example: "Child deleted successfully."
 *                 data:
 *                   $ref: '#/components/schemas/Child'
 *       404:
 *         description: Child not found or unauthorized
 */
router.delete('/:childId', deleteChild);

module.exports = router;
