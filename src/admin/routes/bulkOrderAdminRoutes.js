const express = require('express');
const router = express.Router();
const adminAuth = require('../middlewares/authMiddleware');
const bulkOrderConfigAdminController = require('../controllers/bulkOrderConfigAdminController');
const bulkOrderListAdminController = require('../controllers/bulkOrderListAdminController');
const bulkVarietyMealAdminController = require('../controllers/bulkVarietyMealAdminController');
const bulkVarietyUpload = require('../../common/middlewares/bulkVarietyUploadMiddleware');
const {
  validateUpdateConfig,
  validateVarietyMealId,
  validateCreateVarietyMeal,
  validateUpdateVarietyMeal,
} = require('../validators/bulkOrderAdminValidator');

router.get('/config', adminAuth, bulkOrderConfigAdminController.getConfig);
router.put('/config', adminAuth, validateUpdateConfig, bulkOrderConfigAdminController.updateConfig);

router.get('/variety-meals', adminAuth, bulkVarietyMealAdminController.listVarietyMeals);
router.post(
  '/variety-meals',
  adminAuth,
  bulkVarietyUpload.single('image'),
  validateCreateVarietyMeal,
  bulkVarietyMealAdminController.createVarietyMeal
);
router.put(
  '/variety-meals/:id',
  adminAuth,
  validateVarietyMealId,
  bulkVarietyUpload.single('image'),
  validateUpdateVarietyMeal,
  bulkVarietyMealAdminController.updateVarietyMeal
);
router.delete(
  '/variety-meals/:id',
  adminAuth,
  validateVarietyMealId,
  bulkVarietyMealAdminController.deleteVarietyMeal
);

router.get('/orders', adminAuth, bulkOrderListAdminController.listOrders);
router.get('/orders/:id', adminAuth, bulkOrderListAdminController.getOrderById);

module.exports = router;
