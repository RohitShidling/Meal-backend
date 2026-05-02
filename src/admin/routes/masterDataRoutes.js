const express = require('express');
const router = express.Router();
const adminAuthMiddleware = require('../middlewares/authMiddleware');
const masterDataController = require('../controllers/masterDataController');
const {
  validateCreateState,
  validateCreateCity,
  validateCreateMealSize,
  validateIdParam,
  validateUpdateState,
  validateUpdateCity,
  validateUpdateCompany,
  validateUpdateMealSize,
  validateCreateStandard,
  validateUpdateStandard
} = require('../validators/masterDataValidator');

/**
 * @swagger
 * tags:
 *   name: Admin Master Data
 *   description: Admin APIs for state, city, company and meal size management
 */

router.use(adminAuthMiddleware);

/**
 * @swagger
 * /api/admin/lookup/states:
 *   post:
 *     summary: Create state
 *     tags: [Admin Master Data]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Maharashtra"
 *               isActive:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Success" }
 *                 data: { type: object }
 *       400:
 *         description: Bad Request
 *       500:
 *         description: Server Error
 */
router.post('/states', validateCreateState, masterDataController.createState);

/**
 * @swagger
 * /api/admin/lookup/states/{stateId}:
 *   put:
 *     summary: Update state
 *     tags: [Admin Master Data]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: stateId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Success" }
 *                 data: { type: object }
 *       400:
 *         description: Bad Request
 *       500:
 *         description: Server Error
 */
router.put('/states/:stateId', validateIdParam('stateId'), validateUpdateState, masterDataController.updateState);

/**
 * @swagger
 * /api/admin/lookup/states/{stateId}:
 *   delete:
 *     summary: Delete state
 *     tags: [Admin Master Data]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: stateId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Success" }
 *                 data: { type: object }
 *       400:
 *         description: Bad Request
 *       500:
 *         description: Server Error
 */
router.delete('/states/:stateId', validateIdParam('stateId'), masterDataController.deleteState);


/**
 * @swagger
 * /api/admin/lookup/cities:
 *   post:
 *     summary: Create city
 *     tags: [Admin Master Data]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, stateId]
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Pune"
 *               stateId:
 *                 type: integer
 *                 example: 1
 *               isActive:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Success" }
 *                 data: { type: object }
 *       400:
 *         description: Bad Request
 *       500:
 *         description: Server Error
 */
router.post('/cities', validateCreateCity, masterDataController.createCity);

/**
 * @swagger
 * /api/admin/lookup/cities/{cityId}:
 *   put:
 *     summary: Update city
 *     tags: [Admin Master Data]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: cityId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               stateId:
 *                 type: integer
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Success" }
 *                 data: { type: object }
 *       400:
 *         description: Bad Request
 *       500:
 *         description: Server Error
 */
router.put('/cities/:cityId', validateIdParam('cityId'), validateUpdateCity, masterDataController.updateCity);

/**
 * @swagger
 * /api/admin/lookup/cities/{cityId}:
 *   delete:
 *     summary: Delete city
 *     tags: [Admin Master Data]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: cityId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Success" }
 *                 data: { type: object }
 *       400:
 *         description: Bad Request
 *       500:
 *         description: Server Error
 */
router.delete('/cities/:cityId', validateIdParam('cityId'), masterDataController.deleteCity);


/**
 * @swagger
 * /api/admin/lookup/companies:
 *   post:
 *     summary: Create company
 *     tags: [Admin Master Data]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Infosys"
 *               cityId:
 *                 type: integer
 *                 example: 1
 *               isActive:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Success" }
 *                 data: { type: object }
 *       400:
 *         description: Bad Request
 *       500:
 *         description: Server Error
 */


/**
 * @swagger
 * /api/admin/lookup/companies/{companyId}:
 *   put:
 *     summary: Update company
 *     tags: [Admin Master Data]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               cityId:
 *                 type: integer
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Success" }
 *                 data: { type: object }
 *       400:
 *         description: Bad Request
 *       500:
 *         description: Server Error
 */


/**
 * @swagger
 * /api/admin/lookup/companies/{companyId}:
 *   delete:
 *     summary: Delete company
 *     tags: [Admin Master Data]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Success" }
 *                 data: { type: object }
 *       400:
 *         description: Bad Request
 *       500:
 *         description: Server Error
 */



/**
 * @swagger
 * /api/admin/lookup/meal-sizes:
 *   post:
 *     summary: Create meal size
 *     tags: [Admin Master Data]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, displayName]
 *             properties:
 *               name:
 *                 type: string
 *                 example: "extra_large"
 *               displayName:
 *                 type: string
 *                 example: "Extra Large"
 *               sortOrder:
 *                 type: integer
 *                 example: 4
 *               isActive:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Success" }
 *                 data: { type: object }
 *       400:
 *         description: Bad Request
 *       500:
 *         description: Server Error
 */
router.post('/meal-sizes', validateCreateMealSize, masterDataController.createMealSize);

/**
 * @swagger
 * /api/admin/lookup/meal-sizes/{mealSizeId}:
 *   put:
 *     summary: Update meal size
 *     tags: [Admin Master Data]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: mealSizeId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               displayName:
 *                 type: string
 *               sortOrder:
 *                 type: integer
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Success" }
 *                 data: { type: object }
 *       400:
 *         description: Bad Request
 *       500:
 *         description: Server Error
 */
router.put('/meal-sizes/:mealSizeId', validateIdParam('mealSizeId'), validateUpdateMealSize, masterDataController.updateMealSize);

/**
 * @swagger
 * /api/admin/lookup/meal-sizes/{mealSizeId}:
 *   delete:
 *     summary: Delete meal size
 *     tags: [Admin Master Data]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: mealSizeId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Success" }
 *                 data: { type: object }
 *       400:
 *         description: Bad Request
 *       500:
 *         description: Server Error
 */
router.delete('/meal-sizes/:mealSizeId', validateIdParam('mealSizeId'), masterDataController.deleteMealSize);

/**
 * @swagger
 * /api/admin/lookup/standards:
 *   post:
 *     summary: Create standard
 *     tags: [Admin Master Data]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, displayName]
 *             properties:
 *               name:
 *                 type: string
 *               displayName:
 *                 type: string
 *               numericValue:
 *                 type: integer
 *               isActive:
 *                 type: boolean
 *     responses:
 *       201:
 *         description: Success
 */
router.post('/standards', validateCreateStandard, masterDataController.createStandard);

/**
 * @swagger
 * /api/admin/lookup/standards/{standardId}:
 *   put:
 *     summary: Update standard
 *     tags: [Admin Master Data]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: standardId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               displayName:
 *                 type: string
 *               numericValue:
 *                 type: integer
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Success
 */
router.put('/standards/:standardId', validateIdParam('standardId'), validateUpdateStandard, masterDataController.updateStandard);

/**
 * @swagger
 * /api/admin/lookup/standards/{standardId}:
 *   delete:
 *     summary: Delete standard
 *     tags: [Admin Master Data]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: standardId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Success
 */
router.delete('/standards/:standardId', validateIdParam('standardId'), masterDataController.deleteStandard);

module.exports = router;
