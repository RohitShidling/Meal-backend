const db = require('../../common/database');
const catchAsync = require('../../common/utils/catchAsync');
const AppError = require('../../common/utils/AppError');
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

const daysBetweenInclusive = (startYmd, endYmd) => {
  const [sy, sm, sd] = startYmd.split('-').map(Number);
  const [ey, em, ed] = endYmd.split('-').map(Number);
  const s = Date.UTC(sy, sm - 1, sd, 12, 0, 0);
  const e = Date.UTC(ey, em - 1, ed, 12, 0, 0);
  return Math.floor((e - s) / 86400000) + 1;
};

const addDaysYmd = (ymd, days) => {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  dt.setUTCDate(dt.getUTCDate() + Number(days));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
};

const isSkippableMealDayYmd = (ymd, includeSaturday) => {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const dow = dt.getUTCDay(); // 0=Sun ... 6=Sat
  if (dow === 0) return false;
  if (!includeSaturday && dow === 6) return false;
  return true;
};

const countSkippableMealDays = (startYmd, endYmd, includeSaturday) => {
  const total = daysBetweenInclusive(startYmd, endYmd);
  let count = 0;
  for (let i = 0; i < total; i += 1) {
    if (isSkippableMealDayYmd(addDaysYmd(startYmd, i), includeSaturday)) {
      count += 1;
    }
  }
  return count;
};

const getMealSkipPolicy = async () => {
  const result = await db.query(
    `SELECT setting_key, setting_value
     FROM app_settings
     WHERE setting_key IN ('meal_skip_min_days', 'meal_skip_min_notice_days')`
  );
  const settings = Object.fromEntries(result.rows.map((row) => [row.setting_key, Number(row.setting_value)]));
  return {
    minSkipDays: Number.isFinite(settings.meal_skip_min_days) ? settings.meal_skip_min_days : 3,
    minNoticeDays: Number.isFinite(settings.meal_skip_min_notice_days) ? settings.meal_skip_min_notice_days : 1,
  };
};

