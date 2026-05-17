const AppError = require('../../common/utils/AppError');

const parsePositiveInt = (value, field, { min = 0, max = 100000 } = {}) => {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new AppError(`${field} must be an integer between ${min} and ${max}.`, 400);
  }
  return n;
};

const parseNonNegativeMoney = (value, field) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 9999999.99) {
    throw new AppError(`${field} must be a valid non-negative amount.`, 400);
  }
  return Math.round(n * 100) / 100;
};

exports.validateUpdateConfig = (req, res, next) => {
  try {
    const body = req.body || {};
    const payload = {};
    if (body.min_quantity !== undefined) {
      payload.min_quantity = parsePositiveInt(body.min_quantity, 'min_quantity', { min: 1, max: 5000 });
    }
    if (body.min_lead_days !== undefined) {
      payload.min_lead_days = parsePositiveInt(body.min_lead_days, 'min_lead_days', { min: 0, max: 365 });
    }
    if (body.tier_threshold !== undefined) {
      payload.tier_threshold = parsePositiveInt(body.tier_threshold, 'tier_threshold', { min: 2, max: 5000 });
    }
    if (body.standard_max_quantity !== undefined) {
      payload.standard_max_quantity = parsePositiveInt(body.standard_max_quantity, 'standard_max_quantity', {
        min: 1,
        max: 5000,
      });
    }
    const hubTextFields = [
      'hub_intro_text',
      'standard_tier_title',
      'standard_tier_subtitle',
      'standard_tier_description',
      'variety_tier_title',
      'variety_tier_subtitle',
      'variety_tier_description',
    ];
    for (const key of hubTextFields) {
      if (body[key] !== undefined) {
        const val = String(body[key] ?? '').trim();
        if (key.endsWith('_title') || key.endsWith('_subtitle')) {
          if (val.length > 200) {
            throw new AppError(`${key} must be at most 200 characters.`, 400);
          }
        } else if (val.length > 2000) {
          throw new AppError(`${key} must be at most 2000 characters.`, 400);
        }
        payload[key] = val || null;
      }
    }
    if (body.price_per_meal_under_threshold !== undefined) {
      payload.price_per_meal_under_threshold = parseNonNegativeMoney(
        body.price_per_meal_under_threshold,
        'price_per_meal_under_threshold'
      );
    }
    if (body.variety_menu_lookahead_days !== undefined) {
      payload.variety_menu_lookahead_days = parsePositiveInt(
        body.variety_menu_lookahead_days,
        'variety_menu_lookahead_days',
        { min: 0, max: 90 }
      );
    }
    if (body.max_variety_types !== undefined) {
      payload.max_variety_types = parsePositiveInt(body.max_variety_types, 'max_variety_types', {
        min: 1,
        max: 20,
      });
    }
    if (body.allow_multiple_variety_meals !== undefined) {
      payload.allow_multiple_variety_meals = !(
        body.allow_multiple_variety_meals === false || body.allow_multiple_variety_meals === 'false'
      );
    }
    if (body.min_quantity_per_variety_meal !== undefined) {
      payload.min_quantity_per_variety_meal = parsePositiveInt(
        body.min_quantity_per_variety_meal,
        'min_quantity_per_variety_meal',
        { min: 1, max: 5000 }
      );
    }
    if (body.is_active !== undefined) {
      payload.is_active = Boolean(body.is_active);
    }
    if (Object.keys(payload).length === 0) {
      return next(new AppError('No valid fields to update.', 400));
    }
    req.validatedBulkConfig = payload;
    return next();
  } catch (err) {
    return next(err);
  }
};

const parseCategoryId = (value) => {
  const id = String(value || '').trim();
  if (!/^BVC-\d+$/.test(id)) {
    throw new AppError('category_id must be a valid bulk variety category id (BVC-n).', 400);
  }
  return id;
};

exports.validateVarietyCategoryId = (req, res, next) => {
  const id = String(req.params?.id || '').trim();
  if (!/^BVC-\d+$/.test(id)) {
    return next(new AppError('Invalid bulk variety category id.', 400));
  }
  req.params.id = id;
  return next();
};

