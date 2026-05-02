const jwt = require('jsonwebtoken');
const db = require('../../common/database');
const { sendOTP, verifyOTP } = require('../../common/services/otpService');
const catchAsync = require('../../common/utils/catchAsync');
const AppError = require('../../common/utils/AppError');

// Helper to generate Client Tokens
const generateTokens = (id, phoneNumber) => {
  const accessToken = jwt.sign({ id, phoneNumber, role: 'client' }, process.env.CLIENT_JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '1h',
  });
  const refreshToken = jwt.sign({ id, phoneNumber, role: 'client' }, process.env.CLIENT_REFRESH_SECRET || 'client_refresh_secret', {
    expiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '7d',
  });
  return { accessToken, refreshToken };
};

/**
 * POST /api/client/auth/register/send-otp
 * Body: { phoneNumber, username }
 */
const registerSendOtp = catchAsync(async (req, res, next) => {
  const { phoneNumber, username } = req.body;

  if (!phoneNumber || !username) {
    return next(new AppError('phoneNumber and username are required for registration.', 400));
  }

  // 1. Check if already registered
  const userCheck = await db.query('SELECT id FROM clients WHERE phone_number = $1', [phoneNumber]);
  if (userCheck.rows.length > 0) {
    return next(new AppError('This mobile number is already registered. Please login instead.', 400));
  }

  // 2. Send OTP via Firebase
  try {
    await sendOTP(phoneNumber);
  } catch (error) {
    const firebaseMsg = error.response?.data?.error?.message || error.message;
    return next(new AppError(`Failed to send OTP: ${firebaseMsg}`, 400));
  }

  return res.status(200).json({
    success: true,
    message: `Registration OTP sent to ${phoneNumber}.`,
    data: { phoneNumber, username }
  });
});

/**
 * POST /api/client/auth/register/verify-otp
 * Body: { phoneNumber, username, code }
 */
const registerVerifyOtp = catchAsync(async (req, res, next) => {
  const { phoneNumber, username, code } = req.body;

  if (!phoneNumber || !username || !code) {
    return next(new AppError('phoneNumber, username and code are required.', 400));
  }

  // 1. Verify OTP via Firebase
  try {
    await verifyOTP(phoneNumber, code);
  } catch (error) {
    if (error.code === 'NO_SESSION') {
      return next(new AppError('No OTP session found. Please request OTP first.', 400));
    }
    const firebaseMsg = error.response?.data?.error?.message || error.message;
    return next(new AppError(`Invalid OTP or expired: ${firebaseMsg}`, 400));
  }

  // 2. Re-check if registered (race condition check)
  const userCheck = await db.query('SELECT id FROM clients WHERE phone_number = $1', [phoneNumber]);
  if (userCheck.rows.length > 0) {
    return next(new AppError('This mobile number was recently registered. Please login.', 400));
  }

  // 3. Create User
  const insertResult = await db.query(
    'INSERT INTO clients (phone_number, username, is_logged_in, last_login) VALUES ($1, $2, true, NOW()) RETURNING *',
    [phoneNumber, username.trim()]
  );
  const clientUser = insertResult.rows[0];

  // 4. Generate Tokens
  const { accessToken, refreshToken } = generateTokens(clientUser.id, clientUser.phone_number);

  // Store refresh token
  await db.query('UPDATE clients SET refresh_token = $1 WHERE id = $2', [refreshToken, clientUser.id]);

  return res.status(201).json({
    success: true,
    message: 'Registration and login successful.',
    data: {
      accessToken,
      refreshToken,
      user: {
        id: clientUser.id,
        username: clientUser.username,
        phoneNumber: clientUser.phone_number,
        isLoggedIn: true,
        lastLogin: clientUser.last_login
      }
    }
  });
});

/**
 * POST /api/client/auth/login/send-otp
 * Body: { phoneNumber }
 */
const loginSendOtp = catchAsync(async (req, res, next) => {
  const { phoneNumber } = req.body;

  if (!phoneNumber) {
    return next(new AppError('phoneNumber is required.', 400));
  }

  // 1. Check if registered
  const userResult = await db.query('SELECT id, username FROM clients WHERE phone_number = $1', [phoneNumber]);
  if (userResult.rows.length === 0) {
    return next(new AppError('This mobile number is not registered. Please register first.', 404));
  }

  // 2. Send OTP via Firebase
  try {
    await sendOTP(phoneNumber);
  } catch (error) {
    const firebaseMsg = error.response?.data?.error?.message || error.message;
    return next(new AppError(`Failed to send OTP: ${firebaseMsg}`, 400));
  }

  return res.status(200).json({
    success: true,
    message: `Login OTP sent to ${phoneNumber}.`,
    data: { phoneNumber }
  });
});

/**
 * POST /api/client/auth/login/verify-otp
 * Body: { phoneNumber, code }
 */
