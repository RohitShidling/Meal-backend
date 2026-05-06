const db = require('../../common/database');
const AppError = require('../../common/utils/AppError');

const normalizeFeatures = (features) => {
  if (!Array.isArray(features)) return [];
  return features.map((x) => String(x || '').trim()).filter(Boolean);
};

const writeFeatures = async (subscriptionId, features) => {
  await db.query('DELETE FROM subscription_features WHERE subscription_id = $1', [subscriptionId]);
  if (!features.length) return;

  const placeholders = [];
  const values = [];
  features.forEach((feature, idx) => {
    const base = idx * 3;
    placeholders.push(`($${base + 1}, $${base + 2}, $${base + 3})`);
    values.push(subscriptionId, feature, idx + 1);
  });

  await db.query(
    `
    INSERT INTO subscription_features (subscription_id, feature_text, sort_order)
    VALUES ${placeholders.join(', ')};
    `,
    values
  );
};

const attachFeatures = async (plans) => {
  if (!plans.length) return plans;
  const ids = plans.map((p) => p.id);
  const rows = await db.query(
    `
    SELECT subscription_id, feature_text
    FROM subscription_features
    WHERE subscription_id = ANY($1)
    ORDER BY subscription_id, sort_order ASC, id ASC;
    `,
    [ids]
  );

  const map = {};
  rows.rows.forEach((row) => {
    if (!map[row.subscription_id]) map[row.subscription_id] = [];
    map[row.subscription_id].push(row.feature_text);
  });

  return plans.map((p) => ({ ...p, features: map[p.id] || [] }));
};

exports.createTrialPlan = async (req, res, next) => {
  try {
    const {
      plan_name,
      price,
      price_with_saturday,
      price_without_saturday,
      saturday_option_enabled,
      meal_size_id,
      billing_cycle,
      trial_days,
      duration_days_with_saturday,
      duration_days_without_saturday,
      display_order,
      is_active,
      features,
    } = req.body;
    const adminId = req.user.id;

    if (!plan_name || !billing_cycle || trial_days === undefined) {
      return next(new AppError('plan_name, billing_cycle and trial_days are required', 400));
    }
    if (duration_days_with_saturday === undefined || duration_days_with_saturday === null || duration_days_with_saturday === '') {
      return next(new AppError('duration_days_with_saturday is required', 400));
    }
    if (duration_days_without_saturday === undefined || duration_days_without_saturday === null || duration_days_without_saturday === '') {
      return next(new AppError('duration_days_without_saturday is required', 400));
    }
    if (meal_size_id === undefined || meal_size_id === null || meal_size_id === '') {
      return next(new AppError('meal_size_id is required', 400));
    }
    const mealSizeCheck = await db.query(
      'SELECT id FROM meal_sizes WHERE id = $1 AND is_active = true',
      [Number(meal_size_id)]
    );
    if (mealSizeCheck.rows.length === 0) {
      return next(new AppError('Selected meal size is invalid or inactive', 400));
    }
    const resolvedPriceWithSaturday = Number(
      price_with_saturday !== undefined ? price_with_saturday : price
    );
    const resolvedPriceWithoutSaturday = Number(
      price_without_saturday !== undefined ? price_without_saturday : price
    );
    if (!Number.isFinite(resolvedPriceWithSaturday) || resolvedPriceWithSaturday < 0) {
      return next(new AppError('price_with_saturday (or price) must be a valid non-negative number', 400));
    }
    if (!Number.isFinite(resolvedPriceWithoutSaturday) || resolvedPriceWithoutSaturday < 0) {
      return next(new AppError('price_without_saturday (or price) must be a valid non-negative number', 400));
    }

    const duplicate = await db.query(
      'SELECT id FROM subscriptions WHERE LOWER(plan_name) = LOWER($1) AND trial_days > 0',
      [plan_name.trim()]
    );
    if (duplicate.rows.length > 0) {
      return next(new AppError('Trial plan with this name already exists.', 409));
    }

    const result = await db.query(
      `
      INSERT INTO subscriptions (
        plan_name, price, billing_cycle, duration_days, trial_days, display_order, is_active, created_by, updated_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *;
      `,
      [
        plan_name.trim(),
        resolvedPriceWithSaturday,
        String(billing_cycle).trim(),
        Number(trial_days),
        Number(trial_days),
        display_order !== undefined ? Number(display_order) : 1,
        is_active !== undefined ? is_active : true,
        adminId,
        adminId,
      ]
    );
    await db.query(
      `
      UPDATE subscriptions
      SET
        price_with_saturday = $1,
        price_without_saturday = $2,
        saturday_option_enabled = COALESCE($3, saturday_option_enabled),
        duration_days_with_saturday = $4,
        duration_days_without_saturday = $5,
        meal_size_id = $6
      WHERE id = $7
      `,
      [
        resolvedPriceWithSaturday,
        resolvedPriceWithoutSaturday,
        saturday_option_enabled,
        Number(duration_days_with_saturday),
        Number(duration_days_without_saturday),
        Number(meal_size_id),
        result.rows[0].id,
      ]
    );
    await db.query(
      'UPDATE subscriptions SET meal_size_id = $1 WHERE id = $2',
      [Number(meal_size_id), result.rows[0].id]
    );
    result.rows[0].price = resolvedPriceWithSaturday;
    result.rows[0].price_with_saturday = resolvedPriceWithSaturday;
    result.rows[0].price_without_saturday = resolvedPriceWithoutSaturday;
    result.rows[0].meal_size_id = Number(meal_size_id);
    result.rows[0].duration_days_with_saturday =
      Number(duration_days_with_saturday);
    result.rows[0].duration_days_without_saturday =
      Number(duration_days_without_saturday);
    if (saturday_option_enabled !== undefined) {
      result.rows[0].saturday_option_enabled = saturday_option_enabled;
    }

    await writeFeatures(result.rows[0].id, normalizeFeatures(features));
    const hydrated = await attachFeatures([result.rows[0]]);

    res.status(201).json({
      success: true,
      message: 'Trial plan created successfully.',
      data: hydrated[0],
    });
  } catch (error) {
    next(new AppError(error.message || 'Error creating trial plan', 500));
  }
};

