const AppError = require('../../common/utils/AppError');

const validateRegister = (req, res, next) => {
  const { phoneNumber, username } = req.body;

  if (!phoneNumber || typeof phoneNumber !== 'string' || !phoneNumber.trim()) {
    return next(new AppError('Validation failed.', 400, ['phoneNumber is required.']));
  }

  if (!username || typeof username !== 'string' || username.trim().length < 2) {
    return next(new AppError('Validation failed.', 400, ['username is required and must be at least 2 characters.']));
  }

  if (username.trim().length > 120) {
    return next(new AppError('Validation failed.', 400, ['username must be at most 120 characters.']));
  }

  next();
};

const validateLogin = (req, res, next) => {
  const { phoneNumber } = req.body;

  if (!phoneNumber || typeof phoneNumber !== 'string' || !phoneNumber.trim()) {
    return next(new AppError('Validation failed.', 400, ['phoneNumber is required.']));
  }

  next();
};

const validateVerifyOtp = (req, res, next) => {
  const { phoneNumber, code } = req.body;

  if (!phoneNumber || !phoneNumber.trim()) {
    return next(new AppError('Validation failed.', 400, ['phoneNumber is required.']));
  }

  if (!code || !code.trim()) {
    return next(new AppError('Validation failed.', 400, ['code is required.']));
  }

  next();
};

module.exports = {
  validateRegister,
  validateLogin,
  validateVerifyOtp
};

