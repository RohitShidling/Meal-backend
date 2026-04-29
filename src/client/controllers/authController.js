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
 * POST /api/client/auth/send-otp
 * Body: { phoneNumber }
 */
const sendOtpController = catchAsync(async (req, res, next) => {
  const { phoneNumber } = req.body;

  if (!phoneNumber) {
    return next(new AppError('phoneNumber is required.', 400));
  }
  
  // Send OTP via Firebase
  try {
    await sendOTP(phoneNumber);
  } catch (error) {
    const firebaseMsg = error.response?.data?.error?.message || error.message;
    return next(new AppError(`Failed to send OTP: ${firebaseMsg}`, 400));
  }

  return res.status(200).json({
    success: true,
    message: `OTP sent to ${phoneNumber}.`,
  });
});

/**
 * POST /api/client/auth/login/send-otp
 * Body: { phoneNumber, username }
 */
const loginSendOtpController = catchAsync(async (req, res, next) => {
  const { phoneNumber, username } = req.body;
  const trimmedUsername = String(username).trim();

  try {
    await sendOTP(phoneNumber);
  } catch (error) {
    const firebaseMsg = error.response?.data?.error?.message || error.message;
    return next(new AppError(`Failed to send OTP: ${firebaseMsg}`, 400));
  }

  // Keep username in sync at OTP initiation stage.
  await db.query(
    `
      INSERT INTO clients (phone_number, username)
      VALUES ($1, $2)
      ON CONFLICT (phone_number)
      DO UPDATE SET username = EXCLUDED.username
    `,
    [phoneNumber, trimmedUsername]
  );

  return res.status(200).json({
    success: true,
    message: `Login OTP sent to ${phoneNumber}.`,
    data: {
      phoneNumber,
      username: trimmedUsername
    }
  });
});

/**
 * POST /api/client/auth/verify-otp
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
      return next(new AppError('No OTP session found. Please request OTP first.', 400));
    }
    const firebaseMsg = error.response?.data?.error?.message || error.message;
    return next(new AppError(`Invalid OTP or expired: ${firebaseMsg}`, 400));
  }

  let clientUser;
  
  // Check if user already exists
  const result = await db.query('SELECT * FROM clients WHERE phone_number = $1', [phoneNumber]);
  
  if (result.rows.length === 0) {
    // User doesn't exist, this is a registration
    const insertResult = await db.query(
      'INSERT INTO clients (phone_number) VALUES ($1) RETURNING *',
      [phoneNumber]
    );
    clientUser = insertResult.rows[0];
  } else {
    // User exists, this is a login
    clientUser = result.rows[0];
  }

  // Generate JWT tokens
  const { accessToken, refreshToken } = generateTokens(clientUser.id, clientUser.phone_number);

  // Update login status and store refresh token
  const updateResult = await db.query(
    `UPDATE clients SET is_logged_in = true, last_login = NOW(), refresh_token = $1 WHERE id = $2 RETURNING *`,
    [refreshToken, clientUser.id]
  );
  
  const updatedUser = updateResult.rows[0];

  return res.status(200).json({
    success: true,
    message: 'Authentication successful.',
    data: {
      accessToken,
      refreshToken,
      user: { 
        id: updatedUser.id, 
        username: updatedUser.username || null,
        phoneNumber: updatedUser.phone_number,
        isLoggedIn: updatedUser.is_logged_in,
        lastLogin: updatedUser.last_login
      }
    }
  });
});



/**
 * POST /api/client/auth/logout
 * Requires Authentication Middleware
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
 * Body: { refreshToken }
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
  
  // Check in DB
  const result = await db.query('SELECT * FROM clients WHERE id = $1 AND refresh_token = $2', [decoded.id, refreshToken]);
  if (result.rows.length === 0) {
    return next(new AppError('Invalid refresh token.', 403));
  }

  const clientUser = result.rows[0];
  const newTokens = generateTokens(clientUser.id, clientUser.phone_number);

  // Update refresh token in DB
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
 * Get current user profile status (Parent/Professional/Both)
 */
const getMe = catchAsync(async (req, res, next) => {
  const clientId = req.user.id;

  // Fetch client basic info
  const clientResult = await db.query(
    'SELECT id, username, phone_number, last_login FROM clients WHERE id = $1',
    [clientId]
  );
  if (clientResult.rows.length === 0) {
    return next(new AppError('User not found.', 404));
  }

  // Fetch parent profile
  const parentResult = await db.query('SELECT * FROM parent_profiles WHERE client_id = $1', [clientId]);
  
  // Fetch children count
  const childrenResult = await db.query('SELECT COUNT(*) FROM children WHERE parent_id = $1', [clientId]);
  
  // Fetch professional profile
  const professionalResult = await db.query('SELECT * FROM professional_profiles WHERE client_id = $1', [clientId]);

  // Fetch teacher profile
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
  sendOtpController,
  loginSendOtpController,
  verifyOtpController,
  logoutController,
  refreshTokenController,
  getMe
};