exports.getTrialPlans = async (req, res, next) => {
  try {
    const result = await db.query(
      `
      SELECT *
      FROM subscriptions
      WHERE trial_days > 0
      ORDER BY display_order ASC, created_at DESC;
      `
    );
    const hydrated = await attachFeatures(result.rows);
    res.status(200).json({ success: true, count: hydrated.length, data: hydrated });
  } catch (error) {
    next(new AppError(error.message || 'Error fetching trial plans', 500));
  }
};

exports.getTrialPlanById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await db.query('SELECT * FROM subscriptions WHERE id = $1 AND trial_days > 0', [id]);
    if (result.rows.length === 0) return next(new AppError('Trial plan not found.', 404));
    const hydrated = await attachFeatures(result.rows);
    res.status(200).json({ success: true, data: hydrated[0] });
  } catch (error) {
    next(new AppError(error.message || 'Error fetching trial plan', 500));
  }
};

exports.updateTrialPlan = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      plan_name,
      price,
      price_with_saturday,
      price_without_saturday,
      saturday_option_enabled,
      meal_size_id,
      billing_cycle,
      trial_days,
      duration_days_with_saturday,
      duration_days_without_saturday,
      display_order,
      is_active,
      features,
    } = req.body;
    const adminId = req.user.id;

    const existing = await db.query('SELECT * FROM subscriptions WHERE id = $1 AND trial_days > 0', [id]);
    if (existing.rows.length === 0) return next(new AppError('Trial plan not found.', 404));

    if (plan_name !== undefined) {
      const duplicate = await db.query(
        'SELECT id FROM subscriptions WHERE LOWER(plan_name)=LOWER($1) AND trial_days > 0 AND id <> $2',
        [plan_name.trim(), id]
      );
      if (duplicate.rows.length > 0) return next(new AppError('Trial plan with this name already exists.', 409));
    }

    const effectiveTrialDays = trial_days !== undefined ? Number(trial_days) : Number(existing.rows[0].trial_days);
    const current = existing.rows[0];
    if (meal_size_id !== undefined && meal_size_id !== null && meal_size_id !== '') {
      const mealSizeCheck = await db.query(
        'SELECT id FROM meal_sizes WHERE id = $1 AND is_active = true',
        [Number(meal_size_id)]
      );
      if (mealSizeCheck.rows.length === 0) {
        return next(new AppError('Selected meal size is invalid or inactive', 400));
      }
    }
    const nextPriceWithSaturday = price_with_saturday !== undefined
      ? Number(price_with_saturday)
      : (price !== undefined ? Number(price) : Number(current.price_with_saturday ?? current.price));
    const nextPriceWithoutSaturday = price_without_saturday !== undefined
      ? Number(price_without_saturday)
      : (price !== undefined ? Number(price) : Number(current.price_without_saturday ?? current.price));
    if (!Number.isFinite(nextPriceWithSaturday) || nextPriceWithSaturday < 0) {
      return next(new AppError('price_with_saturday (or price) must be a valid non-negative number', 400));
    }
    if (!Number.isFinite(nextPriceWithoutSaturday) || nextPriceWithoutSaturday < 0) {
      return next(new AppError('price_without_saturday (or price) must be a valid non-negative number', 400));
    }

    const result = await db.query(
      `
      UPDATE subscriptions
      SET
        plan_name = COALESCE($1, plan_name),
        price = $2,
        billing_cycle = COALESCE($3, billing_cycle),
        trial_days = $4,
        duration_days = $4,
        display_order = COALESCE($5, display_order),
        is_active = COALESCE($6, is_active),
        updated_by = $7,
        updated_at = NOW()
      WHERE id = $8 AND trial_days > 0
      RETURNING *;
      `,
      [
        plan_name !== undefined ? plan_name.trim() : null,
        nextPriceWithSaturday,
        billing_cycle !== undefined ? String(billing_cycle).trim() : null,
        effectiveTrialDays,
        display_order !== undefined ? Number(display_order) : null,
        is_active !== undefined ? is_active : null,
        adminId,
        id,
      ]
    );
    await db.query(
      `
      UPDATE subscriptions
      SET
        price_with_saturday = $1,
        price_without_saturday = $2,
        saturday_option_enabled = COALESCE($3, saturday_option_enabled),
        meal_size_id = COALESCE($4, meal_size_id),
        duration_days_with_saturday = $5,
        duration_days_without_saturday = $6
      WHERE id = $7
      `,
      [
        nextPriceWithSaturday,
        nextPriceWithoutSaturday,
        saturday_option_enabled,
        meal_size_id !== undefined ? Number(meal_size_id) : null,
        duration_days_with_saturday !== undefined && duration_days_with_saturday !== null && duration_days_with_saturday !== '' ? Number(duration_days_with_saturday) : (current.duration_days_with_saturday ?? null),
        duration_days_without_saturday !== undefined && duration_days_without_saturday !== null && duration_days_without_saturday !== '' ? Number(duration_days_without_saturday) : (current.duration_days_without_saturday ?? null),
        id
      ]
    );
    result.rows[0].price = nextPriceWithSaturday;
    result.rows[0].price_with_saturday = nextPriceWithSaturday;
    result.rows[0].price_without_saturday = nextPriceWithoutSaturday;
    result.rows[0].duration_days_with_saturday =
      duration_days_with_saturday !== undefined
        ? (duration_days_with_saturday === null || duration_days_with_saturday === '' ? null : Number(duration_days_with_saturday))
        : (current.duration_days_with_saturday ?? null);
    result.rows[0].duration_days_without_saturday =
      duration_days_without_saturday !== undefined
        ? (duration_days_without_saturday === null || duration_days_without_saturday === '' ? null : Number(duration_days_without_saturday))
        : (current.duration_days_without_saturday ?? null);
    if (result.rows[0].duration_days_with_saturday === null || result.rows[0].duration_days_without_saturday === null) {
      return next(new AppError('duration_days_with_saturday and duration_days_without_saturday are required', 400));
    }
    if (meal_size_id !== undefined) {
      result.rows[0].meal_size_id = Number(meal_size_id);
    }
    if (saturday_option_enabled !== undefined) {
      result.rows[0].saturday_option_enabled = saturday_option_enabled;
    }

    if (features !== undefined) {
      await writeFeatures(id, normalizeFeatures(features));
    }

    const hydrated = await attachFeatures(result.rows);
    res.status(200).json({
      success: true,
      message: 'Trial plan updated successfully.',
      data: hydrated[0],
    });
  } catch (error) {
    next(new AppError(error.message || 'Error updating trial plan', 500));
  }
};

exports.setTrialPlanActive = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { is_active } = req.body;
    const adminId = req.user.id;
    const result = await db.query(
      `
      UPDATE subscriptions
      SET is_active = $1, updated_by = $2, updated_at = NOW()
      WHERE id = $3 AND trial_days > 0
      RETURNING *;
      `,
      [is_active, adminId, id]
    );
    if (result.rows.length === 0) return next(new AppError('Trial plan not found.', 404));
    const hydrated = await attachFeatures(result.rows);
    res.status(200).json({ success: true, message: 'Trial plan status updated successfully.', data: hydrated[0] });
  } catch (error) {
    next(new AppError(error.message || 'Error updating trial plan status', 500));
  }
};

exports.deleteTrialPlan = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await db.query('DELETE FROM subscriptions WHERE id = $1 AND trial_days > 0 RETURNING id, plan_name', [id]);
    if (result.rows.length === 0) return next(new AppError('Trial plan not found.', 404));
    res.status(200).json({ success: true, message: 'Trial plan deleted successfully.', data: result.rows[0] });
  } catch (error) {
    next(new AppError(error.message || 'Error deleting trial plan', 500));
  }
};
