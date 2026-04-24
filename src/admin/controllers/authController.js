const jwt = require('jsonwebtoken');
const db = require('../../common/database');
const { sendOTP, verifyOTP } = require('../../common/services/otpService');
const catchAsync = require('../../common/utils/catchAsync');
const AppError = require('../../common/utils/AppError');

// Helper to generate Admin Tokens
const generateTokens = (id, phoneNumber) => {
  const accessToken = jwt.sign({ id, phoneNumber, role: 'admin' }, process.env.ADMIN_JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '1h',
  });
  const refreshToken = jwt.sign({ id, phoneNumber, role: 'admin' }, process.env.ADMIN_REFRESH_SECRET || 'admin_refresh_secret', {
    expiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '7d',
  });
  return { accessToken, refreshToken };
};

/**
 * POST /api/admin/auth/login
 * Body: { phoneNumber, password }
 */
const loginController = catchAsync(async (req, res, next) => {
  const { phoneNumber, password } = req.body;

  if (!phoneNumber || !password) {
    return next(new AppError('phoneNumber and password are required.', 400));
  }

  // Check if admin exists in DB with correct credentials
  const result = await db.query('SELECT * FROM admins WHERE phone_number = $1 AND password = $2', [phoneNumber, password]);

  if (result.rows.length === 0) {
    return next(new AppError('Invalid phone number or password.', 401));
  }

  // Credentials are correct, send OTP via Firebase
  try {
    await sendOTP(phoneNumber);
  } catch (error) {
    const firebaseMsg = error.response?.data?.error?.message || error.message;
    return next(new AppError(`Failed to send OTP: ${firebaseMsg}`, 400));
  }

  return res.status(200).json({
    success: true,
    message: `Credentials verified. OTP sent to ${phoneNumber}.`,
  });
});

/**
 * POST /api/admin/auth/verify-otp
 * Body: { phoneNumber, code }
 */
const verifyOtpController = catchAsync(async (req, res, next) => {
  const { phoneNumber, code } = req.body;

  if (!phoneNumber || !code) {
    return next(new AppError('phoneNumber and code are required.', 400));
  }

  // Verify OTP via Firebase
  try {
    await verifyOTP(phoneNumber, code);
  } catch (error) {
    if (error.code === 'NO_SESSION') {
      return next(new AppError('No OTP session found. Please login first.', 400));
    }
    const firebaseMsg = error.response?.data?.error?.message || error.message;
    return next(new AppError(`Invalid OTP or expired: ${firebaseMsg}`, 400));
  }

  // Fetch admin details
  const result = await db.query('SELECT * FROM admins WHERE phone_number = $1', [phoneNumber]);
  if (result.rows.length === 0) {
    return next(new AppError('Admin not found.', 404));
  }

  const adminUser = result.rows[0];

  // Generate JWT tokens
  const { accessToken, refreshToken } = generateTokens(adminUser.id, adminUser.phone_number);

  // Update login status and store refresh token
  const updateResult = await db.query(
    `UPDATE admins SET is_logged_in = true, last_login = NOW(), refresh_token = $1 WHERE id = $2 RETURNING *`,
    [refreshToken, adminUser.id]
  );

  const updatedUser = updateResult.rows[0];

  return res.status(200).json({
    success: true,
    message: 'Admin authentication successful.',
    data: {
      accessToken,
      refreshToken,
      user: {
        id: updatedUser.id,
        phoneNumber: updatedUser.phone_number,
        isLoggedIn: updatedUser.is_logged_in,
        lastLogin: updatedUser.last_login
      }
    }
  });
});



/**
 * POST /api/admin/auth/logout
 * Requires Authentication Middleware
 */
const logoutController = catchAsync(async (req, res, next) => {
  const userId = req.user?.id;
  if (!userId) {
    return next(new AppError('Unauthorized. User ID not found.', 401));
  }

  await db.query(
    `UPDATE admins SET is_logged_in = false, refresh_token = NULL WHERE id = $1`,
    [userId]
  );

  return res.status(200).json({
    success: true,
    message: 'Logged out successfully.',
  });
});


/**
 * POST /api/admin/auth/refresh
 * Body: { refreshToken }
 */
const refreshTokenController = catchAsync(async (req, res, next) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return next(new AppError('Refresh token is required.', 400));
  }

  let decoded;
  try {
    decoded = jwt.verify(refreshToken, process.env.ADMIN_REFRESH_SECRET || 'admin_refresh_secret');
  } catch (err) {
    return next(new AppError('Invalid or expired refresh token.', 403));
  }

  // Check in DB
  const result = await db.query('SELECT * FROM admins WHERE id = $1 AND refresh_token = $2', [decoded.id, refreshToken]);
  if (result.rows.length === 0) {
    return next(new AppError('Invalid refresh token.', 403));
  }

  const adminUser = result.rows[0];
  const newTokens = generateTokens(adminUser.id, adminUser.phone_number);

  // Update refresh token in DB
  await db.query('UPDATE admins SET refresh_token = $1 WHERE id = $2', [newTokens.refreshToken, adminUser.id]);

  return res.status(200).json({
    success: true,
    message: 'Tokens refreshed successfully.',
    data: {
      accessToken: newTokens.accessToken,
      refreshToken: newTokens.refreshToken
    }
  });
});

module.exports = { loginController, verifyOtpController, logoutController, refreshTokenController };
