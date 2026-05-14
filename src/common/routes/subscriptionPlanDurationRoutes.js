const express = require('express');
const router = express.Router();
const commonAuthMiddleware = require('../middlewares/commonAuthMiddleware');
const requireClientRole = require('../middlewares/requireClientRoleMiddleware');
const subscriptionPlanDurationController = require('../controllers/subscriptionPlanDurationController');

router.use(commonAuthMiddleware);
router.use(requireClientRole);

router.get('/', subscriptionPlanDurationController.getSubscriptionPlans);
router.get('/:id', subscriptionPlanDurationController.getSubscriptionPlanById);

module.exports = router;
