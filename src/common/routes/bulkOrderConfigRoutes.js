const express = require('express');
const router = express.Router();
const bulkOrderConfigController = require('../controllers/bulkOrderConfigController');

router.get('/config', bulkOrderConfigController.getConfig);
router.get('/menus', bulkOrderConfigController.getMenusForDelivery);
router.get('/variety-categories', bulkOrderConfigController.listVarietyCategories);
router.get('/variety-categories/:categoryId/meals', bulkOrderConfigController.getVarietyMealsByCategory);

module.exports = router;
