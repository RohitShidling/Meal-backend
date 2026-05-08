const AppError = require('../../common/utils/AppError');

const ENTITY_TYPES = new Set(['child', 'teacher', 'professional']);
const YMD_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const validateMealSkipRequest = (req, res, next) => {
  const { entityType, entityId, startDate, endDate } = req.body || {};
  const errors = [];
  if (!entityType || typeof entityType !== 'string' || !ENTITY_TYPES.has(entityType)) {
    errors.push('entityType must be child, teacher, or professional.');
  }
  if (!entityId || typeof entityId !== 'string' || entityId.trim().length < 2) {
    errors.push('entityId is required.');
  }
  if (!startDate || typeof startDate !== 'string' || !YMD_REGEX.test(startDate.trim())) {
    errors.push('startDate must be YYYY-MM-DD.');
  }
  if (!endDate || typeof endDate !== 'string' || !YMD_REGEX.test(endDate.trim())) {
    errors.push('endDate must be YYYY-MM-DD.');
  }
  if (errors.length > 0) {
    return next(new AppError('Validation failed.', 400, errors));
  }
  return next();
};

const validateSkipIdParam = (req, res, next) => {
  const raw = req.params?.skipId;
  const skipId = Number.parseInt(raw, 10);
  if (!Number.isInteger(skipId) || skipId <= 0) {
    return next(new AppError('Validation failed.', 400, ['skipId must be a positive integer.']));
  }
  return next();
};

module.exports = {
  validateMealSkipRequest,
  validateSkipIdParam
};

