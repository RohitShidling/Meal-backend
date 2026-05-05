const { pool } = require('../../common/database');
const AppError = require('../../common/utils/AppError');
const catchAsync = require('../../common/utils/catchAsync');

/**
 * @desc    Get subscription status for the logged-in client (all entities)
 * @route   GET /api/client/subscriptions/status
 * @access  Private (Client only)
 */
exports.getMySubscriptionStatus = async (req, res, next) => {
  try {
    const clientId = req.user.id;

    const query = `
      SELECT cs.id as client_subscription_id, cs.entity_type, cs.entity_id, 
             cs.start_date, cs.end_date, cs.is_active as subscription_status, cs.include_saturday,
             cs.total_meals, cs.used_meals,
             s.id as plan_id, s.plan_name, s.price, s.price_with_saturday, s.price_without_saturday, s.billing_cycle,
             CASE
               WHEN cs.entity_type='child' THEN ch.name
               WHEN cs.entity_type='teacher' THEN tp.name
               WHEN cs.entity_type='professional' THEN pp.name
             END AS entity_name
      FROM client_subscriptions cs
      JOIN subscriptions s ON cs.subscription_id = s.id
      LEFT JOIN children ch ON cs.entity_type='child' AND cs.entity_id=ch.id
      LEFT JOIN teacher_profiles tp ON cs.entity_type='teacher' AND cs.entity_id=tp.id
      LEFT JOIN professional_profiles pp ON cs.entity_type='professional' AND cs.entity_id=pp.id
      WHERE cs.client_id = $1
      ORDER BY cs.created_at DESC;
    `;
    
    const result = await pool.query(query, [clientId]);

    const alerts = [];
    const subscriptions = result.rows.map(sub => {
      const remainingMeals = sub.total_meals - sub.used_meals;
      
      // If 4 or fewer days/meals left and it is currently active
      if (sub.subscription_status === true && remainingMeals > 0 && remainingMeals <= 4) {
        alerts.push({
          type: 'EXPIRY_WARNING',
          entity_name: sub.entity_name,
          entity_type: sub.entity_type,
          entity_id: sub.entity_id,
          plan_name: sub.plan_name,
          remaining_days: remainingMeals,
          end_date: sub.end_date,
          message: `Your subscription for ${sub.entity_name} (${sub.plan_name}) is expiring in ${remainingMeals} day(s).`,
          renew_options: {
            same_plan: {
              plan_id: sub.plan_id,
              include_saturday: sub.include_saturday,
              price: sub.include_saturday ? sub.price_with_saturday : sub.price_without_saturday,
            },
            different_plan_url: '/api/client/subscriptions'
          }
        });
      }
      
      return {
        ...sub,
        remaining_meals: remainingMeals
      };
    });

    const hasActiveSubscription = subscriptions.some(sub => sub.subscription_status === true && new Date(sub.end_date) > new Date() && sub.remaining_meals > 0);

    res.status(200).json({
      success: true,
      has_active_subscription: hasActiveSubscription,
      alerts: alerts, // NEW ALERTS ARRAY
      count: subscriptions.length,
      data: subscriptions,
    });
  } catch (error) {
    next(new AppError(error.message || 'Error fetching subscription status', 500));
  }
};

/**
 * @desc    Change the start date of an already paid/active subscription
 * @route   PUT /api/client/subscriptions/update-start-date
 * @access  Private (Client only)
 */
