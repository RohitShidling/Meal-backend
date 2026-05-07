const { pool } = require('../../common/database');
const AppError = require('../../common/utils/AppError');
const catchAsync = require('../../common/utils/catchAsync');
const mealEligibilityService = require('../../common/services/mealEligibilityService');

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const parseYmdStrict = (input) => {
  const raw = String(input || '').trim();
  if (!YMD.test(raw)) return null;
  const [y, m, d] = raw.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return raw;
};

const buildRenewalAlert = (sub, remainingMeals) => {
  const common = {
    entity_name: sub.entity_name,
    entity_type: sub.entity_type,
    entity_id: sub.entity_id,
    plan_name: sub.plan_name,
    end_date: sub.end_date,
    renew_options: {
      same_plan: {
        plan_id: sub.plan_id,
        include_saturday: sub.include_saturday,
        price: sub.include_saturday ? sub.price_with_saturday : sub.price_without_saturday,
      },
      different_plan_url: '/api/client/subscriptions',
    },
  };

  if (remainingMeals <= 0) {
    return {
      type: 'SUBSCRIPTION_EXPIRED',
      remaining_days: 0,
      message: `Subscription for ${sub.entity_name} (${sub.plan_name}) is exhausted. Please renew now to continue meals.`,
      ...common,
    };
  }

  if (remainingMeals <= 4) {
    return {
      type: 'EXPIRY_WARNING',
      remaining_days: remainingMeals,
      message: `Your subscription for ${sub.entity_name} (${sub.plan_name}) is expiring in ${remainingMeals} day(s).`,
      ...common,
    };
  }

  return null;
};

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
             TO_CHAR(cs.start_date, 'YYYY-MM-DD') AS start_date,
             TO_CHAR(cs.end_date, 'YYYY-MM-DD') AS end_date,
             cs.is_active as subscription_status, cs.include_saturday,
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
      ORDER BY (cs.total_meals - cs.used_meals) ASC, cs.end_date ASC, cs.created_at DESC;
    `;
    
    const result = await pool.query(query, [clientId]);

    const alerts = [];
    const subscriptions = result.rows.map(sub => {
      const remainingMeals = sub.total_meals - sub.used_meals;
      
      const renewalAlert = buildRenewalAlert(sub, remainingMeals);
      if (renewalAlert) alerts.push(renewalAlert);
      
      return {
        ...sub,
        remaining_meals: remainingMeals
      };
    });

    const today = mealEligibilityService.parseSessionToday();
    const hasActiveSubscription = subscriptions.some(
      (sub) =>
        sub.subscription_status === true &&
        sub.remaining_meals > 0 &&
        sub.start_date <= today &&
        sub.end_date >= today
    );

    const notificationRows = await pool.query(
      `SELECT id, subscription_id, entity_type, entity_id, alert_type, trigger_remaining_meals,
              title, message, is_read, is_sent, sent_channel, sent_at, created_at
       FROM subscription_alerts
       WHERE client_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [clientId]
    );

    res.status(200).json({
      success: true,
      has_active_subscription: hasActiveSubscription,
      alerts: alerts, // NEW ALERTS ARRAY
      notifications: notificationRows.rows,
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

  const newStartYmd = parseYmdStrict(startDate);
  if (!newStartYmd) {
    return next(new AppError('startDate must be valid YYYY-MM-DD', 400));
  }
  const todayYmd = mealEligibilityService.parseSessionToday();
  if (newStartYmd < todayYmd) {
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
  const oldStartYmd = String(subscription.start_date).slice(0, 10);
  const oldEndYmd = String(subscription.end_date).slice(0, 10);
  const toEpochNoon = (ymd) => {
    const [y, m, d] = ymd.split('-').map(Number);
    return Date.UTC(y, m - 1, d, 12, 0, 0);
  };
  const diffDays = Math.floor((toEpochNoon(newStartYmd) - toEpochNoon(oldStartYmd)) / 86400000);
  const endNoon = new Date(toEpochNoon(oldEndYmd));
  endNoon.setUTCDate(endNoon.getUTCDate() + diffDays);
  const newEndYmd = `${endNoon.getUTCFullYear()}-${String(endNoon.getUTCMonth() + 1).padStart(2, '0')}-${String(endNoon.getUTCDate()).padStart(2, '0')}`;

  // 5. Update the database
  const updateQuery = `
    UPDATE client_subscriptions 
    SET start_date = $1, end_date = $2, updated_at = NOW()
    WHERE id = $3
    RETURNING start_date, end_date
  `;
  const updateResult = await pool.query(updateQuery, [newStartYmd, newEndYmd, subscription.id]);

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
    WHERE cs.client_id = $1
  `;
  
  const result = await pool.query(query, [clientId]);

  const alerts = [];
  
  for (const sub of result.rows) {
    const remainingMeals = sub.total_meals - sub.used_meals;
    
    const renewalAlert = buildRenewalAlert(sub, remainingMeals);
    if (renewalAlert) {
      alerts.push({
        alert_type: renewalAlert.type,
        entity_name: renewalAlert.entity_name,
        entity_type: renewalAlert.entity_type,
        entity_id: renewalAlert.entity_id,
        plan_name: renewalAlert.plan_name,
        remaining_days: renewalAlert.remaining_days,
        end_date: renewalAlert.end_date,
        message: renewalAlert.message,
        renew_options: {
          same_plan_id: renewalAlert.renew_options.same_plan.plan_id,
          include_saturday: renewalAlert.renew_options.same_plan.include_saturday,
          price: renewalAlert.renew_options.same_plan.price,
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

/**
 * @desc    Get persistent subscription renewal notifications for the logged-in client
 * @route   GET /api/client/subscriptions/notifications
 * @access  Private (Client only)
 */
exports.getSubscriptionNotifications = catchAsync(async (req, res) => {
  const clientId = req.user.id;
  const result = await pool.query(
    `SELECT id, subscription_id, entity_type, entity_id, alert_type, trigger_remaining_meals,
            title, message, is_read, is_sent, sent_channel, sent_at, created_at
     FROM subscription_alerts
     WHERE client_id = $1
     ORDER BY created_at DESC`,
    [clientId]
  );
  res.status(200).json({
    success: true,
    count: result.rowCount,
    data: result.rows,
  });
});

/**
 * @desc    Mark subscription notification as read
 * @route   PATCH /api/client/subscriptions/notifications/:id/read
 * @access  Private (Client only)
 */
exports.markSubscriptionNotificationRead = catchAsync(async (req, res, next) => {
  const clientId = req.user.id;
  const notificationId = Number(req.params.id);
  if (!Number.isInteger(notificationId) || notificationId <= 0) {
    return next(new AppError('Invalid notification id', 400));
  }

  const updated = await pool.query(
    `UPDATE subscription_alerts
     SET is_read = true
     WHERE id = $1 AND client_id = $2
     RETURNING id, is_read`,
    [notificationId, clientId]
  );
  if (updated.rowCount === 0) {
    return next(new AppError('Notification not found', 404));
  }

  res.status(200).json({
    success: true,
    message: 'Notification marked as read',
    data: updated.rows[0],
  });
});
