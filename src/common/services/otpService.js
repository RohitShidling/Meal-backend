require('dotenv').config();
const axios = require('axios');
const db = require('../database');

const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY;

/**
 * STEP 1 — Send OTP via Firebase REST API
 * Firebase handles OTP generation + SMS delivery.
 */
async function sendOTP(phoneNumber) {
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:sendVerificationCode?key=${FIREBASE_API_KEY}`;
  let recaptchaToken = process.env.FIREBASE_RECAPTCHA_TOKEN;

  // Development Bypass: If token is missing and we are in development mode, use a placeholder.
  // Note: This may only work with Firebase Test Phone Numbers unless a real token is provided.
  if (!recaptchaToken && process.env.NODE_ENV === 'development') {
    recaptchaToken = 'MOCK_RECAPTCHA_TOKEN';
  }

  if (!recaptchaToken) {
    throw new Error('FIREBASE_RECAPTCHA_TOKEN is not configured');
  }

  const response = await axios.post(url, {
    phoneNumber,
    recaptchaToken,
  });

  // Firebase returns: { sessionInfo: "..." }
  const { sessionInfo } = response.data;

  await db.query(
    `INSERT INTO otp_sessions (phone_number, session_info, expires_at)
     VALUES ($1, $2, NOW() + INTERVAL '10 minutes')
     ON CONFLICT (phone_number)
     DO UPDATE SET
       session_info = EXCLUDED.session_info,
       expires_at = EXCLUDED.expires_at,
       updated_at = NOW()`,
    [phoneNumber, sessionInfo]
  );

  return { phoneNumber };
}

/**
 * STEP 2 — Verify OTP via Firebase REST API
 * Uses the stored sessionInfo + user-entered code.
 */
async function verifyOTP(phoneNumber, code) {
  const sessionRes = await db.query(
    `SELECT session_info
     FROM otp_sessions
     WHERE phone_number = $1
       AND expires_at > NOW()`,
    [phoneNumber]
  );
  const sessionInfo = sessionRes.rows[0]?.session_info;
  if (!sessionInfo) {
    const err = new Error("NO_SESSION");
    err.code = "NO_SESSION";
    throw err;
  }

  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPhoneNumber?key=${FIREBASE_API_KEY}`;

  const response = await axios.post(url, {
    sessionInfo,
    code,
  });

  const data = response.data;

  await db.query('DELETE FROM otp_sessions WHERE phone_number = $1', [phoneNumber]);

  return data;
}

module.exports = { sendOTP, verifyOTP };
