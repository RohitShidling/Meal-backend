const jwt = require('jsonwebtoken');
const db = require('../../common/database');
const { sendOTP, verifyOTP } = require('../../common/services/otpService');

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
async function loginController(req, res) {
  try {
    const { phoneNumber, password } = req.body;

    if (!phoneNumber || !password) {
      return res.status(400).json({ success: false, message: 'phoneNumber and password are required.' });
    }

    // Check if admin exists in DB with correct credentials
    const result = await db.query('SELECT * FROM admins WHERE phone_number = $1 AND password = $2', [phoneNumber, password]);

    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid phone number or password.' });
    }

    // Credentials are correct, send OTP via Firebase
    await sendOTP(phoneNumber);

    return res.status(200).json({
      success: true,
      message: `Credentials verified. OTP sent to ${phoneNumber}.`,
    });
  } catch (error) {
    const firebaseMsg = error.response?.data?.error?.message || error.message;
    console.error('Admin login error:', firebaseMsg);
    return res.status(400).json({ success: false, message: 'Failed to send OTP.', error: firebaseMsg });
  }
}

/**
 * POST /api/admin/auth/verify-otp
 * Body: { phoneNumber, code }
 */
async function verifyOtpController(req, res) {
  try {
    const { phoneNumber, code } = req.body;

    if (!phoneNumber || !code) {
      return res.status(400).json({ success: false, message: 'phoneNumber and code are required.' });
    }

    // Verify OTP via Firebase
    await verifyOTP(phoneNumber, code);

    // Fetch admin details
    const result = await db.query('SELECT * FROM admins WHERE phone_number = $1', [phoneNumber]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Admin not found.' });
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

  } catch (error) {
    if (error.code === 'NO_SESSION') {
      return res.status(400).json({ success: false, message: 'No OTP session found. Please login first.' });
    }
    const firebaseMsg = error.response?.data?.error?.message || error.message;
    console.error('Admin verifyOtp error:', firebaseMsg);
    return res.status(400).json({ success: false, message: 'Invalid OTP or expired.', error: firebaseMsg });
  }
}



/**
 * POST /api/admin/auth/logout
 * Requires Authentication Middleware
 */
async function logoutController(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized. User ID not found.' });
    }

    await db.query(
      `UPDATE admins SET is_logged_in = false, refresh_token = NULL WHERE id = $1`,
      [userId]
    );

    return res.status(200).json({
      success: true,
      message: 'Logged out successfully.',
    });
  } catch (error) {
    console.error('Admin logout error:', error.message);
    return res.status(500).json({ success: false, message: 'Internal server error during logout.' });
  }
}


/**
 * POST /api/admin/auth/refresh
 * Body: { refreshToken }
 */
async function refreshTokenController(req, res) {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ success: false, message: 'Refresh token is required.' });
    }

    // Verify token
    const decoded = jwt.verify(refreshToken, process.env.ADMIN_REFRESH_SECRET || 'admin_refresh_secret');

    // Check in DB
    const result = await db.query('SELECT * FROM admins WHERE id = $1 AND refresh_token = $2', [decoded.id, refreshToken]);
    if (result.rows.length === 0) {
      return res.status(403).json({ success: false, message: 'Invalid refresh token.' });
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
  } catch (error) {
    return res.status(403).json({ success: false, message: 'Invalid or expired refresh token.' });
  }
}

module.exports = { loginController, verifyOtpController, logoutController, refreshTokenController };
