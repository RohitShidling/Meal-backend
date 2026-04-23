const jwt = require('jsonwebtoken');
const db = require('../../common/database');
const { sendOTP, verifyOTP } = require('../../common/services/otpService');

// Helper to generate Client JWT
const generateToken = (id, phoneNumber) => {
  return jwt.sign({ id, phoneNumber, role: 'client' }, process.env.CLIENT_JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
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
    
    // Check if user exists in DB
    const clientCheck = await db.query('SELECT * FROM clients WHERE phone_number = $1', [phoneNumber]);
    const userExists = clientCheck.rows.length > 0;

    if (action === 'login') {
      if (!userExists) {
        return res.status(404).json({ success: false, message: 'User not found. Please register first.' });
      }
    } else if (action === 'register') {
      if (userExists) {
        return res.status(400).json({ success: false, message: 'User already registered. Please login.' });
      }
    } else {
      return res.status(400).json({ success: false, message: 'action must be either "login" or "register".' });
    }

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

    if (!phoneNumber || !code || !action) {
      return res.status(400).json({ success: false, message: 'phoneNumber, code, and action are required.' });
    }

    // Verify OTP via Firebase
    await verifyOTP(phoneNumber, code);

    let clientUser;
    
    if (action === 'register') {
      // Insert new user
      const result = await db.query(
        'INSERT INTO clients (phone_number) VALUES ($1) RETURNING *',
        [phoneNumber]
      );
      clientUser = result.rows[0];
    } else if (action === 'login') {
      // Fetch existing user
      const result = await db.query('SELECT * FROM clients WHERE phone_number = $1', [phoneNumber]);
      if (result.rows.length === 0) {
         return res.status(404).json({ success: false, message: 'User not found.' });
      }
      clientUser = result.rows[0];
    } else {
      return res.status(400).json({ success: false, message: 'Invalid action.' });
    }

    // Generate JWT token
    const token = generateToken(clientUser.id, clientUser.phone_number);

    return res.status(200).json({
      success: true,
      message: 'Authentication successful.',
      data: {
        token,
        user: { id: clientUser.id, phoneNumber: clientUser.phone_number }
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

module.exports = { sendOtpController, verifyOtpController };
