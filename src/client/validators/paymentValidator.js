const AppError = require('../../common/utils/AppError');

const ENTITY_TYPES = new Set(['child', 'teacher', 'professional']);
const YMD_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const validateUrlIfProvided = (value, fieldName, errors) => {
  if (value === undefined || value === null || value === '') return;
  if (typeof value !== 'string' || value.length > 500) {
    errors.push(`${fieldName} must be a valid URL string.`);
    return;
  }
  try {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      errors.push(`${fieldName} must start with http or https.`);
    }
  } catch {
    errors.push(`${fieldName} must be a valid URL.`);
  }
};

const validateInitiatePayment = (req, res, next) => {
  const { subscriptionId, entityType, entityId, startDate, includeSaturday, redirectUrl } = req.body || {};
  const errors = [];
  if (!subscriptionId || typeof subscriptionId !== 'string' || subscriptionId.trim().length < 3) {
    errors.push('subscriptionId is required.');
  }
  if (!entityType || typeof entityType !== 'string' || !ENTITY_TYPES.has(entityType)) {
    errors.push('entityType must be child, teacher, or professional.');
  }
  if (!entityId || typeof entityId !== 'string' || entityId.trim().length < 2) {
    errors.push('entityId is required.');
  }
  if (startDate !== undefined && startDate !== null && startDate !== '' && (typeof startDate !== 'string' || !YMD_REGEX.test(startDate.trim()))) {
    errors.push('startDate must be in YYYY-MM-DD format.');
  }
  if (includeSaturday !== undefined && typeof includeSaturday !== 'boolean' && !['true', 'false', '1', '0', 'yes', 'no'].includes(String(includeSaturday).toLowerCase())) {
    errors.push('includeSaturday must be boolean-like.');
  }
  validateUrlIfProvided(redirectUrl, 'redirectUrl', errors);
  if (errors.length > 0) {
    return next(new AppError('Validation failed.', 400, errors));
  }
  return next();
};

const validateCheckoutCart = (req, res, next) => {
  const { redirectUrl } = req.body || {};
  const errors = [];
  validateUrlIfProvided(redirectUrl, 'redirectUrl', errors);
  if (errors.length > 0) {
    return next(new AppError('Validation failed.', 400, errors));
  }
  return next();
};

const validateTxnPathParam = (req, res, next) => {
  const txnId = req.params?.txnId;
  if (!txnId || typeof txnId !== 'string' || txnId.trim().length < 6 || txnId.trim().length > 100) {
    return next(new AppError('Validation failed.', 400, ['Invalid transaction id.']));
  }
  return next();
};

module.exports = {
  validateInitiatePayment,
  validateCheckoutCart,
  validateTxnPathParam
};

