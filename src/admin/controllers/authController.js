const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const db = require('../../common/database');
const { sendOTP, verifyOTP } = require('../../common/services/otpService');
const catchAsync = require('../../common/utils/catchAsync');
const AppError = require('../../common/utils/AppError');

const requireEnv = (key) => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`${key} environment variable is required`);
  }
  return value;
};

const ADMIN_JWT_SECRET = requireEnv('ADMIN_JWT_SECRET');
const ADMIN_REFRESH_SECRET = requireEnv('ADMIN_REFRESH_SECRET');
const buildOtpMetadata = (req) => ({
  ip: req.ip,
  userAgent: req.get('user-agent')
});
const OTP_CHALLENGE_TTL_MS = Number.parseInt(process.env.ADMIN_OTP_CHALLENGE_TTL_SECONDS || '300', 10) * 1000;
const pendingAdminChallenges = new Map();

const issueAdminChallenge = ({ adminId, phoneNumber, username }) => {
  const challengeToken = jwt.sign(
    {
      typ: 'admin_otp_challenge',
      adminId,
      phoneNumber,
      username,
      nonce: `${Date.now()}_${Math.random().toString(36).slice(2)}`
    },
    ADMIN_JWT_SECRET,
    { expiresIn: `${Math.max(30, Math.floor(OTP_CHALLENGE_TTL_MS / 1000))}s` }
  );
  pendingAdminChallenges.set(challengeToken, {
    adminId,
    phoneNumber,
    username,
    expiresAt: Date.now() + OTP_CHALLENGE_TTL_MS
  });
  setTimeout(() => {
    const existing = pendingAdminChallenges.get(challengeToken);
    if (existing && existing.expiresAt <= Date.now()) {
      pendingAdminChallenges.delete(challengeToken);
    }
  }, OTP_CHALLENGE_TTL_MS + 5000);
  return challengeToken;
};

const consumeAdminChallenge = (challengeToken, phoneNumber) => {
  if (!challengeToken) return null;
  const challenge = pendingAdminChallenges.get(challengeToken);
  if (!challenge) return null;
  if (challenge.expiresAt <= Date.now()) {
    pendingAdminChallenges.delete(challengeToken);
    return null;
  }
  if (String(challenge.phoneNumber) !== String(phoneNumber)) {
    return null;
  }
  pendingAdminChallenges.delete(challengeToken);
  return challenge;
};

// Helper to generate Admin Tokens
const generateTokens = (id, phoneNumber) => {
  const accessToken = jwt.sign({ id, phoneNumber, role: 'admin' }, ADMIN_JWT_SECRET, {
    expiresIn: process.env.ADMIN_JWT_EXPIRES_IN || '15m',
  });
  const refreshToken = jwt.sign({ id, phoneNumber, role: 'admin' }, ADMIN_REFRESH_SECRET, {
    expiresIn: process.env.ADMIN_REFRESH_TOKEN_EXPIRES_IN || '30d',
  });
  return { accessToken, refreshToken };
};

/**
 * POST /api/admin/auth/login
 * Body: { phoneNumber, password }
 */
const loginController = catchAsync(async (req, res, next) => {
  const { phoneNumber, password, username } = req.body;

  if (!phoneNumber || !password || !username) {
    return next(new AppError('phoneNumber, password and username are required.', 400));
  }

  // Check if admin exists in DB
  // Check if admin exists in DB with matching phone AND username (Case-Sensitive)
  const result = await db.query('SELECT * FROM admins WHERE phone_number = $1 AND username = $2', [phoneNumber, username]);

  if (result.rows.length === 0) {
    return next(new AppError('Invalid credentials.', 401));
  }

  const adminUser = result.rows[0];

  // Compare provided password with stored hash
  const isMatch = await bcrypt.compare(password, adminUser.password);
  
  if (!isMatch) {
    return next(new AppError('Invalid credentials.', 401));
  }



  // Credentials are correct, send OTP via Firebase
  try {
    await sendOTP(phoneNumber, buildOtpMetadata(req));
  } catch (error) {
    const firebaseMsg = error.response?.data?.error?.message || error.message;
    return next(new AppError(`Failed to send OTP: ${firebaseMsg}`, 400));
  }

  return res.status(200).json({
    success: true,
    message: `Credentials verified. OTP sent to ${phoneNumber}.`,
    challengeToken: issueAdminChallenge({
      adminId: adminUser.id,
      phoneNumber: adminUser.phone_number,
      username: adminUser.username
    })
  });
});

/**
 * POST /api/admin/auth/verify-otp
 * Body: { phoneNumber, code }
 */
const verifyOtpController = catchAsync(async (req, res, next) => {
  const { phoneNumber, code, challengeToken } = req.body;

  if (!phoneNumber || !code || !challengeToken) {
    return next(new AppError('phoneNumber, code and challengeToken are required.', 400));
  }

  const challenge = consumeAdminChallenge(challengeToken, phoneNumber);
  if (!challenge) {
    return next(new AppError('Invalid or expired login challenge. Please login again.', 401));
  }

  // Verify OTP via Firebase
  try {
    await verifyOTP(phoneNumber, code, buildOtpMetadata(req));
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
        username: updatedUser.username || null,
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
    decoded = jwt.verify(refreshToken, ADMIN_REFRESH_SECRET);
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