const loginVerifyOtp = catchAsync(async (req, res, next) => {
  const { phoneNumber, code } = req.body;

  if (!phoneNumber || !code) {
    return next(new AppError('phoneNumber and code are required.', 400));
  }

  // 1. Verify OTP via Firebase
  try {
    await verifyOTP(phoneNumber, code);
  } catch (error) {
    if (error.code === 'NO_SESSION') {
      return next(new AppError('No OTP session found. Please request OTP first.', 400));
    }
    const firebaseMsg = error.response?.data?.error?.message || error.message;
    return next(new AppError(`Invalid OTP or expired: ${firebaseMsg}`, 400));
  }

  // 2. Fetch User
  const result = await db.query('SELECT * FROM clients WHERE phone_number = $1', [phoneNumber]);
  if (result.rows.length === 0) {
    return next(new AppError('User not found. This should not happen after OTP verification.', 404));
  }
  const clientUser = result.rows[0];

  // 3. Generate JWT tokens
  const { accessToken, refreshToken } = generateTokens(clientUser.id, clientUser.phone_number);

  // 4. Update login status and store refresh token
  const updateResult = await db.query(
    `UPDATE clients SET is_logged_in = true, last_login = NOW(), refresh_token = $1 WHERE id = $2 RETURNING *`,
    [refreshToken, clientUser.id]
  );
  const updatedUser = updateResult.rows[0];

  return res.status(200).json({
    success: true,
    message: 'Login successful.',
    data: {
      accessToken,
      refreshToken,
      user: {
        id: updatedUser.id,
        username: updatedUser.username,
        phoneNumber: updatedUser.phone_number,
        isLoggedIn: true,
        lastLogin: updatedUser.last_login
      }
    }
  });
});

/**
 * POST /api/client/auth/logout
 */
const logoutController = catchAsync(async (req, res, next) => {
  const userId = req.user?.id;
  if (!userId) {
    return next(new AppError('Unauthorized. User ID not found.', 401));
  }

  await db.query(
    `UPDATE clients SET is_logged_in = false, refresh_token = NULL WHERE id = $1`,
    [userId]
  );

  return res.status(200).json({
    success: true,
    message: 'Logged out successfully.',
  });
});

/**
 * POST /api/client/auth/refresh
 */
const refreshTokenController = catchAsync(async (req, res, next) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return next(new AppError('Refresh token is required.', 400));
  }

  let decoded;
  try {
    decoded = jwt.verify(refreshToken, process.env.CLIENT_REFRESH_SECRET || 'client_refresh_secret');
  } catch (err) {
    return next(new AppError('Invalid or expired refresh token.', 403));
  }
  
  const result = await db.query('SELECT * FROM clients WHERE id = $1 AND refresh_token = $2', [decoded.id, refreshToken]);
  if (result.rows.length === 0) {
    return next(new AppError('Invalid refresh token.', 403));
  }

  const clientUser = result.rows[0];
  const newTokens = generateTokens(clientUser.id, clientUser.phone_number);

  await db.query('UPDATE clients SET refresh_token = $1 WHERE id = $2', [newTokens.refreshToken, clientUser.id]);

  return res.status(200).json({
    success: true,
    message: 'Tokens refreshed successfully.',
    data: {
      accessToken: newTokens.accessToken,
      refreshToken: newTokens.refreshToken
    }
  });
});

/**
 * GET /api/client/auth/me
 */
const getMe = catchAsync(async (req, res, next) => {
  const clientId = req.user.id;

  const clientResult = await db.query(
    'SELECT id, username, phone_number, last_login FROM clients WHERE id = $1',
    [clientId]
  );
  if (clientResult.rows.length === 0) {
    return next(new AppError('User not found.', 404));
  }

  const parentResult = await db.query('SELECT * FROM parent_profiles WHERE client_id = $1', [clientId]);
  const childrenResult = await db.query('SELECT COUNT(*) FROM children WHERE parent_id = $1', [clientId]);
  const professionalResult = await db.query('SELECT * FROM professional_profiles WHERE client_id = $1', [clientId]);
  const teacherResult = await db.query('SELECT * FROM teacher_profiles WHERE client_id = $1', [clientId]);

  return res.status(200).json({
    success: true,
    data: {
      user: clientResult.rows[0],
      profiles: {
        isParent: parentResult.rows.length > 0,
        parentProfile: parentResult.rows[0] || null,
        childrenCount: parseInt(childrenResult.rows[0].count, 10),
        isProfessional: professionalResult.rows.length > 0,
        professionalProfile: professionalResult.rows[0] || null,
        isTeacher: teacherResult.rows.length > 0,
        teacherProfile: teacherResult.rows[0] || null
      }
    }
  });
});

module.exports = {
  registerSendOtp,
  registerVerifyOtp,
  loginSendOtp,
  loginVerifyOtp,
  logoutController,
  refreshTokenController,
  getMe
};

