const AppError = require('../../common/utils/AppError');

const PHONE_REGEX = /^\+?[1-9]\d{7,14}$/;
const OTP_REGEX = /^\d{4,8}$/;

const validateAdminLogin = (req, res, next) => {
  const { phoneNumber, password, username } = req.body || {};
  const errors = [];
  
  // Normalize phone for regex check
  const cleanPhone = (phoneNumber || '').toString().replace(/\s+/g, '').replace(/-/g, '');

  if (!cleanPhone || !PHONE_REGEX.test(cleanPhone)) {
    errors.push('phoneNumber must be a valid mobile number.');
  }
  if (!username || typeof username !== 'string' || username.trim().length < 2) {
    errors.push('username is required (min 2 chars).');
  }
  if (!password || typeof password !== 'string' || password.length < 6) {
    errors.push('password is required (min 6 chars).');
  }
  if (errors.length > 0) {
    console.error('Admin Login Validation Failed:', errors);
    return next(new AppError('Validation failed.', 400, errors));
  }
  return next();
};

const validateAdminVerifyOtp = (req, res, next) => {
  const { phoneNumber, code, challengeToken } = req.body || {};
  const errors = [];
  if (!phoneNumber || typeof phoneNumber !== 'string' || !PHONE_REGEX.test(phoneNumber.trim())) {
    errors.push('phoneNumber must be a valid mobile number.');
  }
  if (!code || typeof code !== 'string' || !OTP_REGEX.test(code.trim())) {
    errors.push('code must be a valid numeric OTP.');
  }
  if (!challengeToken || typeof challengeToken !== 'string' || challengeToken.trim().length < 20) {
    errors.push('challengeToken is required.');
  }
  if (errors.length > 0) {
    return next(new AppError('Validation failed.', 400, errors));
  }
  return next();
};

const validateAdminRefresh = (req, res, next) => {
  const { refreshToken } = req.body || {};
  if (!refreshToken || typeof refreshToken !== 'string' || refreshToken.trim().length < 20) {
    return next(new AppError('Validation failed.', 400, ['refreshToken is required.']));
  }
  return next();
};

module.exports = {
  validateAdminLogin,
  validateAdminVerifyOtp,
  validateAdminRefresh
};

