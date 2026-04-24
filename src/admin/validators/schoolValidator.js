const AppError = require('../../common/utils/AppError');

/**
 * Validator for School Creation
 */
const validateAddSchool = (req, res, next) => {
  const { name, address, city, state, pincode } = req.body;

  const errors = [];

  if (!name || name.trim().length < 3) {
    errors.push('School name is required and must be at least 3 characters long.');
  }
  if (!address || address.trim().length < 5) {
    errors.push('Address is required and must be at least 5 characters long.');
  }
  if (!city || city.trim().length < 2) {
    errors.push('City is required.');
  }
  if (!state || state.trim().length < 2) {
    errors.push('State is required.');
  }
  if (!pincode || !/^\d{5,10}$/.test(pincode)) {
    errors.push('A valid pincode (5-10 digits) is required.');
  }

  if (errors.length > 0) {
    return next(new AppError(errors.join(' '), 400));
  }

  next();
};

/**
 * Validator for School Update
 */
const validateEditSchool = (req, res, next) => {
  const { name, pincode } = req.body;
  const errors = [];

  if (name !== undefined && name.trim().length < 3) {
    errors.push('School name must be at least 3 characters long.');
  }
  if (pincode !== undefined && !/^\d{5,10}$/.test(pincode)) {
    errors.push('A valid pincode (5-10 digits) is required.');
  }

  if (errors.length > 0) {
    return next(new AppError(errors.join(' '), 400));
  }

  next();
};

module.exports = { validateAddSchool, validateEditSchool };
