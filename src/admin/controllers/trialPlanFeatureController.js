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
    const { plan_name, price, billing_cycle, trial_days, display_order, is_active, features } = req.body;
    const adminId = req.user.id;

    if (!plan_name || price === undefined || !billing_cycle || trial_days === undefined) {
      return next(new AppError('plan_name, price, billing_cycle and trial_days are required', 400));
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
        Number(price),
        String(billing_cycle).trim(),
        Number(trial_days),
        Number(trial_days),
        display_order !== undefined ? Number(display_order) : 1,
        is_active !== undefined ? is_active : true,
        adminId,
        adminId,
      ]
    );

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
    const { plan_name, price, billing_cycle, trial_days, display_order, is_active, features } = req.body;
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

    const result = await db.query(
      `
      UPDATE subscriptions
      SET
        plan_name = COALESCE($1, plan_name),
        price = COALESCE($2, price),
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
        price !== undefined ? Number(price) : null,
        billing_cycle !== undefined ? String(billing_cycle).trim() : null,
        effectiveTrialDays,
        display_order !== undefined ? Number(display_order) : null,
        is_active !== undefined ? is_active : null,
        adminId,
        id,
      ]
    );

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
