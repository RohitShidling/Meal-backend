const AppError = require('../../common/utils/AppError');
const { parseYmdStrict } = require('../../common/utils/sessionDate');

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

const normalizeItems = (items) => {
  if (!Array.isArray(items)) return null;
  const out = [];
  for (let i = 0; i < items.length; i += 1) {
    const row = items[i] || {};
    const dailyMenuId = String(row.dailyMenuId || row.daily_menu_id || '').trim();
    const bulkMealId = String(row.bulkMealId || row.bulk_meal_id || '').trim();
    const quantity = Number(row.quantity);
    if (!dailyMenuId && !bulkMealId) {
      return { error: `items[${i}] must include dailyMenuId or bulkMealId.` };
    }
    if (dailyMenuId && bulkMealId) {
      return { error: `items[${i}] cannot include both dailyMenuId and bulkMealId.` };
    }
    if (dailyMenuId && !/^MN-\d+$/.test(dailyMenuId)) {
      return { error: `items[${i}].dailyMenuId is invalid.` };
    }
    if (bulkMealId && !/^BVM-\d+$/.test(bulkMealId)) {
      return { error: `items[${i}].bulkMealId is invalid.` };
    }
    if (!Number.isInteger(quantity) || quantity < 1) {
      return { error: `items[${i}].quantity must be a positive integer.` };
    }
    out.push({ dailyMenuId, bulkMealId, quantity });
  }
  return { items: out };
};

exports.validateQuoteBody = (req, res, next) => {
  const { deliveryDate, items } = req.body || {};
  const errors = [];
  const ymd =
    typeof deliveryDate === 'string' && YMD_REGEX.test(deliveryDate.trim())
      ? deliveryDate.trim()
      : null;
  if (!ymd || !parseYmdStrict(ymd)) {
    errors.push('deliveryDate must be YYYY-MM-DD.');
  }
  const normalized = normalizeItems(items);
  if (!normalized || normalized.error) {
    errors.push(normalized?.error || 'items must be a non-empty array.');
  }
  if (errors.length > 0) {
    return next(new AppError('Validation failed.', 400, errors));
  }
  req.bulkOrderPayload = { deliveryDate: ymd, items: normalized.items };
  return next();
};

exports.validateInitiateBody = (req, res, next) => {
  const { deliveryDate, items, redirectUrl } = req.body || {};
  const errors = [];
  const ymd =
    typeof deliveryDate === 'string' && YMD_REGEX.test(deliveryDate.trim())
      ? deliveryDate.trim()
      : null;
  if (!ymd || !parseYmdStrict(ymd)) {
    errors.push('deliveryDate must be YYYY-MM-DD.');
  }
  const normalized = normalizeItems(items);
  if (!normalized || normalized.error) {
    errors.push(normalized?.error || 'items must be a non-empty array.');
  }
  validateUrlIfProvided(redirectUrl, 'redirectUrl', errors);
  if (errors.length > 0) {
    return next(new AppError('Validation failed.', 400, errors));
  }
  req.bulkOrderPayload = { deliveryDate: ymd, items: normalized.items, redirectUrl };
  return next();
};

exports.validateBulkOrderIdParam = (req, res, next) => {
  const id = String(req.params?.id || '').trim();
  if (!/^BLK-\d+$/.test(id)) {
    return next(new AppError('Invalid bulk order id.', 400));
  }
  req.params.id = id;
  return next();
};
