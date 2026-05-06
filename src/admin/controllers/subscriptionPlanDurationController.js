const { query } = require('../../common/database');
const AppError = require('../../common/utils/AppError');

const billingCycleToDays = {
  daily: 1,
  weekly: 7,
  monthly: 30,
  yearly: 365,
  annual: 365,
};

const normalizeBillingCycle = (billingCycle = '') => String(billingCycle).trim().toLowerCase();

const resolveDurationDays = (durationDays, billingCycle) => {
  if (durationDays !== undefined && durationDays !== null && durationDays !== '') {
    const parsed = Number(durationDays);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new AppError('duration_days must be a positive integer', 400);
    }
    return parsed;
  }

  const mapped = billingCycleToDays[normalizeBillingCycle(billingCycle)];
  return mapped || 30;
};

const normalizeFeatures = (features) => {
  if (!Array.isArray(features)) return [];
  return features
    .map((item) => {
      if (typeof item === 'string') return item.trim();
      if (item && typeof item === 'object') return String(item.feature_text || item.feature || '').trim();
      return '';
    })
    .filter(Boolean);
};

const writeFeatures = async (subscriptionId, features) => {
  await query('DELETE FROM subscription_features WHERE subscription_id = $1', [subscriptionId]);
  if (!features.length) return;

  const values = [];
  const placeholders = [];
  features.forEach((feature, idx) => {
    const base = idx * 3;
    placeholders.push(`($${base + 1}, $${base + 2}, $${base + 3})`);
    values.push(subscriptionId, feature, idx + 1);
  });

  await query(
    `
    INSERT INTO subscription_features (subscription_id, feature_text, sort_order)
    VALUES ${placeholders.join(', ')};
    `,
    values
  );
};

const attachFeatures = async (plans) => {
  if (!plans.length) return plans;
  const planIds = plans.map((p) => p.id);
  const featureRows = await query(
    `
    SELECT subscription_id, feature_text
    FROM subscription_features
    WHERE subscription_id = ANY($1)
    ORDER BY subscription_id, sort_order ASC, id ASC;
    `,
    [planIds]
  );

  const featureMap = {};
  featureRows.rows.forEach((row) => {
    if (!featureMap[row.subscription_id]) featureMap[row.subscription_id] = [];
    featureMap[row.subscription_id].push(row.feature_text);
  });

  return plans.map((plan) => ({ ...plan, features: featureMap[plan.id] || [] }));
};

