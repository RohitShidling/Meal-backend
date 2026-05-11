const db = require('../../common/database');
const catchAsync = require('../../common/utils/catchAsync');
const AppError = require('../../common/utils/AppError');

const createTrialPlan = catchAsync(async (req, res, next) => {
  const { plan_name, price, billing_cycle, trial_days, display_order, is_active } = req.body;
  const adminId = req.user.id;

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
        plan_name, price, billing_cycle, trial_days, display_order, is_active, created_by, updated_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, plan_name, price, billing_cycle, trial_days, display_order, is_active, created_by, updated_by, created_at, updated_at
    `,
    [
      plan_name.trim(),
      Number(price),
      billing_cycle.trim(),
      Number(trial_days),
      display_order !== undefined ? Number(display_order) : 1,
      is_active !== undefined ? is_active : true,
      adminId,
      adminId
    ]
  );

  return res.status(201).json({
    success: true,
    message: 'Trial plan created successfully.',
    data: result.rows[0]
  });
});

const getTrialPlans = catchAsync(async (req, res) => {
  const result = await db.query(
    `
      SELECT id, plan_name, price, billing_cycle, trial_days, display_order, is_active, created_by, updated_by, created_at, updated_at
      FROM subscriptions
      WHERE trial_days > 0
      ORDER BY display_order ASC, created_at DESC
    `
  );

  return res.status(200).json({
    success: true,
    count: result.rows.length,
    data: result.rows
  });
});

const getTrialPlanById = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const result = await db.query(
    `
      SELECT id, plan_name, price, billing_cycle, trial_days, display_order, is_active, created_by, updated_by, created_at, updated_at
      FROM subscriptions
      WHERE id = $1 AND trial_days > 0
    `,
    [id]
  );

  if (result.rows.length === 0) {
    return next(new AppError('Trial plan not found.', 404));
  }

  return res.status(200).json({
    success: true,
    data: result.rows[0]
  });
});

const updateTrialPlan = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const { plan_name, price, billing_cycle, trial_days, display_order, is_active } = req.body;
  const adminId = req.user.id;

  const exists = await db.query('SELECT id FROM subscriptions WHERE id = $1 AND trial_days > 0', [id]);
  if (exists.rows.length === 0) {
    return next(new AppError('Trial plan not found.', 404));
  }

  if (plan_name !== undefined) {
    const duplicate = await db.query(
      'SELECT id FROM subscriptions WHERE LOWER(plan_name) = LOWER($1) AND trial_days > 0 AND id <> $2',
      [plan_name.trim(), id]
    );
    if (duplicate.rows.length > 0) {
      return next(new AppError('Trial plan with this name already exists.', 409));
    }
  }

  const result = await db.query(
    `
      UPDATE subscriptions
      SET
        plan_name = COALESCE($1, plan_name),
        price = COALESCE($2, price),
        billing_cycle = COALESCE($3, billing_cycle),
        trial_days = COALESCE($4, trial_days),
        display_order = COALESCE($5, display_order),
        is_active = COALESCE($6, is_active),
        updated_by = $7,
        updated_at = NOW()
      WHERE id = $8 AND trial_days > 0
      RETURNING id, plan_name, price, billing_cycle, trial_days, display_order, is_active, created_by, updated_by, created_at, updated_at
    `,
    [
      plan_name !== undefined ? plan_name.trim() : null,
      price !== undefined ? Number(price) : null,
      billing_cycle !== undefined ? billing_cycle.trim() : null,
      trial_days !== undefined ? Number(trial_days) : null,
      display_order !== undefined ? Number(display_order) : null,
      is_active !== undefined ? is_active : null,
      adminId,
      id
    ]
  );

  return res.status(200).json({
    success: true,
    message: 'Trial plan updated successfully.',
    data: result.rows[0]
  });
});

const setTrialPlanActive = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const { is_active } = req.body;
  const adminId = req.user.id;

  const result = await db.query(
    `
      UPDATE subscriptions
      SET is_active = $1, updated_by = $2, updated_at = NOW()
      WHERE id = $3 AND trial_days > 0
      RETURNING id, plan_name, is_active, updated_by, updated_at
    `,
    [is_active, adminId, id]
  );

  if (result.rows.length === 0) {
    return next(new AppError('Trial plan not found.', 404));
  }

  return res.status(200).json({
    success: true,
    message: 'Trial plan status updated successfully.',
    data: result.rows[0]
  });
});

const deleteTrialPlan = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const inUse = await db.query(
    `SELECT COUNT(*)::int AS active_count
     FROM client_subscriptions
     WHERE subscription_id = $1 AND is_active = true`,
    [id]
  );
  if ((inUse.rows[0]?.active_count || 0) > 0) {
    return next(new AppError('Cannot delete trial plan with active client subscriptions. Deactivate plan instead.', 409));
  }
  const result = await db.query(
    'DELETE FROM subscriptions WHERE id = $1 AND trial_days > 0 RETURNING id, plan_name',
    [id]
  );

  if (result.rows.length === 0) {
    return next(new AppError('Trial plan not found.', 404));
  }

  return res.status(200).json({
    success: true,
    message: 'Trial plan deleted successfully.',
    data: result.rows[0]
  });
});

module.exports = {
  createTrialPlan,
  getTrialPlans,
  getTrialPlanById,
  updateTrialPlan,
  setTrialPlanActive,
  deleteTrialPlan
};
