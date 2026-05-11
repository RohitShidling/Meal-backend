require('dotenv').config();
const axios = require('axios');
const db = require('../database');

const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY;
const OTP_MAX_ATTEMPTS = Number.parseInt(process.env.OTP_MAX_ATTEMPTS || '5', 10);
const OTP_EXPIRY_MS = Number.parseInt(process.env.OTP_EXPIRY_SECONDS || '120', 10) * 1000;
const OTP_COOLDOWN_MS = Number.parseInt(process.env.OTP_COOLDOWN_SECONDS || '30', 10) * 1000;
const OTP_DAILY_LIMIT = Number.parseInt(process.env.OTP_DAILY_LIMIT || '20', 10);
const OTP_BLOCK_MS = Number.parseInt(process.env.OTP_BLOCK_MINUTES || '15', 10) * 60 * 1000;
const FIREBASE_RECAPTCHA_TOKEN = process.env.FIREBASE_RECAPTCHA_TOKEN;

/**
 * STEP 1 — Send OTP via Firebase REST API
 * Firebase handles OTP generation + SMS delivery.
 */
async function sendOTP(phoneNumber, metadata = {}) {
  const normalizedPhone = normalizePhone(phoneNumber);
  const now = Date.now();
  const dayKey = getDayKey();
  const existing = await getOtpSession(normalizedPhone);

  if (existing && existing.blocked_until && new Date(existing.blocked_until).getTime() > now) {
    const retryAfterSeconds = Math.ceil((new Date(existing.blocked_until).getTime() - now) / 1000);
    const err = new Error(`Too many invalid OTP attempts. Retry after ${retryAfterSeconds} second(s).`);
    err.code = 'OTP_BLOCKED';
    throw err;
  }

  if (existing && existing.last_sent_at && (now - new Date(existing.last_sent_at).getTime()) < OTP_COOLDOWN_MS) {
    const retryAfterSeconds = Math.ceil((OTP_COOLDOWN_MS - (now - new Date(existing.last_sent_at).getTime())) / 1000);
    const err = new Error(`Please wait ${retryAfterSeconds} second(s) before requesting another OTP.`);
    err.code = 'OTP_COOLDOWN';
    throw err;
  }

  const previousDailyCount = existing && existing.day_key === dayKey ? Number(existing.daily_send_count || 0) : 0;
  if (previousDailyCount >= OTP_DAILY_LIMIT) {
    const err = new Error('Daily OTP request limit reached. Please try again tomorrow.');
    err.code = 'OTP_DAILY_LIMIT';
    throw err;
  }

  const url = `https://identitytoolkit.googleapis.com/v1/accounts:sendVerificationCode?key=${FIREBASE_API_KEY}`;
  if (process.env.NODE_ENV === 'production' && !FIREBASE_RECAPTCHA_TOKEN) {
    const err = new Error('FIREBASE_RECAPTCHA_TOKEN is required in production.');
    err.code = 'OTP_RECAPTCHA_REQUIRED';
    throw err;
  }

  const response = await axios.post(url, {
    phoneNumber: normalizedPhone,
    // Production should inject a valid token from anti-bot verification flow.
    recaptchaToken: FIREBASE_RECAPTCHA_TOKEN || (process.env.NODE_ENV === 'production' ? undefined : 'server-side-bypass'),
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
async function verifyOTP(phoneNumber, code, metadata = {}) {
  const normalizedPhone = normalizePhone(phoneNumber);
  const sessionInfo = await getOtpSession(normalizedPhone);

  if (!sessionInfo) {
    const err = new Error("NO_SESSION");
    err.code = "NO_SESSION";
    throw err;
  }
  const now = Date.now();
  if (sessionInfo.blocked_until && new Date(sessionInfo.blocked_until).getTime() > now) {
    const err = new Error('Too many invalid OTP attempts. Please try again later.');
    err.code = 'OTP_BLOCKED';
    throw err;
  }
  if (new Date(sessionInfo.expires_at).getTime() <= now) {
    await deleteOtpSession(normalizedPhone);
    const err = new Error('OTP expired. Please request a new one.');
    err.code = 'OTP_EXPIRED';
    throw err;
  }
  if (sessionInfo.request_ip_hash && hashMetadata(metadata.ip) && sessionInfo.request_ip_hash !== hashMetadata(metadata.ip)) {
    const err = new Error('OTP verification source mismatch. Please request a fresh OTP.');
    err.code = 'OTP_SOURCE_MISMATCH';
    throw err;
  }

  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPhoneNumber?key=${FIREBASE_API_KEY}`;
  try {
    const response = await axios.post(url, {
      sessionInfo: sessionInfo.session_info,
      code,
    });

    const data = response.data;
    // Clean up session after successful verification
    await deleteOtpSession(normalizedPhone);
    return data;
  } catch (error) {
    const failedAttempts = Number(sessionInfo.failed_attempts || 0) + 1;
    const shouldBlock = failedAttempts >= OTP_MAX_ATTEMPTS;
    await upsertOtpSession({
      ...sessionInfo,
      failed_attempts: failedAttempts,
      blocked_until: shouldBlock ? new Date(now + OTP_BLOCK_MS) : sessionInfo.blocked_until
    });
    if (shouldBlock) {
      const blockedError = new Error('Too many invalid OTP attempts. Please try again later.');
      blockedError.code = 'OTP_BLOCKED';
      throw blockedError;
    }
    throw error;
  }
}

module.exports = { sendOTP, verifyOTP };