exports.createSubscriptionPlan = async (req, res, next) => {
  try {
    const {
      plan_name,
      price,
      price_with_saturday,
      price_without_saturday,
      saturday_option_enabled,
      meal_size_id,
      billing_cycle,
      duration_days,
      duration_days_with_saturday,
      duration_days_without_saturday,
      features,
      trial_days,
      display_order,
      is_active,
    } = req.body;
    const adminId = req.user.id;

    if (!plan_name || !billing_cycle) {
      return next(new AppError('plan_name and billing_cycle are required', 400));
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
    const mealSizeCheck = await query(
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

    const finalDurationWithSaturday = resolveDurationDays(duration_days_with_saturday, billing_cycle);
    const finalDurationWithoutSaturday = resolveDurationDays(duration_days_without_saturday, billing_cycle);
    const finalDurationDays = finalDurationWithSaturday;
    const normalizedFeatures = normalizeFeatures(features);

    const result = await query(
      `
      INSERT INTO subscriptions (
        plan_name, price, billing_cycle, duration_days, trial_days, display_order, is_active, created_by, updated_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *;
      `,
      [
        plan_name,
        resolvedPriceWithSaturday,
        billing_cycle,
        finalDurationDays,
        trial_days !== undefined ? trial_days : 0,
        display_order !== undefined ? display_order : 1,
        is_active !== undefined ? is_active : true,
        adminId,
        adminId,
      ]
    );
    await query(
      'UPDATE subscriptions SET meal_size_id = $1 WHERE id = $2',
      [Number(meal_size_id), result.rows[0].id]
    );
    await query(
      `
      UPDATE subscriptions
      SET
        price_with_saturday = $1,
        price_without_saturday = $2,
        saturday_option_enabled = COALESCE($3, saturday_option_enabled),
        duration_days_with_saturday = $4,
        duration_days_without_saturday = $5
      WHERE id = $6
      `,
      [
        resolvedPriceWithSaturday,
        resolvedPriceWithoutSaturday,
        saturday_option_enabled,
        finalDurationWithSaturday,
        finalDurationWithoutSaturday,
        result.rows[0].id,
      ]
    );
    result.rows[0].price = resolvedPriceWithSaturday;
    result.rows[0].price_with_saturday = resolvedPriceWithSaturday;
    result.rows[0].price_without_saturday = resolvedPriceWithoutSaturday;
    result.rows[0].meal_size_id = Number(meal_size_id);
    result.rows[0].duration_days_with_saturday = finalDurationWithSaturday;
    result.rows[0].duration_days_without_saturday = finalDurationWithoutSaturday;
    if (saturday_option_enabled !== undefined) {
      result.rows[0].saturday_option_enabled = saturday_option_enabled;
    }

    await writeFeatures(result.rows[0].id, normalizedFeatures);
    const hydrated = await attachFeatures([result.rows[0]]);

    res.status(201).json({
      success: true,
      message: 'Subscription plan created with duration_days',
      data: hydrated[0],
    });
  } catch (error) {
    next(error instanceof AppError ? error : new AppError(error.message || 'Error creating subscription plan', 500));
  }
};

exports.updateSubscriptionPlan = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      plan_name,
      price,
      billing_cycle,
      price_with_saturday,
      price_without_saturday,
      saturday_option_enabled,
      meal_size_id,
      duration_days,
      duration_days_with_saturday,
      duration_days_without_saturday,
      features,
      trial_days,
      display_order,
      is_active,
    } = req.body;
    const adminId = req.user.id;

    if (meal_size_id !== undefined && meal_size_id !== null && meal_size_id !== '') {
      const mealSizeCheck = await query(
        'SELECT id FROM meal_sizes WHERE id = $1 AND is_active = true',
        [Number(meal_size_id)]
      );
      if (mealSizeCheck.rows.length === 0) {
        return next(new AppError('Selected meal size is invalid or inactive', 400));
      }
    }

    const existing = await query('SELECT * FROM subscriptions WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return next(new AppError('Subscription not found', 404));
    }

    const current = existing.rows[0];
    const effectiveBillingCycle = billing_cycle !== undefined ? billing_cycle : current.billing_cycle;
    const effectiveDurationWithSaturday =
      duration_days_with_saturday !== undefined
        ? (duration_days_with_saturday === null || duration_days_with_saturday === '' ? null : resolveDurationDays(duration_days_with_saturday, effectiveBillingCycle))
        : (current.duration_days_with_saturday ?? null);
    const effectiveDurationWithoutSaturday =
      duration_days_without_saturday !== undefined
        ? (duration_days_without_saturday === null || duration_days_without_saturday === '' ? null : resolveDurationDays(duration_days_without_saturday, effectiveBillingCycle))
        : (current.duration_days_without_saturday ?? null);
    if (effectiveDurationWithSaturday === null) {
      return next(new AppError('duration_days_with_saturday is required', 400));
    }
    if (effectiveDurationWithoutSaturday === null) {
      return next(new AppError('duration_days_without_saturday is required', 400));
    }
    const effectiveDurationDays = effectiveDurationWithSaturday;
    const normalizedFeatures = features === undefined ? null : normalizeFeatures(features);
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

    const result = await query(
      `
      UPDATE subscriptions
      SET
        plan_name = COALESCE($1, plan_name),
        price = $2,
        billing_cycle = COALESCE($3, billing_cycle),
        duration_days = $4,
        trial_days = COALESCE($5, trial_days),
        display_order = COALESCE($6, display_order),
        is_active = COALESCE($7, is_active),
        updated_by = $8,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $9
      RETURNING *;
      `,
      [
        plan_name,
        nextPriceWithSaturday,
        billing_cycle,
        effectiveDurationDays,
        trial_days,
        display_order,
        is_active,
        adminId,
        id,
      ]
    );
    await query(
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
        effectiveDurationWithSaturday,
        effectiveDurationWithoutSaturday,
        id
      ]
    );
    result.rows[0].price = nextPriceWithSaturday;
    result.rows[0].price_with_saturday = nextPriceWithSaturday;
    result.rows[0].price_without_saturday = nextPriceWithoutSaturday;
    result.rows[0].duration_days_with_saturday = effectiveDurationWithSaturday;
    result.rows[0].duration_days_without_saturday = effectiveDurationWithoutSaturday;
    if (meal_size_id !== undefined) {
      result.rows[0].meal_size_id = Number(meal_size_id);
    }
    if (saturday_option_enabled !== undefined) {
      result.rows[0].saturday_option_enabled = saturday_option_enabled;
    }

    if (normalizedFeatures !== null) {
      await writeFeatures(id, normalizedFeatures);
    }
    const hydrated = await attachFeatures([result.rows[0]]);

    res.status(200).json({
      success: true,
      message: 'Subscription plan updated with duration_days',
      data: hydrated[0],
    });
  } catch (error) {
    next(error instanceof AppError ? error : new AppError(error.message || 'Error updating subscription plan', 500));
  }
};

exports.getAllSubscriptionPlans = async (req, res, next) => {
  try {
    const result = await query(
      `
      SELECT *
      FROM subscriptions
      WHERE trial_days = 0 OR trial_days IS NULL
      ORDER BY display_order ASC, created_at DESC;
      `
    );

    const hydrated = await attachFeatures(result.rows);
    res.status(200).json({
      success: true,
      count: hydrated.length,
      data: hydrated,
    });
  } catch (error) {
    next(new AppError(error.message || 'Error fetching subscription plans', 500));
  }
};

exports.getSubscriptionPlanById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await query('SELECT * FROM subscriptions WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return next(new AppError('Subscription not found', 404));
    }

    const hydrated = await attachFeatures(result.rows);
    res.status(200).json({
      success: true,
      data: hydrated[0],
    });
  } catch (error) {
    next(new AppError(error.message || 'Error fetching subscription plan', 500));
  }
};
