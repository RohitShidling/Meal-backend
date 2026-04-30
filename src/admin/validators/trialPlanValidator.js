const AppError = require('../../common/utils/AppError');

const validateCreateTrialPlan = (req, res, next) => {
  const { plan_name, price, billing_cycle, trial_days } = req.body;

  if (!plan_name || typeof plan_name !== 'string' || !plan_name.trim()) {
    return next(new AppError('plan_name is required.', 400));
  }
  if (price === undefined || Number.isNaN(Number(price)) || Number(price) < 0) {
    return next(new AppError('price is required and must be a non-negative number.', 400));
  }
  if (!billing_cycle || typeof billing_cycle !== 'string' || !billing_cycle.trim()) {
    return next(new AppError('billing_cycle is required.', 400));
  }
  if (trial_days === undefined || Number.isNaN(Number(trial_days)) || Number(trial_days) <= 0) {
    return next(new AppError('trial_days is required and must be greater than 0.', 400));
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
    return next(new AppError('At least one field is required to update.', 400));
  }

  if (plan_name !== undefined && (typeof plan_name !== 'string' || !plan_name.trim())) {
    return next(new AppError('plan_name must be a non-empty string.', 400));
  }
  if (price !== undefined && (Number.isNaN(Number(price)) || Number(price) < 0)) {
    return next(new AppError('price must be a non-negative number.', 400));
  }
  if (billing_cycle !== undefined && (typeof billing_cycle !== 'string' || !billing_cycle.trim())) {
    return next(new AppError('billing_cycle must be a non-empty string.', 400));
  }
  if (trial_days !== undefined && (Number.isNaN(Number(trial_days)) || Number(trial_days) <= 0)) {
    return next(new AppError('trial_days must be greater than 0.', 400));
  }
  if (display_order !== undefined && Number.isNaN(Number(display_order))) {
    return next(new AppError('display_order must be a number.', 400));
  }
  if (is_active !== undefined && typeof is_active !== 'boolean') {
    return next(new AppError('is_active must be boolean.', 400));
  }

  next();
};

const validateTrialPlanId = (req, res, next) => {
  const { id } = req.params;
  if (!id || typeof id !== 'string' || !id.trim()) {
    return next(new AppError('id is required.', 400));
  }
  next();
};

const validateSetActive = (req, res, next) => {
  const { is_active } = req.body;
  if (typeof is_active !== 'boolean') {
    return next(new AppError('is_active is required and must be boolean.', 400));
  }
  next();
};

module.exports = {
  validateCreateTrialPlan,
  validateUpdateTrialPlan,
  validateTrialPlanId,
  validateSetActive
};
