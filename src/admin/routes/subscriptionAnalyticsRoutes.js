const express = require('express');
const router = express.Router();
const analytics = require('../controllers/subscriptionAnalyticsController');
const adminAuth = require('../middlewares/authMiddleware');

router.use(adminAuth);

/**
 * @swagger
 * tags:
 *   name: Admin - Subscription Analytics
 *   description: Subscription analytics and reporting by school, teacher, professional
 */

/**
 * @swagger
 * /api/admin/subscriptions/analytics/overview:
 *   get:
 *     summary: Overview — total subscriptions, active, expired and revenue by entity type
 *     tags: [Admin - Subscription Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Overview stats
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     byEntityType:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           entity_type: { type: string, example: "child" }
 *                           total_subscribed: { type: integer, example: 50 }
 *                           active_count: { type: integer, example: 40 }
 *                           expired_count: { type: integer, example: 10 }
 *                           total_revenue: { type: number, example: 32000.00 }
 *                     totals:
 *                       type: object
 *                       properties:
 *                         grand_total: { type: integer }
 *                         grand_active: { type: integer }
 *                         grand_revenue: { type: number }
 */
router.get('/analytics/overview', analytics.getSubscriptionOverview);

/**
 * @swagger
 * /api/admin/subscriptions/analytics/by-school:
 *   get:
 *     summary: School-wise subscription counts and revenue
 *     tags: [Admin - Subscription Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: schoolId
 *         schema: { type: string }
 *         description: Filter by specific school ID
 *       - in: query
 *         name: isActive
 *         schema: { type: string, enum: [true, false] }
 *       - in: query
 *         name: startDate
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: endDate
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: School-wise subscription data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     total: { type: integer }
 *                     page: { type: integer }
 *                     limit: { type: integer }
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       school_id: { type: string }
 *                       school_name: { type: string }
 *                       city: { type: string }
 *                       total_subscriptions: { type: integer }
 *                       active_subscriptions: { type: integer }
 *                       expired_subscriptions: { type: integer }
 *                       total_children: { type: integer }
 *                       total_revenue: { type: number }
 *                       earliest_expiry: { type: string, format: date-time }
 *                       latest_expiry: { type: string, format: date-time }
 */
router.get('/analytics/by-school', analytics.getBySchool);

/**
 * @swagger
 * /api/admin/subscriptions/analytics/school/{schoolId}/children:
 *   get:
 *     summary: Detailed children subscription list for a specific school
 *     tags: [Admin - Subscription Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: schoolId
 *         required: true
 *         schema: { type: string }
 *         description: School ID (e.g., SH-1)
 *       - in: query
 *         name: isActive
 *         schema: { type: string, enum: [true, false] }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Children with subscription details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 school:
 *                   type: object
 *                   properties:
 *                     id: { type: string }
 *                     name: { type: string }
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       child_name: { type: string }
 *                       roll_number: { type: string }
 *                       parent_phone: { type: string }
 *                       standard: { type: string }
 *                       meal_size: { type: string }
 *                       plan_name: { type: string }
 *                       amount_paid: { type: number }
 *                       start_date: { type: string, format: date-time }
 *                       end_date: { type: string, format: date-time }
 *                       days_remaining: { type: integer }
 *                       status: { type: string, example: "active" }
 *       404:
 *         description: School not found
 */
router.get('/analytics/school/:schoolId/children', analytics.getChildrenBySchool);

/**
 * @swagger
 * /api/admin/subscriptions/analytics/teachers:
 *   get:
 *     summary: All teacher subscriptions — filterable by school name, active status, date range
 *     tags: [Admin - Subscription Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: schoolName
 *         schema: { type: string }
 *         description: Filter by school/college name (partial match)
 *       - in: query
 *         name: isActive
 *         schema: { type: string, enum: [true, false] }
 *       - in: query
 *         name: startDate
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: endDate
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Teacher subscriptions list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       teacher_name: { type: string }
 *                       school_college_name: { type: string }
 *                       phone_number: { type: string }
 *                       plan_name: { type: string }
 *                       amount_paid: { type: number }
 *                       end_date: { type: string, format: date-time }
 *                       days_remaining: { type: integer }
 *                       status: { type: string, example: "active" }
 */
router.get('/analytics/teachers', analytics.getTeacherSubscriptions);

/**
 * @swagger
 * /api/admin/subscriptions/analytics/professionals:
 *   get:
 *     summary: All professional subscriptions — filterable by location, city, active status
 *     tags: [Admin - Subscription Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: locationId
 *         schema: { type: string }
 *         description: Filter by corporate location ID
 *       - in: query
 *         name: city
 *         schema: { type: string }
 *         description: Filter by city (partial match)
 *       - in: query
 *         name: isActive
 *         schema: { type: string, enum: [true, false] }
 *       - in: query
 *         name: startDate
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: endDate
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Professional subscriptions list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       professional_name: { type: string }
 *                       company_name: { type: string }
 *                       corporate_location: { type: string }
 *                       city: { type: string }
 *                       phone_number: { type: string }
 *                       plan_name: { type: string }
 *                       amount_paid: { type: number }
 *                       end_date: { type: string, format: date-time }
 *                       days_remaining: { type: integer }
 *                       status: { type: string, example: "active" }
 */
