const express = require('express');
const router = express.Router();
const adminAuth = require('../middlewares/authMiddleware');
const menuNutritionController = require('../controllers/menuNutritionController');

router.use(adminAuth);

router.post('/', menuNutritionController.upsertMenuNutrition);
router.get('/history/all', menuNutritionController.getMenuNutritionHistory);
router.get('/:date', menuNutritionController.getMenuNutritionByDate);

module.exports = router;
