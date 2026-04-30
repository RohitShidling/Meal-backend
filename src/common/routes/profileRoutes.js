const express = require('express');
const router = express.Router();
const commonAuthMiddleware = require('../middlewares/commonAuthMiddleware');
const { getMyProfile } = require('../controllers/profileController');

/**
 * @swagger
 * tags:
 *   name: Common Profile
 *   description: Shared profile APIs
 */

router.use(commonAuthMiddleware);
/**
 * @swagger
 * /api/common/profile/me:
 *   get:
 *     summary: Get profile details for client or admin-selected client
 *     tags: [Common Profile]
 *     security: [{ bearerAuth: [] }]
 */
router.get('/me', getMyProfile);

module.exports = router;
