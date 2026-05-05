const express = require('express');
const router = express.Router();
const menuNutritionController = require('../controllers/menuNutritionController');
const clientAuthMiddleware = require('../middlewares/authMiddleware');

router.use(clientAuthMiddleware);

router.get('/today', menuNutritionController.getTodayNutrition);
router.get('/weekly', menuNutritionController.getWeeklyNutrition);

module.exports = router;
