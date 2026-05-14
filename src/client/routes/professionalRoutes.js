const express = require('express');
const router = express.Router();
const professionalController = require('../controllers/professionalController');
const authMiddleware = require('../middlewares/authMiddleware');
const { validateProfessionalProfile } = require('../validators/profileValidator');

/**
 * @swagger
 * tags:
 *   name: Client Professional Profile
 *   description: Professional profile APIs for the mobile client JWT only. Admins use admin routes — no clientId impersonation on these paths (G2).
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     ProfessionalProfile:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           example: "PRO-1"
 *         client_id:
 *           type: string
 *           example: "P-1"
 *         name:
 *           type: string
 *           example: "John Doe"
 *         company_name:
 *           type: string
 *           example: "Tech Solutions Inc."
 *         corporate_location_id:
 *           type: string
 *           example: "CL-1"
 *         corporate_location_name:
 *           type: string
 *           example: "Main Tech Hub"
 *         corporate_location_address:
 *           type: string
 *           example: "123 Business Park"
 *         city:
 *           type: string
 *           example: "Bangalore"
 *         state:
 *           type: string
 *           example: "Karnataka"
 *         lunch_time:
 *           type: string
 *           example: "13:00:00"
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 */

router.use(authMiddleware);

/**
 * @swagger
 * /api/client/professional/profile:
 *   post:
 *     summary: Create or Update professional profile
 *     tags: [Client Professional Profile]
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
 *               - company_name
 *               - corporate_location_id
 *               - city
 *               - state
 *               - lunch_time
 *             properties:
 *               name:
 *                 type: string
 *                 description: Full name of the professional. Cannot be purely numerical.
 *                 example: "John Doe"
 *               company_name:
 *                 type: string
 *                 example: "Tech Solutions Inc."
 *               corporate_location_id:
 *                 type: string
 *                 example: "CL-1"
 *               city:
 *                 type: string
 *                 example: "Bangalore"
 *               state:
 *                 type: string
 *                 example: "Karnataka"
 *               lunch_time:
 *                 type: string
 *                 format: time
 *                 example: "13:00:00"
 *     responses:
 *       200:
 *         description: Profile saved successfully
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
 *                   example: "Professional profile created successfully"
 *                 data:
 *                   $ref: '#/components/schemas/ProfessionalProfile'
 *       400:
 *         description: Bad Request (missing fields or invalid location)
 */
router.post('/profile', validateProfessionalProfile, professionalController.saveProfessionalProfile);

/**
 * @swagger
 * /api/client/professional/profile:
 *   put:
 *     summary: Update professional profile
 *     tags: [Client Professional Profile]
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
 *                 description: Full name of the professional. Cannot be purely numerical.
 *                 example: "John Doe"
 *               company_name:
 *                 type: string
 *                 example: "Tech Solutions Inc."
 *               corporate_location_id:
 *                 type: string
 *                 example: "CL-1"
 *               city:
 *                 type: string
 *                 example: "Bangalore"
 *               state:
 *                 type: string
 *                 example: "Karnataka"
 *               lunch_time:
 *                 type: string
 *                 format: time
 *                 example: "13:00:00"
 *     responses:
 *       200:
 *         description: Professional profile updated successfully
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
 *                   example: "Professional profile updated successfully"
 *                 data:
 *                   $ref: '#/components/schemas/ProfessionalProfile'
 */
router.put('/profile', validateProfessionalProfile, professionalController.saveProfessionalProfile);

/**
 * @swagger
 * /api/client/professional/profile:
 *   get:
 *     summary: Get professional profile (authenticated client only)
 *     tags: [Client Professional Profile]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Professional profile details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/ProfessionalProfile'
 */
router.get('/profile', professionalController.getProfessionalProfile);

/**
 * @swagger
 * /api/client/professional/profile:
 *   delete:
 *     summary: Delete professional profile (authenticated client only)
 *     tags: [Client Professional Profile]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Professional profile deleted successfully
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
 *                   example: "Professional profile deleted successfully"
 *                 data:
 *                   $ref: '#/components/schemas/ProfessionalProfile'
 *       400:
 *         description: Cannot delete profile due to active subscriptions
 *       404:
 *         description: Profile not found
 */
router.delete('/profile', professionalController.deleteProfessionalProfile);

module.exports = router;