router.get('/analytics/professionals', analytics.getProfessionalSubscriptions);

/**
 * @swagger
 * /api/admin/subscriptions/analytics/expiring-soon:
 *   get:
 *     summary: Subscriptions expiring within the next N days (for renewal alerts)
 *     tags: [Admin - Subscription Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: days
 *         schema: { type: integer, default: 7 }
 *         description: Number of days ahead to check
 *       - in: query
 *         name: entityType
 *         schema:
 *           type: string
 *           enum: [child, teacher, professional]
 *     responses:
 *       200:
 *         description: Subscriptions expiring soon
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 message: { type: string, example: "Subscriptions expiring within 7 days" }
 *                 count: { type: integer }
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       entity_type: { type: string }
 *                       entity_name: { type: string }
 *                       institution_name: { type: string }
 *                       client_phone: { type: string }
 *                       plan_name: { type: string }
 *                       end_date: { type: string, format: date-time }
 *                       days_remaining: { type: integer }
 */
router.get('/analytics/expiring-soon', analytics.getExpiringSoon);

/**
 * @swagger
 * /api/admin/subscriptions/analytics/all-members:
 *   get:
 *     summary: Full subscription status for ALL members — subscribed, expired, and never subscribed
 *     tags: [Admin - Subscription Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: entityType
 *         schema:
 *           type: string
 *           enum: [child, teacher, professional]
 *         description: Filter by member type (leave blank for all)
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, expired, never_subscribed, subscribed]
 *         description: >
 *           active = currently active subscription,
 *           expired = had subscription but it ended,
 *           never_subscribed = never subscribed at all,
 *           subscribed = active + expired combined
 *       - in: query
 *         name: schoolId
 *         schema:
 *           type: string
 *         description: Filter children by school ID
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Complete member subscription status list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 summary:
 *                   type: object
 *                   properties:
 *                     total_members: { type: integer, example: 120 }
 *                     active_subscriptions: { type: integer, example: 80 }
 *                     expired_subscriptions: { type: integer, example: 25 }
 *                     never_subscribed: { type: integer, example: 15 }
 *                 pagination:
 *                   type: object
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       entity_type: { type: string, example: "child" }
 *                       entity_name: { type: string, example: "Raju" }
 *                       identifier: { type: string, example: "ROL-001" }
 *                       institution_name: { type: string, example: "Delhi Public School" }
 *                       client_phone: { type: string, example: "+919876543210" }
 *                       status: { type: string, example: "active" }
 *                       start_date: { type: string, format: date-time }
 *                       end_date: { type: string, format: date-time }
 *                       days_remaining: { type: integer, example: 22 }
 *                       plan_name: { type: string, example: "Monthly Plan" }
 *                       amount_paid: { type: number, example: 800.00 }
 */
router.get('/analytics/all-members', analytics.getAllMembersSubscriptionStatus);

/**
 * @swagger
 * /api/admin/subscriptions/analytics/not-subscribed:
 *   get:
 *     summary: List ALL members who have NEVER subscribed
 *     tags: [Admin - Subscription Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: entityType
 *         schema:
 *           type: string
 *           enum: [child, teacher, professional]
 *       - in: query
 *         name: schoolId
 *         schema: { type: string }
 *         description: Filter unsubscribed children by school
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Members who never subscribed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 total_unsubscribed: { type: integer, example: 15 }
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       entity_type: { type: string, example: "child" }
 *                       entity_name: { type: string, example: "Ananya" }
 *                       identifier: { type: string, example: "ROL-005" }
 *                       institution_name: { type: string, example: "Ryan International" }
 *                       client_phone: { type: string, example: "+919876543210" }
 *                       registered_on: { type: string, format: date-time }
 */
router.get('/analytics/not-subscribed', analytics.getUnsubscribedMembers);

/**
 * @swagger
 * /api/admin/subscriptions/analytics/active-meal-status:
 *   get:
 *     summary: Detailed list of all ACTIVE subscriptions with meal counts (total, used, remaining)
 *     tags: [Admin - Subscription Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: entityType
 *         schema:
 *           type: string
 *           enum: [child, teacher, professional]
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50 }
 *     responses:
 *       200:
 *         description: Active subscriptions with meal counts
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 pagination:
 *                   type: object
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       subscription_id: { type: string, example: "CT-SUB-1" }
 *                       client_phone: { type: string, example: "+919876543210" }
 *                       entity_type: { type: string, example: "child" }
 *                       entity_name: { type: string, example: "Raju" }
 *                       institution_name: { type: string, example: "Delhi Public School" }
 *                       total_meals: { type: integer, example: 30 }
 *                       used_meals: { type: integer, example: 12 }
 *                       remaining_meals: { type: integer, example: 18 }
 *                       start_date: { type: string, format: date-time }
 *                       end_date: { type: string, format: date-time }
 *                       plan_name: { type: string, example: "Monthly Plan" }
 */
router.get('/analytics/active-meal-status', analytics.getActiveSubscriptionsWithMeals);

module.exports = router;

