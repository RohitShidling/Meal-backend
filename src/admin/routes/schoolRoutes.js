const express = require('express');
const router = express.Router();
const adminAuthMiddleware = require('../middlewares/authMiddleware');
const {
  addSchool,
  editSchool,
  getAllSchools,
  getSchoolById,
  deleteSchool,
} = require('../controllers/schoolController');
const { validateAddSchool, validateEditSchool } = require('../validators/schoolValidator');

// All school routes require admin JWT
router.use(adminAuthMiddleware);

/**
 * @swagger
 * tags:
 *   name: Admin - Schools
 *   description: School management APIs (Admin only)
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     School:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           example: 1
 *         name:
 *           type: string
 *           example: "St. Mary's High School"
 *         address:
 *           type: string
 *           example: "123 Main Street, Near Central Park"
 *         city:
 *           type: string
 *           example: "Bangalore"
 *         state:
 *           type: string
 *           example: "Karnataka"
 *         pincode:
 *           type: string
 *           example: "560001"
 *         country:
 *           type: string
 *           example: "India"
 *         is_active:
 *           type: boolean
 *           example: true
 *         is_deleted:
 *           type: boolean
 *           example: false
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 *
 *     AddSchoolRequest:
 *       type: object
 *       required:
 *         - name
 *         - address
 *         - city
 *         - state
 *         - pincode
 *       properties:
 *         name:
 *           type: string
 *           example: "St. Mary's High School"
 *         address:
 *           type: string
 *           example: "123 Main Street, Near Central Park"
 *         city:
 *           type: string
 *           example: "Bangalore"
 *         state:
 *           type: string
 *           example: "Karnataka"
 *         pincode:
 *           type: string
 *           example: "560001"
 *         country:
 *           type: string
 *           example: "India"
 *
 *     EditSchoolRequest:
 *       type: object
 *       properties:
 *         name:
 *           type: string
 *           example: "Updated School Name"
 *         address:
 *           type: string
 *           example: "456 New Street, Block B"
 *         city:
 *           type: string
 *           example: "Mysore"
 *         state:
 *           type: string
 *           example: "Karnataka"
 *         pincode:
 *           type: string
 *           example: "570001"
 *         country:
 *           type: string
 *           example: "India"
 *         is_active:
 *           type: boolean
 *           example: false
 */

/**
 * @swagger
 * /api/admin/schools:
 *   post:
 *     summary: Add a new school
 *     tags: [Admin - Schools]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AddSchoolRequest'
 *     responses:
 *       201:
 *         description: School added successfully
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
 *                   example: "School added successfully."
 *                 data:
 *                   type: object
 *                   properties:
 *                     school:
 *                       $ref: '#/components/schemas/School'
 *       400:
 *         description: Validation error - missing required fields
 *       401:
 *         description: Unauthorized - Admin JWT required
 *       409:
 *         description: Conflict - School name already exists
 */
router.post('/', validateAddSchool, addSchool);

/**
 * @swagger
 * /api/admin/schools:
 *   get:
 *     summary: Get all schools with pagination and search
 *     tags: [Admin - Schools]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Records per page
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by school name or city
 *     responses:
 *       200:
 *         description: Schools fetched successfully
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
 *                   example: "Schools fetched successfully."
 *                 data:
 *                   type: object
 *                   properties:
 *                     schools:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/School'
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         currentPage:
 *                           type: integer
 *                           example: 1
 *                         totalPages:
 *                           type: integer
 *                           example: 5
 *                         totalItems:
 *                           type: integer
 *                           example: 50
 *                         itemsPerPage:
 *                           type: integer
 *                           example: 10
 *       401:
 *         description: Unauthorized - Admin JWT required
 */
router.get('/', getAllSchools);

/**
 * @swagger
 * /api/admin/schools/{id}:
 *   get:
 *     summary: Get a single school by ID
 *     tags: [Admin - Schools]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: School ID
 *     responses:
 *       200:
 *         description: School fetched successfully
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
 *                   example: "School fetched successfully."
 *                 data:
 *                   type: object
 *                   properties:
 *                     school:
 *                       $ref: '#/components/schemas/School'
 *       401:
 *         description: Unauthorized - Admin JWT required
 *       404:
 *         description: School not found
 */
router.get('/:id', getSchoolById);

/**
 * @swagger
 * /api/admin/schools/{id}:
 *   put:
 *     summary: Edit an existing school
 *     tags: [Admin - Schools]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: School ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/EditSchoolRequest'
 *     responses:
 *       200:
 *         description: School updated successfully
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
 *                   example: "School updated successfully."
 *                 data:
 *                   type: object
 *                   properties:
 *                     school:
 *                       $ref: '#/components/schemas/School'
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized - Admin JWT required
 *       404:
 *         description: School not found
 *       409:
 *         description: Conflict - School name already taken
 */
router.put('/:id', validateEditSchool, editSchool);

/**
 * @swagger
 * /api/admin/schools/{id}:
 *   delete:
 *     summary: Soft-delete a school
 *     tags: [Admin - Schools]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: School ID
 *     responses:
 *       200:
 *         description: School deleted successfully
 *       401:
 *         description: Unauthorized - Admin JWT required
 *       404:
 *         description: School not found
 */
router.delete('/:id', deleteSchool);

module.exports = router;
