const AppError = require('../../common/utils/AppError');

/**
 * Validator for professional profile
 */
const validateProfessionalProfile = (req, res, next) => {
  const { name, company_name, corporate_location_id, city, state } = req.body;
  const mealTiming = req.body.mealTiming ?? req.body.lunch_time;
  const mealSizeId = req.body.mealSizeId ?? req.body.meal_size_id;
  const errors = [];

  if (!name || name.trim().length < 2) {
    errors.push('Name is required and must be at least 2 characters.');
  } else if (/^\d+$/.test(name.trim())) {
    errors.push('Name cannot be just a numerical value.');
  }

  if (!company_name || company_name.trim().length < 1) {
    errors.push('Company name is required.');
  }

  if (!corporate_location_id) {
    errors.push('Corporate location selection is required.');
  }

  if (!city) {
    errors.push('City is required.');
  }

  if (!state) {
    errors.push('State is required.');
  }

  if (!mealTiming) {
    errors.push('Meal timing is required.');
  } else if (!/^(\d{1,2}:[0-5]\d(\s?(AM|PM))?|\d{2}:\d{2}:\d{2})$/i.test(String(mealTiming).trim())) {
    errors.push('Meal timing must be in HH:MM, HH:MM AM/PM, or HH:MM:SS format.');
  }
  if (!mealSizeId) {
    errors.push('Meal size selection is required.');
  }

  if (errors.length > 0) {
    return next(new AppError('Validation failed.', 400, errors));
  }

  next();
};

/**
 * Validator for teacher profile
 */
const validateTeacherProfile = (req, res, next) => {
  const { name, school_college_name, city, state } = req.body;
  const mealTime = req.body.meal_time ?? req.body.mealTiming;
  const mealSizeId = req.body.meal_size_id ?? req.body.mealSizeId;
  const errors = [];

  if (!name || name.trim().length < 2) {
    errors.push('Name is required and must be at least 2 characters.');
  } else if (/^\d+$/.test(name.trim())) {
    errors.push('Name cannot be just a numerical value.');
  }

  if (!school_college_name || school_college_name.trim().length < 1) {
    errors.push('School/College name is required.');
  }

  if (!city) {
    errors.push('City is required.');
  }

  if (!state) {
    errors.push('State is required.');
  }
  if (!mealSizeId) {
    errors.push('Meal size selection is required.');
  }

  if (!mealTime) {
    errors.push('Meal time is required.');
  } else if (!/^(\d{1,2}:[0-5]\d(\s?(AM|PM))?|\d{2}:\d{2}:\d{2})$/i.test(String(mealTime).trim())) {
    errors.push('Meal time must be in HH:MM, HH:MM AM/PM, or HH:MM:SS format.');
  }

  if (errors.length > 0) {
    return next(new AppError('Validation failed.', 400, errors));
  }

  next();
};

/**
 * Validator for parent profile
 */
const validateParentProfile = (req, res, next) => {
  const { name } = req.body;
  const errors = [];

  if (!name || name.trim().length < 2) {
    errors.push('Name is required and must be at least 2 characters.');
  } else if (/^\d+$/.test(name.trim())) {
    errors.push('Name cannot be just a numerical value.');
  }

  if (errors.length > 0) {
    return next(new AppError('Validation failed.', 400, errors));
  }

  next();
};

module.exports = {
  validateProfessionalProfile,
  validateTeacherProfile,
  validateParentProfile
};
