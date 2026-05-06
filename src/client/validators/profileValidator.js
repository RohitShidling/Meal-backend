const AppError = require('../../common/utils/AppError');

/**
 * Validator for professional profile
 */
const validateProfessionalProfile = (req, res, next) => {
  const { name, company_name, corporate_location_id, city, state, lunch_time } = req.body;
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

  if (!lunch_time) {
    errors.push('Lunch time is required.');
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
  const { name, school_college_name, city, state, meal_time } = req.body;
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

  if (!meal_time) {
    errors.push('Meal time is required.');
  } else if (!/^\d{2}:\d{2}(:\d{2})?$/.test(String(meal_time).trim())) {
    errors.push('Meal time must be in HH:MM or HH:MM:SS format.');
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
