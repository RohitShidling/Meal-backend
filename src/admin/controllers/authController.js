const jwt = require('jsonwebtoken');
const db = require('../../common/database');
const { sendOTP, verifyOTP } = require('../../common/services/otpService');

// Helper to generate Admin JWT
const generateToken = (id, phoneNumber) => {
  return jwt.sign({ id, phoneNumber, role: 'admin' }, process.env.ADMIN_JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
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

    // Generate JWT token
    const token = generateToken(adminUser.id, adminUser.phone_number);

    return res.status(200).json({
      success: true,
      message: 'Admin authentication successful.',
      data: {
        token,
        user: { id: adminUser.id, phoneNumber: adminUser.phone_number }
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

module.exports = { loginController, verifyOtpController };