exports.getMealSkipPolicy = catchAsync(async (_req, res) => {
  const policy = await getMealSkipPolicy();
  res.status(200).json({
    success: true,
    data: {
      min_skip_days: policy.minSkipDays,
      min_notice_days: policy.minNoticeDays,
    },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Check if client has ANY active subscription (computed remaining)
// ─────────────────────────────────────────────────────────────────────────────
const getSubscriptionStatus = async (clientId) => {
  const today = mealEligibilityService.parseSessionToday();
  const activePred = mealEligibilityService.subscriptionActiveOnDatePredicateSql('cs', '$2');
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
     WHERE cs.client_id=$1
       AND ${activePred}`,
    [clientId, today]
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
  const today = mealEligibilityService.parseSessionToday();
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
  const policy = await getMealSkipPolicy();

  if (!entityType || !entityId || !startDate || !endDate) {
    return next(new AppError('entityType, entityId, startDate, and endDate are required.', 400));
  }

  // Validate date-only input in IST-safe form
  const startYmd = parseYmdStrict(startDate);
  const endYmd = parseYmdStrict(endDate);
  if (!startYmd || !endYmd) {
    return next(new AppError('startDate and endDate must be valid YYYY-MM-DD values.', 400));
  }
  const todayYmd = mealEligibilityService.parseSessionToday();
  const requiredStartYmd = (() => {
    const [y, m, d] = todayYmd.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    dt.setUTCDate(dt.getUTCDate() + policy.minNoticeDays);
    const yy = dt.getUTCFullYear();
    const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(dt.getUTCDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
  })();

  if (startYmd < requiredStartYmd) {
    return next(
      new AppError(
        `Skip start date must be at least ${policy.minNoticeDays} day(s) in advance. You cannot skip meals for today/past dates or without required notice.`,
        400
      )
    );
  }

  if (endYmd < startYmd) {
    return next(new AppError('End date must be after start date.', 400));
  }

  // Calculate consecutive days (inclusive)
  const totalDays = daysBetweenInclusive(startYmd, endYmd);

  if (totalDays < policy.minSkipDays) {
    return next(
      new AppError(
        `Minimum ${policy.minSkipDays} consecutive day(s) required for meal skip. You requested ${totalDays} day(s).`,
        400
      )
    );
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
    `SELECT
        id,
        include_saturday,
        TO_CHAR(start_date, 'YYYY-MM-DD') AS start_date,
        TO_CHAR(end_date, 'YYYY-MM-DD') AS end_date
     FROM client_subscriptions
     WHERE client_id=$1 AND entity_type=$2 AND entity_id=$3
       AND is_active=true
       AND (total_meals - used_meals) > 0`,
    [clientId, entityType, entityId]
  );
  if (subCheck.rows.length === 0) return next(new AppError('No active subscription found for this entity.', 400));

  const sub = subCheck.rows[0];
  const includeSaturday = sub.include_saturday !== false;
  const subStartYmd = sub.start_date;
  const subEndYmd = sub.end_date;
  if (startYmd < subStartYmd) {
    return next(new AppError(`Cannot schedule skip before subscription start date (${subStartYmd}).`, 400));
  }
  if (endYmd > subEndYmd) {
    return next(new AppError(`Cannot schedule skip beyond your subscription expiry date (${subEndYmd}).`, 400));
  }

  // Check for overlapping skips
  const overlap = await db.query(
    `SELECT id FROM meal_skips
     WHERE client_id=$1 AND entity_type=$2 AND entity_id=$3 AND status='approved'
       AND skip_start_date <= $5 AND skip_end_date >= $4`,
    [clientId, entityType, entityId, startYmd, endYmd]
  );
  if (overlap.rows.length > 0) return next(new AppError('An overlapping meal skip already exists for this date range.', 409));

  const effectiveSkipDays = countSkippableMealDays(startYmd, endYmd, includeSaturday);
  if (effectiveSkipDays <= 0) {
    return next(new AppError('Selected range has no skippable meal days. Sundays are non-service days.', 400));
  }

  // Create the skip
  const result = await db.query(
    `INSERT INTO meal_skips (client_id, entity_type, entity_id, skip_start_date, skip_end_date, total_skip_days, extension_days, subscription_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [clientId, entityType, entityId, startYmd, endYmd, effectiveSkipDays, effectiveSkipDays, sub.id]
  );

  // Extend subscription end_date
  await db.query(
    `UPDATE client_subscriptions
     SET end_date = end_date + ($2::int * INTERVAL '1 day'), updated_at=NOW()
     WHERE id=$1`,
    [sub.id, effectiveSkipDays]
  );

  const created = result.rows[0];
  res.status(201).json({
    success: true,
    message: `Meal skip approved for ${effectiveSkipDays} meal day(s) (${startYmd} to ${endYmd}). Sundays are excluded${includeSaturday ? '' : ' and Saturdays are excluded for this plan'}.`,
    data: {
      ...created,
      skip_start_date: startYmd,
      skip_end_date: endYmd,
    }
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
    `SELECT ms.id, ms.client_id, ms.entity_type, ms.entity_id,
            TO_CHAR(ms.skip_start_date, 'YYYY-MM-DD') AS skip_start_date,
            TO_CHAR(ms.skip_end_date, 'YYYY-MM-DD') AS skip_end_date,
            ms.total_skip_days, ms.status, ms.created_at, ms.updated_at,
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
     ORDER BY
       CASE ms.status
         WHEN 'approved' THEN 0
         WHEN 'requested' THEN 1
         WHEN 'cancelled' THEN 2
         ELSE 3
       END,
       ms.skip_start_date DESC`,
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

  const tx = await db.pool.connect();
  try {
    await tx.query('BEGIN');
    const skip = await tx.query(
      `SELECT * FROM meal_skips WHERE id=$1 AND client_id=$2 FOR UPDATE`,
      [skipId, clientId]
    );
    if (skip.rows.length === 0) {
      await tx.query('ROLLBACK');
      return next(new AppError('Meal skip not found.', 404));
    }

    const skipData = skip.rows[0];
    if (skipData.status !== 'approved') {
      await tx.query('ROLLBACK');
      return next(new AppError('Only approved skips can be cancelled.', 409));
    }
    const today = mealEligibilityService.parseSessionToday();
    const skipStartYmd = String(skipData.skip_start_date).slice(0, 10);
    if (skipStartYmd <= today) {
      await tx.query('ROLLBACK');
      return next(new AppError('Cannot cancel a skip that has already started or is in the past.', 400));
    }

    const extensionDays = Number(skipData.extension_days || skipData.total_skip_days || 0);
    const targetSubscriptionId = skipData.subscription_id;
    if (targetSubscriptionId && extensionDays > 0) {
      await tx.query(
        `UPDATE client_subscriptions 
         SET end_date = end_date - ($2::int * INTERVAL '1 day'), updated_at=NOW()
         WHERE id=$1 AND is_active=true`,
        [targetSubscriptionId, extensionDays]
      );
    }
    await tx.query("UPDATE meal_skips SET status='cancelled', updated_at=NOW() WHERE id=$1", [skipId]);
    await tx.query('COMMIT');
  } catch (error) {
    await tx.query('ROLLBACK');
    throw error;
  } finally {
    tx.release();
  }

  res.status(200).json({
    success: true,
    message: 'Meal skip cancelled successfully and subscription expiry reverted.'
  });
});

exports.deleteMealSkip = catchAsync(async (req, res, next) => {
  const clientId = req.user.id;
  const { skipId } = req.params;
  const tx = await db.pool.connect();

  try {
    await tx.query('BEGIN');
    const skipRes = await tx.query(
      `SELECT * FROM meal_skips WHERE id=$1 AND client_id=$2 FOR UPDATE`,
      [skipId, clientId]
    );
    if (skipRes.rowCount === 0) {
      await tx.query('ROLLBACK');
      return next(new AppError('Meal skip not found.', 404));
    }

    const skip = skipRes.rows[0];
    const today = mealEligibilityService.parseSessionToday();
    const skipStartYmd = String(skip.skip_start_date).slice(0, 10);
    const extensionDays = Number(skip.extension_days || skip.total_skip_days || 0);

    // If approved future skip is directly deleted, first revert the extension.
    if (skip.status === 'approved') {
      if (skipStartYmd <= today) {
        await tx.query('ROLLBACK');
        return next(new AppError('Cannot delete a skip that has already started or is in the past.', 400));
      }
      if (skip.subscription_id && extensionDays > 0) {
        await tx.query(
          `UPDATE client_subscriptions
           SET end_date = end_date - ($2::int * INTERVAL '1 day'), updated_at=NOW()
           WHERE id=$1 AND is_active=true`,
          [skip.subscription_id, extensionDays]
        );
      }
    }

    await tx.query('DELETE FROM meal_skips WHERE id=$1', [skipId]);
    await tx.query('COMMIT');

    return res.status(200).json({
      success: true,
      message: 'Meal skip deleted successfully.',
    });
  } catch (error) {
    await tx.query('ROLLBACK');
    throw error;
  } finally {
    tx.release();
  }
});