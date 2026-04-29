const express = require('express');
const router = express.Router();
const adminAuthMiddleware = require('../middlewares/authMiddleware');
const masterDataController = require('../controllers/masterDataController');
const {
  validateCreateState,
  validateCreateCity,
  validateCreateCompany,
  validateCreateMealSize,
  validateIdParam,
  validateUpdateState,
  validateUpdateCity,
  validateUpdateCompany,
  validateUpdateMealSize
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
 */
router.post('/states', validateCreateState, masterDataController.createState);
/**
 * @swagger
 * /api/admin/lookup/states/{stateId}:
 *   put:
 *     summary: Update state
 *     tags: [Admin Master Data]
 *     security: [{ bearerAuth: [] }]
 */
router.put('/states/:stateId', validateIdParam('stateId'), validateUpdateState, masterDataController.updateState);
/**
 * @swagger
 * /api/admin/lookup/states/{stateId}:
 *   delete:
 *     summary: Delete state
 *     tags: [Admin Master Data]
 *     security: [{ bearerAuth: [] }]
 */
router.delete('/states/:stateId', validateIdParam('stateId'), masterDataController.deleteState);

/**
 * @swagger
 * /api/admin/lookup/cities:
 *   post:
 *     summary: Create city
 *     tags: [Admin Master Data]
 *     security: [{ bearerAuth: [] }]
 */
router.post('/cities', validateCreateCity, masterDataController.createCity);
/**
 * @swagger
 * /api/admin/lookup/cities/{cityId}:
 *   put:
 *     summary: Update city
 *     tags: [Admin Master Data]
 *     security: [{ bearerAuth: [] }]
 */
router.put('/cities/:cityId', validateIdParam('cityId'), validateUpdateCity, masterDataController.updateCity);
/**
 * @swagger
 * /api/admin/lookup/cities/{cityId}:
 *   delete:
 *     summary: Delete city
 *     tags: [Admin Master Data]
 *     security: [{ bearerAuth: [] }]
 */
router.delete('/cities/:cityId', validateIdParam('cityId'), masterDataController.deleteCity);

/**
 * @swagger
 * /api/admin/lookup/companies:
 *   post:
 *     summary: Create company
 *     tags: [Admin Master Data]
 *     security: [{ bearerAuth: [] }]
 */
router.post('/companies', validateCreateCompany, masterDataController.createCompany);
/**
 * @swagger
 * /api/admin/lookup/companies/{companyId}:
 *   put:
 *     summary: Update company
 *     tags: [Admin Master Data]
 *     security: [{ bearerAuth: [] }]
 */
router.put('/companies/:companyId', validateIdParam('companyId'), validateUpdateCompany, masterDataController.updateCompany);
/**
 * @swagger
 * /api/admin/lookup/companies/{companyId}:
 *   delete:
 *     summary: Delete company
 *     tags: [Admin Master Data]
 *     security: [{ bearerAuth: [] }]
 */
router.delete('/companies/:companyId', validateIdParam('companyId'), masterDataController.deleteCompany);

/**
 * @swagger
 * /api/admin/lookup/meal-sizes:
 *   post:
 *     summary: Create meal size
 *     tags: [Admin Master Data]
 *     security: [{ bearerAuth: [] }]
 */
router.post('/meal-sizes', validateCreateMealSize, masterDataController.createMealSize);
/**
 * @swagger
 * /api/admin/lookup/meal-sizes/{mealSizeId}:
 *   put:
 *     summary: Update meal size
 *     tags: [Admin Master Data]
 *     security: [{ bearerAuth: [] }]
 */
router.put('/meal-sizes/:mealSizeId', validateIdParam('mealSizeId'), validateUpdateMealSize, masterDataController.updateMealSize);
/**
 * @swagger
 * /api/admin/lookup/meal-sizes/{mealSizeId}:
 *   delete:
 *     summary: Delete meal size
 *     tags: [Admin Master Data]
 *     security: [{ bearerAuth: [] }]
 */
router.delete('/meal-sizes/:mealSizeId', validateIdParam('mealSizeId'), masterDataController.deleteMealSize);

module.exports = router;
