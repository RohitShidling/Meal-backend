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
 *           type: string
 *           example: "SH-1"
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
 *         created_by:
 *           type: integer
 *           example: 1
 *         updated_by:
 *           type: integer
 *           example: 1
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
 *         description: Validation error
 *       409:
 *         description: Conflict (School already exists)
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
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
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
 *                         totalPages:
 *                           type: integer
 *                         totalItems:
 *                           type: integer
 *                         itemsPerPage:
 *                           type: integer
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
 *           type: string
 *           example: "SH-1"
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
 *           type: string
 *           example: "SH-1"
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/School'
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
 *           type: string
 *           example: "SH-1"
 *     responses:
 *       200:
 *         description: School deleted successfully
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
 *                   example: "School deleted successfully."
 */
router.delete('/:id', deleteSchool);

module.exports = router;