exports.updateStartDate = catchAsync(async (req, res, next) => {
  const { entityType, entityId, startDate } = req.body;
  const clientId = req.user.id;

  if (!entityType || !entityId || !startDate) {
    return next(new AppError('entityType, entityId, and startDate are required', 400));
  }

  const newStartDate = new Date(startDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (newStartDate < today) {
    return next(new AppError('New start date cannot be in the past.', 400));
  }

  // 1. Check if they have an active subscription for this entity
  const subQuery = `
    SELECT * FROM client_subscriptions 
    WHERE client_id = $1 AND entity_type = $2 AND entity_id = $3 AND is_active = true
  `;
  const subResult = await pool.query(subQuery, [clientId, entityType, entityId]);

  if (subResult.rows.length === 0) {
    return next(new AppError('No active subscription found for this entity. You must be subscribed and paid first.', 403));
  }

  const subscription = subResult.rows[0];

  // 2. Prevent changing if they have already consumed meals from this subscription!
  if (subscription.used_meals > 0) {
    return next(new AppError('You cannot change the start date because you have already started consuming meals. Use the Meal Skip API instead to take a leave.', 400));
  }

  // 3. Prevent changing if the original start date has ALREADY passed (even if they didn't consume meals)
  // Or maybe allow it if used_meals is 0? The fairest logic is to allow shifting if used_meals == 0.
  
  // Calculate the difference in days between the old start date and the new start date
  const oldStartDate = new Date(subscription.start_date);
  oldStartDate.setHours(0,0,0,0);
  
  const diffTime = newStartDate.getTime() - oldStartDate.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  // 4. Shift the end_date by the exact same number of days
  const oldEndDate = new Date(subscription.end_date);
  const newEndDate = new Date(oldEndDate.getTime() + (diffDays * 24 * 60 * 60 * 1000));

  // 5. Update the database
  const updateQuery = `
    UPDATE client_subscriptions 
    SET start_date = $1, end_date = $2, updated_at = NOW()
    WHERE id = $3
    RETURNING start_date, end_date
  `;
  const updateResult = await pool.query(updateQuery, [newStartDate, newEndDate, subscription.id]);

  res.status(200).json({
    success: true,
    message: 'Subscription start date updated successfully. The end date has been shifted automatically.',
    data: updateResult.rows[0]
  });
});

/**
 * @desc    Get subscription alerts (expiring within 4 days) for the logged-in client
 * @route   GET /api/client/subscriptions/alerts
 * @access  Private (Client only)
 */
exports.getSubscriptionAlerts = catchAsync(async (req, res, next) => {
  const clientId = req.user.id;

  const query = `
    SELECT cs.id as client_subscription_id, cs.entity_type, cs.entity_id, 
           cs.start_date, cs.end_date, cs.total_meals, cs.used_meals,
           cs.include_saturday, s.id as plan_id, s.plan_name, s.price, s.price_with_saturday, s.price_without_saturday,
           CASE
             WHEN cs.entity_type='child' THEN ch.name
             WHEN cs.entity_type='teacher' THEN tp.name
             WHEN cs.entity_type='professional' THEN pp.name
           END AS entity_name
    FROM client_subscriptions cs
    JOIN subscriptions s ON cs.subscription_id = s.id
    LEFT JOIN children ch ON cs.entity_type='child' AND cs.entity_id=ch.id
    LEFT JOIN teacher_profiles tp ON cs.entity_type='teacher' AND cs.entity_id=tp.id
    LEFT JOIN professional_profiles pp ON cs.entity_type='professional' AND cs.entity_id=pp.id
    WHERE cs.client_id = $1 AND cs.is_active = true
  `;
  
  const result = await pool.query(query, [clientId]);

  const alerts = [];
  
  for (const sub of result.rows) {
    const remainingMeals = sub.total_meals - sub.used_meals;
    
    // Only return alerts for those expiring within 4 days (but still active)
    if (remainingMeals > 0 && remainingMeals <= 4) {
      alerts.push({
        alert_type: 'EXPIRY_WARNING',
        entity_name: sub.entity_name,
        entity_type: sub.entity_type,
        entity_id: sub.entity_id,
        plan_name: sub.plan_name,
        remaining_days: remainingMeals,
        end_date: sub.end_date,
        message: `Your subscription for ${sub.entity_name} (${sub.plan_name}) is expiring in ${remainingMeals} day(s).`,
        renew_options: {
          same_plan_id: sub.plan_id,
          include_saturday: sub.include_saturday,
          price: sub.include_saturday ? sub.price_with_saturday : sub.price_without_saturday
        }
      });
    }
  }

  res.status(200).json({
    success: true,
    count: alerts.length,
    alerts: alerts
  });
});
