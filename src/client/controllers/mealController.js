const db = require('../../common/database');
const catchAsync = require('../../common/utils/catchAsync');
const AppError = require('../../common/utils/AppError');

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Check if client has ANY active subscription (computed remaining)
// ─────────────────────────────────────────────────────────────────────────────
const getSubscriptionStatus = async (clientId) => {
  const result = await db.query(
    `SELECT cs.entity_type, cs.entity_id, cs.total_meals, cs.used_meals,
            (cs.total_meals - cs.used_meals) AS remaining_meals,
            cs.end_date, cs.is_active,
            CASE
              WHEN cs.entity_type='child' THEN ch.name
              WHEN cs.entity_type='teacher' THEN tp.name
              WHEN cs.entity_type='professional' THEN pp.name
            END AS entity_name
     FROM client_subscriptions cs
     LEFT JOIN children ch ON cs.entity_type='child' AND cs.entity_id=ch.id
     LEFT JOIN teacher_profiles tp ON cs.entity_type='teacher' AND cs.entity_id=tp.id
     LEFT JOIN professional_profiles pp ON cs.entity_type='professional' AND cs.entity_id=pp.id
     WHERE cs.client_id=$1 AND cs.is_active=true AND cs.end_date > NOW()
       AND (cs.total_meals - cs.used_meals) > 0`,
    [clientId]
  );
  return result.rows;
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. GET TODAY'S MENU (subscription-gated)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @desc  Get today's menu — only if the user has any active subscription
 * @route GET /api/client/meals/today
 */
exports.getTodayMenu = catchAsync(async (req, res, next) => {
  const clientId = req.user.id;

  // Check subscription status
  const subscriptions = await getSubscriptionStatus(clientId);

  if (subscriptions.length === 0) {
    // Not subscribed — return helpful info
    const plans = await db.query(
      'SELECT id, plan_name, price, billing_cycle FROM subscriptions WHERE is_active=true ORDER BY display_order'
    );
    return res.status(403).json({
      success: false,
      is_subscribed: false,
      message: 'You do not have an active subscription. Please subscribe to access the daily menu.',
      available_plans: plans.rows
    });
  }

  // Subscribed — fetch today's menu
  const today = new Date().toISOString().split('T')[0];
  const menu = await db.query(
    `SELECT id, image_url, items, menu_date, created_at
     FROM daily_menus WHERE menu_date=$1 AND is_active=true
     ORDER BY created_at DESC LIMIT 1`,
    [today]
  );

  if (menu.rows.length === 0) {
    return res.status(200).json({
      success: true,
      is_subscribed: true,
      message: 'No menu uploaded for today yet.',
      subscription_summary: subscriptions.map(s => ({
        entity_type: s.entity_type,
        entity_name: s.entity_name,
        total_meals: s.total_meals,
        used_meals: s.used_meals,
        remaining_meals: s.remaining_meals,
        end_date: s.end_date
      })),
      menu: null
    });
  }

  res.status(200).json({
    success: true,
    is_subscribed: true,
    subscription_summary: subscriptions.map(s => ({
      entity_type: s.entity_type,
      entity_name: s.entity_name,
      total_meals: s.total_meals,
      used_meals: s.used_meals,
      remaining_meals: s.remaining_meals,
      end_date: s.end_date
    })),
    menu: menu.rows[0]
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. GET WEEKLY MENU (subscription-gated)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @desc  Get this week's menu (next 7 days) — only if subscribed
 * @route GET /api/client/meals/weekly
 */
exports.getWeeklyMenu = catchAsync(async (req, res, next) => {
  const clientId = req.user.id;
  const subscriptions = await getSubscriptionStatus(clientId);

  if (subscriptions.length === 0) {
    const plans = await db.query(
      'SELECT id, plan_name, price, billing_cycle FROM subscriptions WHERE is_active=true ORDER BY display_order'
    );
    return res.status(403).json({
      success: false,
      is_subscribed: false,
      message: 'You do not have an active subscription. Please subscribe to access the weekly menu.',
      available_plans: plans.rows
    });
  }

  const menu = await db.query(
    `SELECT id, image_url, items, menu_date, created_at
     FROM daily_menus
     WHERE is_active=true AND menu_date >= CURRENT_DATE AND menu_date < CURRENT_DATE + INTERVAL '7 days'
     ORDER BY menu_date ASC`
  );

  res.status(200).json({
    success: true,
    is_subscribed: true,
    count: menu.rowCount,
    subscription_summary: subscriptions.map(s => ({
      entity_type: s.entity_type,
      entity_name: s.entity_name,
      total_meals: s.total_meals,
      used_meals: s.used_meals,
      remaining_meals: s.remaining_meals,
      end_date: s.end_date
    })),
    menu: menu.rows
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. GET MY MEAL STATUS (remaining meals per entity — computed)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @desc  Get detailed meal remaining status for all subscribed entities
 * @route GET /api/client/meals/status
 */
exports.getMealStatus = catchAsync(async (req, res) => {
  const clientId = req.user.id;

  const result = await db.query(
    `SELECT cs.entity_type, cs.entity_id, cs.total_meals, cs.used_meals,
            (cs.total_meals - cs.used_meals) AS remaining_meals,
            cs.start_date, cs.end_date, cs.is_active,
            sub.plan_name, sub.billing_cycle,
            CASE
              WHEN cs.entity_type='child' THEN ch.name
              WHEN cs.entity_type='teacher' THEN tp.name
              WHEN cs.entity_type='professional' THEN pp.name
            END AS entity_name
     FROM client_subscriptions cs
     LEFT JOIN subscriptions sub ON cs.subscription_id = sub.id
     LEFT JOIN children ch ON cs.entity_type='child' AND cs.entity_id=ch.id
     LEFT JOIN teacher_profiles tp ON cs.entity_type='teacher' AND cs.entity_id=tp.id
     LEFT JOIN professional_profiles pp ON cs.entity_type='professional' AND cs.entity_id=pp.id
     WHERE cs.client_id=$1 AND cs.is_active=true
     ORDER BY cs.entity_type`,
    [clientId]
  );

  res.status(200).json({
    success: true,
    count: result.rowCount,
    data: result.rows
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. REQUEST MEAL SKIP (minimum 3 consecutive days, 1 day advance)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @desc  Skip meals for a date range (minimum 3 days, requested 1 day before start)
 * @route POST /api/client/meals/skip
 */
exports.requestMealSkip = catchAsync(async (req, res, next) => {
  const clientId = req.user.id;
  const { entityType, entityId, startDate, endDate } = req.body;

  if (!entityType || !entityId || !startDate || !endDate) {
    return next(new AppError('entityType, entityId, startDate, and endDate are required.', 400));
  }

  // Validate dates
  const skipStart = new Date(startDate);
  const skipEnd = new Date(endDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (skipStart < tomorrow) {
    return next(new AppError('Skip start date must be at least tomorrow. You cannot skip meals for today or past dates.', 400));
  }

  if (skipEnd < skipStart) {
    return next(new AppError('End date must be after start date.', 400));
  }

  // Calculate consecutive days
  const diffTime = skipEnd.getTime() - skipStart.getTime();
  const totalDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // inclusive

  if (totalDays < 3) {
    return next(new AppError(`Minimum 3 consecutive days required for meal skip. You requested ${totalDays} day(s). 1 or 2 day skip is NOT allowed.`, 400));
  }

  // Verify entity belongs to this client
  let entityCheck;
  if (entityType === 'child') {
    entityCheck = await db.query('SELECT id FROM children WHERE id=$1 AND parent_id=$2', [entityId, clientId]);
  } else if (entityType === 'teacher') {
    entityCheck = await db.query('SELECT id FROM teacher_profiles WHERE id=$1 AND client_id=$2', [entityId, clientId]);
  } else if (entityType === 'professional') {
    entityCheck = await db.query('SELECT id FROM professional_profiles WHERE id=$1 AND client_id=$2', [entityId, clientId]);
  } else {
    return next(new AppError('Invalid entityType. Must be child, teacher, or professional.', 400));
  }
  if (entityCheck.rows.length === 0) return next(new AppError('Entity not found or does not belong to you.', 404));

  // Verify active subscription exists (remaining > 0 computed)
  const subCheck = await db.query(
    `SELECT id, end_date FROM client_subscriptions
     WHERE client_id=$1 AND entity_type=$2 AND entity_id=$3
       AND is_active=true AND end_date > NOW()
       AND (total_meals - used_meals) > 0`,
    [clientId, entityType, entityId]
  );
  if (subCheck.rows.length === 0) return next(new AppError('No active subscription found for this entity.', 400));

  const sub = subCheck.rows[0];
  const subEndDate = new Date(sub.end_date);
  if (skipEnd > subEndDate) {
    return next(new AppError(`Cannot schedule skip beyond your subscription expiry date (${subEndDate.toISOString().split('T')[0]}).`, 400));
  }

  // Check for overlapping skips
  const overlap = await db.query(
    `SELECT id FROM meal_skips
     WHERE client_id=$1 AND entity_type=$2 AND entity_id=$3 AND status='approved'
       AND skip_start_date <= $5 AND skip_end_date >= $4`,
    [clientId, entityType, entityId, startDate, endDate]
  );
  if (overlap.rows.length > 0) return next(new AppError('An overlapping meal skip already exists for this date range.', 409));

  // Create the skip
  const result = await db.query(
    `INSERT INTO meal_skips (client_id, entity_type, entity_id, skip_start_date, skip_end_date, total_skip_days)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [clientId, entityType, entityId, startDate, endDate, totalDays]
  );

  // Extend subscription end_date
  await db.query(
    `UPDATE client_subscriptions
     SET end_date = end_date + INTERVAL '${totalDays} days', updated_at=NOW()
     WHERE id=$1`,
    [sub.id]
  );

  res.status(201).json({
    success: true,
    message: `Meal skip approved for ${totalDays} days (${startDate} to ${endDate}). Your subscription end date has been extended by ${totalDays} days.`,
    data: result.rows[0]
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. GET MY MEAL SKIPS
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @desc  View all meal skips for the logged-in client
 * @route GET /api/client/meals/skips
 */
exports.getMyMealSkips = catchAsync(async (req, res) => {
  const clientId = req.user.id;

  const result = await db.query(
    `SELECT ms.*, 
            CASE
              WHEN ms.entity_type='child' THEN ch.name
              WHEN ms.entity_type='teacher' THEN tp.name
              WHEN ms.entity_type='professional' THEN pp.name
            END AS entity_name
     FROM meal_skips ms
     LEFT JOIN children ch ON ms.entity_type='child' AND ms.entity_id=ch.id
     LEFT JOIN teacher_profiles tp ON ms.entity_type='teacher' AND ms.entity_id=tp.id
     LEFT JOIN professional_profiles pp ON ms.entity_type='professional' AND ms.entity_id=pp.id
     WHERE ms.client_id=$1
     ORDER BY ms.skip_start_date DESC`,
    [clientId]
  );

  res.status(200).json({
    success: true,
    count: result.rowCount,
    data: result.rows
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. CANCEL A MEAL SKIP
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @desc  Cancel a future meal skip (only if skip hasn't started yet)
 * @route DELETE /api/client/meals/skip/:skipId
 */
exports.cancelMealSkip = catchAsync(async (req, res, next) => {
  const clientId = req.user.id;
  const { skipId } = req.params;

  const skip = await db.query(
    'SELECT * FROM meal_skips WHERE id=$1 AND client_id=$2',
    [skipId, clientId]
  );
  if (skip.rows.length === 0) return next(new AppError('Meal skip not found.', 404));

  const skipData = skip.rows[0];
  const today = new Date().toISOString().split('T')[0];

  if (new Date(skipData.skip_start_date) <= new Date(today)) {
    return next(new AppError('Cannot cancel a skip that has already started or is in the past.', 400));
  }

  // Revert subscription end_date extension
  await db.query(
    `UPDATE client_subscriptions 
     SET end_date = end_date - INTERVAL '${skipData.total_skip_days} days', updated_at=NOW()
     WHERE client_id=$1 AND entity_type=$2 AND entity_id=$3 AND is_active=true`,
    [clientId, skipData.entity_type, skipData.entity_id]
  );

  await db.query("UPDATE meal_skips SET status='cancelled', updated_at=NOW() WHERE id=$1", [skipId]);

  res.status(200).json({
    success: true,
    message: 'Meal skip cancelled successfully and subscription expiry reverted.'
  });
});
