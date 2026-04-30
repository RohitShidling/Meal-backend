const AppError = require('../../common/utils/AppError');

const validateLoginSendOtp = (req, res, next) => {
  const { phoneNumber, username } = req.body;

  if (!phoneNumber || typeof phoneNumber !== 'string' || !phoneNumber.trim()) {
    return next(new AppError('phoneNumber is required.', 400));
  }

  if (!username || typeof username !== 'string' || !username.trim()) {
    return next(new AppError('username is required.', 400));
  }

  if (username.trim().length > 120) {
    return next(new AppError('username must be at most 120 characters.', 400));
  }

  next();
};

module.exports = {
  validateLoginSendOtp
};
