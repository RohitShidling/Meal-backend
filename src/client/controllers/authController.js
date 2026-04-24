const jwt = require('jsonwebtoken');
const db = require('../../common/database');
const { sendOTP, verifyOTP } = require('../../common/services/otpService');

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
 * Body: { phoneNumber, action: 'login' | 'register' }
 */
async function sendOtpController(req, res) {
  try {
    const { phoneNumber, action } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({ success: false, message: 'phoneNumber is required.' });
    }
    
    // Check if user exists in DB to inform frontend (optional, but helpful for UI flow)
    const clientCheck = await db.query('SELECT * FROM clients WHERE phone_number = $1', [phoneNumber]);
    const isNewUser = clientCheck.rows.length === 0;

    // Send OTP via Firebase
    await sendOTP(phoneNumber);

    return res.status(200).json({
      success: true,
      message: `OTP sent to ${phoneNumber}.`,
    });
  } catch (error) {
    const firebaseMsg = error.response?.data?.error?.message || error.message;
    console.error('Client sendOtp error:', firebaseMsg);
    return res.status(400).json({ success: false, message: 'Failed to send OTP.', error: firebaseMsg });
  }
}

/**
 * POST /api/client/auth/verify-otp
 * Body: { phoneNumber, code, action: 'login' | 'register' }
 */
async function verifyOtpController(req, res) {
  try {
    const { phoneNumber, code, action } = req.body;

    if (!phoneNumber || !code) {
      return res.status(400).json({ success: false, message: 'phoneNumber and code are required.' });
    }

    // Verify OTP via Firebase
    await verifyOTP(phoneNumber, code);

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
          phoneNumber: updatedUser.phone_number,
          isLoggedIn: updatedUser.is_logged_in,
          lastLogin: updatedUser.last_login
        }
      }
    });

  } catch (error) {
    if (error.code === 'NO_SESSION') {
      return res.status(400).json({ success: false, message: 'No OTP session found. Please request OTP first.' });
    }
    const firebaseMsg = error.response?.data?.error?.message || error.message;
    console.error('Client verifyOtp error:', firebaseMsg);
    return res.status(400).json({ success: false, message: 'Invalid OTP or expired.', error: firebaseMsg });
  }
}



/**
 * POST /api/client/auth/logout
 * Requires Authentication Middleware
 */
async function logoutController(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized. User ID not found.' });
    }

    await db.query(
      `UPDATE clients SET is_logged_in = false, refresh_token = NULL WHERE id = $1`,
      [userId]
    );

    return res.status(200).json({
      success: true,
      message: 'Logged out successfully.',
    });
  } catch (error) {
    console.error('Client logout error:', error.message);
    return res.status(500).json({ success: false, message: 'Internal server error during logout.' });
  }
}



/**
 * POST /api/client/auth/refresh
 * Body: { refreshToken }
 */
async function refreshTokenController(req, res) {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ success: false, message: 'Refresh token is required.' });
    }

    // Verify token
    const decoded = jwt.verify(refreshToken, process.env.CLIENT_REFRESH_SECRET || 'client_refresh_secret');
    
    // Check in DB
    const result = await db.query('SELECT * FROM clients WHERE id = $1 AND refresh_token = $2', [decoded.id, refreshToken]);
    if (result.rows.length === 0) {
      return res.status(403).json({ success: false, message: 'Invalid refresh token.' });
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
  } catch (error) {
    return res.status(403).json({ success: false, message: 'Invalid or expired refresh token.' });
  }
}

module.exports = { sendOtpController, verifyOtpController, logoutController, refreshTokenController };
