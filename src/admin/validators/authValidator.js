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
  if (username !== undefined && username !== null) {
    if (typeof username !== 'string' || username.trim().length < 2 || username.trim().length > 120) {
      errors.push('username must be 2-120 characters when provided.');
    }
  }
  if (!password || typeof password !== 'string' || password.length < 6 || password.length > 128) {
    errors.push('password is required and must be 6-128 characters.');
  }
  if (errors.length > 0) {
    console.error('Admin Login Validation Failed:', errors);
    return next(new AppError('Validation failed.', 400, errors));
  }
  return next();
};

const validateAdminVerifyOtp = (req, res, next) => {
  const { phoneNumber, code, challengeToken } = req.body || {};
  const phoneStr = String(phoneNumber ?? '').trim();
  const codeStr = String(code ?? '').trim();
  const challengeStr = String(challengeToken ?? '').trim();
  const errors = [];
  if (!phoneStr || !PHONE_REGEX.test(phoneStr)) {
    errors.push('phoneNumber must be a valid mobile number.');
  }
  if (!codeStr || !OTP_REGEX.test(codeStr)) {
    errors.push('code must be a valid numeric OTP.');
  }
  if (!challengeStr || challengeStr.length < 20) {
    errors.push('challengeToken is required.');
  }
  if (errors.length > 0) {
    return next(new AppError('Validation failed.', 400, errors));
  }
  return next();
};

const validateAdminRefresh = (req, res, next) => {
  const fromBody = req.body?.refreshToken;
  const fromCookie = req.cookies?.admin_refresh_token;
  const refreshToken =
    typeof fromBody === 'string' && fromBody.trim().length >= 20
      ? fromBody.trim()
      : typeof fromCookie === 'string' && fromCookie.trim().length >= 20
        ? fromCookie.trim()
        : '';
  if (!refreshToken) {
    return next(new AppError('Validation failed.', 400, ['refreshToken is required (JSON body or HttpOnly cookie).']));
  }
  req.adminRefreshToken = refreshToken;
  return next();
};

module.exports = {
  validateAdminLogin,
  validateAdminVerifyOtp,
  validateAdminRefresh
};

