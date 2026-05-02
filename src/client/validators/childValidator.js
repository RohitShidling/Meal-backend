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
    } else if (/^\d+$/.test(name.trim())) {
      errors.push(`Child ${index + 1}: Name cannot be just a numerical value.`);
    }

    if (!rollNumber || rollNumber.trim().length < 1) {
      errors.push(`Child ${index + 1}: Roll number/Register number is required.`);
    } else if (!/\d/.test(rollNumber.trim())) {
      errors.push(`Child ${index + 1}: Roll number must contain at least one numerical digit.`);
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

/**
 * Validator for updating a child
 */
const validateUpdateChild = (req, res, next) => {
  const { name, rollNumber, schoolId, standardId, mealSizeId, mealTime } = req.body;
  const errors = [];

  if (name !== undefined) {
    if (name.trim().length < 2) {
      errors.push('Name must be at least 2 characters.');
    } else if (/^\d+$/.test(name.trim())) {
      errors.push('Name cannot be just a numerical value.');
    }
  }

  if (rollNumber !== undefined) {
    if (rollNumber.trim().length < 1) {
      errors.push('Roll number/Register number is required.');
    } else if (!/\d/.test(rollNumber.trim())) {
      errors.push('Roll number must contain at least one numerical digit.');
    }
  }

  if (mealTime !== undefined && !/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(mealTime)) {
    errors.push('Valid meal time (HH:mm) is required.');
  }

  if (errors.length > 0) {
    return next(new AppError('Validation failed.', 400, errors));
  }

  next();
};

module.exports = { validateAddChildren, validateUpdateChild };
