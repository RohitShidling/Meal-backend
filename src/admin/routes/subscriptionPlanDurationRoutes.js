const express = require('express');
const router = express.Router();
const subscriptionPlanDurationController = require('../controllers/subscriptionPlanDurationController');
const adminAuthMiddleware = require('../middlewares/authMiddleware');

router.use(adminAuthMiddleware);

router.get('/', subscriptionPlanDurationController.getAllSubscriptionPlans);
router.get('/:id', subscriptionPlanDurationController.getSubscriptionPlanById);
router.post('/', subscriptionPlanDurationController.createSubscriptionPlan);
router.put('/:id', subscriptionPlanDurationController.updateSubscriptionPlan);

module.exports = router;
