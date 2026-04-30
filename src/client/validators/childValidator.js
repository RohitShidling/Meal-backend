const AppError = require('../../common/utils/AppError');

/**
 * Validator for adding children
 * Supports adding 1 to 3 children at once
 */
const validateAddChildren = (req, res, next) => {
  const { children } = req.body;

  if (!children || !Array.isArray(children)) {
    return next(new AppError('Validation failed.', 400, ['children must be an array.']));
  }

  if (children.length === 0) {
    return next(new AppError('Validation failed.', 400, ['At least one child is required.']));
  }

  if (children.length > 3) {
    return next(new AppError('Validation failed.', 400, ['Maximum 3 children are allowed per parent.']));
  }

  const errors = [];

  children.forEach((child, index) => {
    const { name, rollNumber, schoolId, standardId, mealSizeId, mealTime } = child;

    if (!name || name.trim().length < 2) {
      errors.push(`Child ${index + 1}: Name is required.`);
    }
    if (!rollNumber || rollNumber.trim().length < 1) {
      errors.push(`Child ${index + 1}: Roll number/Register number is required.`);
    }
    if (!schoolId) {
      errors.push(`Child ${index + 1}: School selection is required.`);
    }
    if (!standardId) {
      errors.push(`Child ${index + 1}: Standard selection is required.`);
    }
    if (!mealSizeId) {
      errors.push(`Child ${index + 1}: Meal size selection is required.`);
    }
    if (!mealTime || !/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(mealTime)) {
      errors.push(`Child ${index + 1}: Valid meal time (HH:mm) is required.`);
    }
  });

  if (errors.length > 0) {
    return next(new AppError('Validation failed.', 400, errors));
  }

  next();
};

module.exports = { validateAddChildren };
