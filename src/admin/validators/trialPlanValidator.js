const AppError = require('../../common/utils/AppError');

const validateCreateTrialPlan = (req, res, next) => {
  const { plan_name, price, billing_cycle, trial_days } = req.body;

  if (!plan_name || typeof plan_name !== 'string' || !plan_name.trim()) {
    return next(new AppError('Validation failed.', 400, ['plan_name is required.']));
  }
  if (price === undefined || Number.isNaN(Number(price)) || Number(price) < 0) {
    return next(new AppError('Validation failed.', 400, ['price is required and must be a non-negative number.']));
  }
  if (!billing_cycle || typeof billing_cycle !== 'string' || !billing_cycle.trim()) {
    return next(new AppError('Validation failed.', 400, ['billing_cycle is required.']));
  }
  if (trial_days === undefined || Number.isNaN(Number(trial_days)) || Number(trial_days) <= 0) {
    return next(new AppError('Validation failed.', 400, ['trial_days is required and must be greater than 0.']));
  }

  next();
};

const validateUpdateTrialPlan = (req, res, next) => {
  const { plan_name, price, billing_cycle, trial_days, display_order, is_active } = req.body;

  if (
    plan_name === undefined &&
    price === undefined &&
    billing_cycle === undefined &&
    trial_days === undefined &&
    display_order === undefined &&
    is_active === undefined
  ) {
    return next(new AppError('Validation failed.', 400, ['At least one field is required to update.']));
  }

  if (plan_name !== undefined && (typeof plan_name !== 'string' || !plan_name.trim())) {
    return next(new AppError('Validation failed.', 400, ['plan_name must be a non-empty string.']));
  }
  if (price !== undefined && (Number.isNaN(Number(price)) || Number(price) < 0)) {
    return next(new AppError('Validation failed.', 400, ['price must be a non-negative number.']));
  }
  if (billing_cycle !== undefined && (typeof billing_cycle !== 'string' || !billing_cycle.trim())) {
    return next(new AppError('Validation failed.', 400, ['billing_cycle must be a non-empty string.']));
  }
  if (trial_days !== undefined && (Number.isNaN(Number(trial_days)) || Number(trial_days) <= 0)) {
    return next(new AppError('Validation failed.', 400, ['trial_days must be greater than 0.']));
  }
  if (display_order !== undefined && Number.isNaN(Number(display_order))) {
    return next(new AppError('Validation failed.', 400, ['display_order must be a number.']));
  }
  if (is_active !== undefined && typeof is_active !== 'boolean') {
    return next(new AppError('Validation failed.', 400, ['is_active must be boolean.']));
  }

  next();
};

const validateTrialPlanId = (req, res, next) => {
  const { id } = req.params;
  if (!id || typeof id !== 'string' || !id.trim()) {
    return next(new AppError('Validation failed.', 400, ['id is required.']));
  }
  next();
};

const validateSetActive = (req, res, next) => {
  const { is_active } = req.body;
  if (typeof is_active !== 'boolean') {
    return next(new AppError('Validation failed.', 400, ['is_active is required and must be boolean.']));
  }
  next();
};

module.exports = {
  validateCreateTrialPlan,
  validateUpdateTrialPlan,
  validateTrialPlanId,
  validateSetActive
};
