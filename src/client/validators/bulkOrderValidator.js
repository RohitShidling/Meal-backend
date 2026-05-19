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

const normalizeDeliveryAddress = (body) => {
  const raw = body.deliveryAddress ?? body.delivery_address ?? body.address;
  if (!raw || typeof raw !== 'object') {
    return { error: 'deliveryAddress is required (stateId, cityId, address).' };
  }
  const stateId = Number(raw.stateId ?? raw.state_id);
  const cityId = Number(raw.cityId ?? raw.city_id);
  const address = String(raw.address ?? raw.addressLine ?? raw.address_line ?? '').trim();
  const pincode = String(raw.pincode ?? '').trim();

  if (!Number.isInteger(stateId) || stateId < 1) {
    return { error: 'deliveryAddress.stateId must be a positive integer.' };
  }
  if (!Number.isInteger(cityId) || cityId < 1) {
    return { error: 'deliveryAddress.cityId must be a positive integer.' };
  }
  if (address.length < 5) {
    return { error: 'deliveryAddress.address must be at least 5 characters.' };
  }
  if (address.length > 500) {
    return { error: 'deliveryAddress.address must be at most 500 characters.' };
  }
  if (pincode && !/^\d{6}$/.test(pincode)) {
    return { error: 'deliveryAddress.pincode must be 6 digits when provided.' };
  }

  return {
    deliveryAddress: {
      stateId,
      cityId,
      address,
      pincode: pincode || undefined,
    },
  };
};

const buildPayload = (body, errors) => {
  const ymd =
    typeof body.deliveryDate === 'string' && YMD_REGEX.test(body.deliveryDate.trim())
      ? body.deliveryDate.trim()
      : null;
  if (!ymd || !parseYmdStrict(ymd)) {
    errors.push('deliveryDate must be YYYY-MM-DD.');
  }

  const normalized = normalizeItems(body.items);
  if (!normalized || normalized.error) {
    errors.push(normalized?.error || 'items must be a non-empty array.');
  }

  const addressNorm = normalizeDeliveryAddress(body);
  if (addressNorm.error) {
    errors.push(addressNorm.error);
  }

  if (errors.length > 0) return null;

  return {
    deliveryDate: ymd,
    items: normalized.items,
    deliveryAddress: addressNorm.deliveryAddress,
  };
};

exports.validateQuoteBody = (req, res, next) => {
  const errors = [];
  const payload = buildPayload(req.body || {}, errors);
  if (!payload) {
    return next(new AppError('Validation failed.', 400, errors));
  }
  req.bulkOrderPayload = payload;
  return next();
};

exports.validateInitiateBody = (req, res, next) => {
  const { redirectUrl } = req.body || {};
  const errors = [];
  const payload = buildPayload(req.body || {}, errors);
  validateUrlIfProvided(redirectUrl, 'redirectUrl', errors);
  if (!payload || errors.length > 0) {
    return next(new AppError('Validation failed.', 400, errors));
  }
  req.bulkOrderPayload = { ...payload, redirectUrl };
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
