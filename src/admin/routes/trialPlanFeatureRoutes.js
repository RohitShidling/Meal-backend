const express = require('express');
const router = express.Router();
const adminAuthMiddleware = require('../middlewares/authMiddleware');
const controller = require('../controllers/trialPlanFeatureController');

router.use(adminAuthMiddleware);

router.post('/', controller.createTrialPlan);
router.get('/', controller.getTrialPlans);
router.get('/:id', controller.getTrialPlanById);
router.put('/:id', controller.updateTrialPlan);
router.patch('/:id/status', controller.setTrialPlanActive);
router.delete('/:id', controller.deleteTrialPlan);

module.exports = router;
