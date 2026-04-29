const express = require('express');
const router = express.Router();
const adminAuthMiddleware = require('../middlewares/authMiddleware');
const trialPlanController = require('../controllers/trialPlanController');
const {
  validateCreateTrialPlan,
  validateUpdateTrialPlan,
  validateTrialPlanId,
  validateSetActive
} = require('../validators/trialPlanValidator');

/**
 * @swagger
 * tags:
 *   name: Admin Trial Plans
 *   description: Dedicated admin APIs to manage trial subscription plans
 */

router.use(adminAuthMiddleware);

/**
 * @swagger
 * /api/admin/trial-plans:
 *   post:
 *     summary: Create trial plan
 *     tags: [Admin Trial Plans]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [plan_name, price, billing_cycle, trial_days]
 *             properties:
 *               plan_name: { type: string, example: "Trial Monthly" }
 *               price: { type: number, example: 49 }
 *               billing_cycle: { type: string, example: "Monthly" }
 *               trial_days: { type: integer, example: 7 }
 *               display_order: { type: integer, example: 1 }
 *               is_active: { type: boolean, example: true }
 *     responses:
 *       201:
 *         description: Trial plan created successfully
 *       409:
 *         description: Duplicate trial plan
 */
router.post('/', validateCreateTrialPlan, trialPlanController.createTrialPlan);

/**
 * @swagger
 * /api/admin/trial-plans:
 *   get:
 *     summary: List all trial plans
 *     tags: [Admin Trial Plans]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Trial plans fetched successfully
 */
router.get('/', trialPlanController.getTrialPlans);

/**
 * @swagger
 * /api/admin/trial-plans/{id}:
 *   get:
 *     summary: Get trial plan by id
 *     tags: [Admin Trial Plans]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Trial plan fetched successfully
 *       404:
 *         description: Trial plan not found
 */
router.get('/:id', validateTrialPlanId, trialPlanController.getTrialPlanById);

/**
 * @swagger
 * /api/admin/trial-plans/{id}:
 *   put:
 *     summary: Update trial plan
 *     tags: [Admin Trial Plans]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
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
 *               plan_name: { type: string, example: "Trial Plus" }
 *               price: { type: number, example: 99 }
 *               billing_cycle: { type: string, example: "Monthly" }
 *               trial_days: { type: integer, example: 10 }
 *               display_order: { type: integer, example: 2 }
 *               is_active: { type: boolean, example: true }
 *     responses:
 *       200:
 *         description: Trial plan updated successfully
 */
router.put('/:id', validateTrialPlanId, validateUpdateTrialPlan, trialPlanController.updateTrialPlan);

/**
 * @swagger
 * /api/admin/trial-plans/{id}/status:
 *   patch:
 *     summary: Activate or deactivate trial plan
 *     tags: [Admin Trial Plans]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [is_active]
 *             properties:
 *               is_active: { type: boolean, example: false }
 *     responses:
 *       200:
 *         description: Trial plan status updated successfully
 */
router.patch('/:id/status', validateTrialPlanId, validateSetActive, trialPlanController.setTrialPlanActive);

/**
 * @swagger
 * /api/admin/trial-plans/{id}:
 *   delete:
 *     summary: Delete trial plan
 *     tags: [Admin Trial Plans]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Trial plan deleted successfully
 */
router.delete('/:id', validateTrialPlanId, trialPlanController.deleteTrialPlan);

module.exports = router;
