const express = require('express');
const router = express.Router();
const professionalController = require('../controllers/professionalController');
const clientAuthMiddleware = require('../middlewares/authMiddleware');

/**
 * @swagger
 * tags:
 *   name: Client Professional Profile
 *   description: Professional profile management for Clients
 */

// We assume client has their own auth middleware or we use a common one if structured so
// Looking at earlier list_dir, client/middlewares exists.
const authMiddleware = require('../../common/middlewares/commonAuthMiddleware'); 
// Actually, server.js used clientAuthRoutes but let's check client middlewares.

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
 *               company_name:
 *                 type: string
 *               corporate_location_id:
 *                 type: string
 *               city:
 *                 type: string
 *               state:
 *                 type: string
 *               lunch_time:
 *                 type: string
 *                 format: time
 *                 example: "13:00:00"
 *     responses:
 *       200:
 *         description: Profile saved successfully
 */
router.post('/profile', professionalController.saveProfessionalProfile);

/**
 * @swagger
 * /api/client/professional/profile:
 *   get:
 *     summary: Get professional profile
 *     tags: [Client Professional Profile]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Professional profile details
 */
router.get('/profile', professionalController.getProfessionalProfile);

module.exports = router;