exports.validateCreateVarietyCategory = (req, res, next) => {
  try {
    const name = String(req.body?.name || '').trim();
    if (!name || name.length > 255) {
      throw new AppError('name is required (max 255 characters).', 400);
    }
    req.validatedCategory = {
      name,
      description: req.body?.description ? String(req.body.description).trim() : null,
      is_active:
        req.body?.is_active !== undefined
          ? !(req.body.is_active === false || req.body.is_active === 'false')
          : true,
      sort_order:
        req.body?.sort_order !== undefined
          ? parsePositiveInt(req.body.sort_order, 'sort_order', { min: 0, max: 10000 })
          : 0,
    };
    return next();
  } catch (err) {
    return next(err);
  }
};

exports.validateUpdateVarietyCategory = (req, res, next) => {
  try {
    const payload = {};
    if (req.body?.name !== undefined) {
      const name = String(req.body.name).trim();
      if (!name || name.length > 255) {
        throw new AppError('name must be a non-empty string (max 255 characters).', 400);
      }
      payload.name = name;
    }
    if (req.body?.description !== undefined) {
      payload.description = String(req.body.description).trim() || null;
    }
    if (req.body?.is_active !== undefined) {
      payload.is_active = !(req.body.is_active === false || req.body.is_active === 'false');
    }
    if (req.body?.sort_order !== undefined) {
      payload.sort_order = parsePositiveInt(req.body.sort_order, 'sort_order', { min: 0, max: 10000 });
    }
    if (Object.keys(payload).length === 0 && !req.file) {
      return next(new AppError('No valid fields to update.', 400));
    }
    req.validatedCategory = payload;
    return next();
  } catch (err) {
    return next(err);
  }
};

exports.validateVarietyMealId = (req, res, next) => {
  const id = String(req.params?.id || '').trim();
  if (!/^BVM-\d+$/.test(id)) {
    return next(new AppError('Invalid bulk variety meal id.', 400));
  }
  req.params.id = id;
  return next();
};

exports.validateCreateVarietyMeal = (req, res, next) => {
  try {
    const name = String(req.body?.name || '').trim();
    if (!name || name.length > 500) {
      throw new AppError('name is required (max 500 characters).', 400);
    }
    req.validatedVarietyMeal = {
      name,
      category_id: parseCategoryId(req.body?.category_id),
      price_per_meal: parseNonNegativeMoney(req.body?.price_per_meal, 'price_per_meal'),
      min_order_quantity:
        req.body?.min_order_quantity !== undefined
          ? parsePositiveInt(req.body.min_order_quantity, 'min_order_quantity', { min: 1, max: 5000 })
          : 1,
      is_active:
        req.body?.is_active !== undefined
          ? !(req.body.is_active === false || req.body.is_active === 'false')
          : true,
      sort_order:
        req.body?.sort_order !== undefined
          ? parsePositiveInt(req.body.sort_order, 'sort_order', { min: 0, max: 10000 })
          : 0,
    };
    return next();
  } catch (err) {
    return next(err);
  }
};

exports.validateUpdateVarietyMeal = (req, res, next) => {
  try {
    const payload = {};
    if (req.body?.name !== undefined) {
      const name = String(req.body.name).trim();
      if (!name || name.length > 500) {
        throw new AppError('name must be a non-empty string (max 500 characters).', 400);
      }
      payload.name = name;
    }
    if (req.body?.price_per_meal !== undefined) {
      payload.price_per_meal = parseNonNegativeMoney(req.body.price_per_meal, 'price_per_meal');
    }
    if (req.body?.min_order_quantity !== undefined) {
      payload.min_order_quantity = parsePositiveInt(
        req.body.min_order_quantity,
        'min_order_quantity',
        { min: 1, max: 5000 }
      );
    }
    if (req.body?.is_active !== undefined) {
      payload.is_active = !(req.body.is_active === false || req.body.is_active === 'false');
    }
    if (req.body?.sort_order !== undefined) {
      payload.sort_order = parsePositiveInt(req.body.sort_order, 'sort_order', { min: 0, max: 10000 });
    }
    if (req.body?.category_id !== undefined) {
      payload.category_id = parseCategoryId(req.body.category_id);
    }
    if (Object.keys(payload).length === 0 && !req.file) {
      return next(new AppError('No valid fields to update.', 400));
    }
    req.validatedVarietyMeal = payload;
    return next();
  } catch (err) {
    return next(err);
  }
};
