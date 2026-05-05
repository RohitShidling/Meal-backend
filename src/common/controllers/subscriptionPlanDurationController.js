const { query } = require('../database');
const AppError = require('../utils/AppError');

const attachFeatures = async (plans) => {
  if (!plans.length) return plans;
  const ids = plans.map((p) => p.id);
  const featureRows = await query(
    `
    SELECT subscription_id, feature_text
    FROM subscription_features
    WHERE subscription_id = ANY($1)
    ORDER BY subscription_id, sort_order ASC, id ASC;
    `,
    [ids]
  );

  const featureMap = {};
  featureRows.rows.forEach((row) => {
    if (!featureMap[row.subscription_id]) featureMap[row.subscription_id] = [];
    featureMap[row.subscription_id].push(row.feature_text);
  });

  return plans.map((plan) => ({ ...plan, features: featureMap[plan.id] || [] }));
};

exports.getSubscriptionPlans = async (req, res, next) => {
  try {
    const isClient = req.user.role === 'client';

    let sql = `
      SELECT id, plan_name, price, price_with_saturday, price_without_saturday, saturday_option_enabled, meal_size_id, billing_cycle, duration_days, trial_days, display_order, is_active, created_at, updated_at
      FROM subscriptions
    `;

    if (isClient) {
      sql += ' WHERE is_active = true';
    }

    sql += ' ORDER BY display_order ASC, created_at DESC';

    const result = await query(sql);

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
    const isClient = req.user.role === 'client';

    let sql = `
      SELECT id, plan_name, price, price_with_saturday, price_without_saturday, saturday_option_enabled, meal_size_id, billing_cycle, duration_days, trial_days, display_order, is_active, created_at, updated_at
      FROM subscriptions
      WHERE id = $1
    `;
    if (isClient) {
      sql += ' AND is_active = true';
    }

    const result = await query(sql, [id]);
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
