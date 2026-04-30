const AppError = require('../../common/utils/AppError');

const validateSendOtp = (req, res, next) => {
  const { phoneNumber, action, username } = req.body;

  if (!phoneNumber || typeof phoneNumber !== 'string' || !phoneNumber.trim()) {
    return next(new AppError('Validation failed.', 400, ['phoneNumber is required.']));
  }

  if (action !== undefined && (typeof action !== 'string' || !action.trim())) {
    return next(new AppError('Validation failed.', 400, ['action must be a non-empty string when provided.']));
  }

  if (String(action || '').toLowerCase() === 'login') {
    if (!username || typeof username !== 'string' || username.trim().length < 2) {
      return next(new AppError('Validation failed.', 400, ['username is required for login and must be at least 2 characters.']));
    }
    if (username.trim().length > 120) {
      return next(new AppError('Validation failed.', 400, ['username must be at most 120 characters.']));
    }
  }

  next();
};

const validateLoginSendOtp = (req, res, next) => {
  const { phoneNumber, username } = req.body;

  if (!phoneNumber || typeof phoneNumber !== 'string' || !phoneNumber.trim()) {
    return next(new AppError('Validation failed.', 400, ['phoneNumber is required.']));
  }

  if (!username || typeof username !== 'string' || !username.trim()) {
    return next(new AppError('Validation failed.', 400, ['username is required.']));
  }

  if (username.trim().length > 120) {
    return next(new AppError('Validation failed.', 400, ['username must be at most 120 characters.']));
  }

  next();
};

module.exports = {
  validateSendOtp,
  validateLoginSendOtp
};
