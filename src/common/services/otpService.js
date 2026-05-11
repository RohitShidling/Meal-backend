require('dotenv').config();
const axios = require('axios');

const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY;

/**
 * In-memory session store: { phoneNumber → sessionInfo }
 * sessionInfo is returned by Firebase after sendVerificationCode.
 * The client does NOT need to store it — backend handles it.
 */
const sessionStore = new Map();

/**
 * STEP 1 — Send OTP via Firebase REST API
 * Firebase handles OTP generation + SMS delivery.
 * For Firebase test phone numbers (added in Console), Firebase
 * skips reCAPTCHA validation and skips SMS — uses preset code.
 */
async function sendOTP(phoneNumber) {
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:sendVerificationCode?key=${FIREBASE_API_KEY}`;

  const response = await axios.post(url, {
    phoneNumber,
    // Firebase test phone numbers bypass reCAPTCHA validation server-side.
    // For real phone numbers in production, replace with a real reCAPTCHA token.
    recaptchaToken: "server-side-bypass",
  });

  // Firebase returns: { sessionInfo: "..." }
  const { sessionInfo } = response.data;

  // Store sessionInfo keyed by phoneNumber so client only needs phoneNumber
  sessionStore.set(phoneNumber, sessionInfo);

  // Auto-remove after 10 min to avoid stale sessions
  setTimeout(() => sessionStore.delete(phoneNumber), 10 * 60 * 1000);

  return { phoneNumber };
}

/**
 * STEP 2 — Verify OTP via Firebase REST API
 * Uses the stored sessionInfo + user-entered code.
 */
async function verifyOTP(phoneNumber, code) {
  const sessionInfo = sessionStore.get(phoneNumber);

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

  // Clean up session after successful verification
  sessionStore.delete(phoneNumber);

  return data;
}

module.exports = { sendOTP, verifyOTP };