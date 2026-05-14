require('dotenv').config();
const axios = require('axios');

const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY;
const OTP_SESSION_TTL_SEC = Number.parseInt(process.env.OTP_SESSION_TTL_SECONDS || '600', 10);
const OTP_REDIS_PREFIX = 'otp_sess:';

/**
 * Optional Redis backing for OTP Firebase sessionInfo (multi-instance safe).
 * Falls back to in-memory Map when REDIS_URL is unset or Redis is unavailable.
 */
let redisClient = null;
const initRedis = () => {
  if (!process.env.REDIS_URL) return;
  try {
    const Redis = require('ioredis');
    redisClient = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 2 });
    redisClient.on('error', (e) => console.error('[otp redis]', e.message));
  } catch (e) {
    console.warn('[otp] REDIS_URL is set but Redis client failed to initialize:', e.message);
  }
};
initRedis();

const sessionStore = new Map();

async function sessionSet(phoneNumber, sessionInfo) {
  if (redisClient) {
    await redisClient.setex(`${OTP_REDIS_PREFIX}${phoneNumber}`, OTP_SESSION_TTL_SEC, sessionInfo);
    return;
  }
  sessionStore.set(phoneNumber, sessionInfo);
  setTimeout(() => sessionStore.delete(phoneNumber), OTP_SESSION_TTL_SEC * 1000);
}

async function sessionGet(phoneNumber) {
  if (redisClient) return redisClient.get(`${OTP_REDIS_PREFIX}${phoneNumber}`);
  return sessionStore.get(phoneNumber);
}

async function sessionDel(phoneNumber) {
  if (redisClient) await redisClient.del(`${OTP_REDIS_PREFIX}${phoneNumber}`);
  else sessionStore.delete(phoneNumber);
}

/**
 * Resolve reCAPTCHA token for Firebase Identity Toolkit sendVerificationCode.
 * Production must not rely on a hardcoded bypass unless explicitly opted in.
 */
function firebaseRecaptchaToken() {
  const fromEnv = process.env.FIREBASE_RECAPTCHA_TOKEN?.trim();
  if (fromEnv) return fromEnv;
  if (process.env.FIREBASE_ALLOW_RECAPTCHA_BYPASS === 'true') return 'server-side-bypass';
  if (process.env.NODE_ENV !== 'production') return 'server-side-bypass';
  const err = new Error(
    'OTP misconfiguration: set FIREBASE_RECAPTCHA_TOKEN for production, or FIREBASE_ALLOW_RECAPTCHA_BYPASS=true only if your Firebase project allows server bypass.'
  );
  err.code = 'OTP_CONFIG';
  throw err;
}

/**
 * STEP 1 — Send OTP via Firebase REST API
 * Firebase handles OTP generation + SMS delivery.
 * For Firebase test phone numbers (added in Console), Firebase
 * skips reCAPTCHA validation and skips SMS — uses preset code.
 */
async function sendOTP(phoneNumber) {
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:sendVerificationCode?key=${FIREBASE_API_KEY}`;

  let response;
  try {
    response = await axios.post(url, {
      phoneNumber,
      recaptchaToken: firebaseRecaptchaToken(),
    });
  } catch (e) {
    const detail = e.response?.data ?? e.message;
    console.error('[otp sendOTP]', typeof detail === 'object' ? JSON.stringify(detail) : detail);
    const err = new Error('OTP provider request failed');
    err.code = 'OTP_PROVIDER';
    throw err;
  }

  const { sessionInfo } = response.data;
  await sessionSet(phoneNumber, sessionInfo);
  return { phoneNumber };
}

/**
 * STEP 2 — Verify OTP via Firebase REST API
 * Uses the stored sessionInfo + user-entered code.
 */
async function verifyOTP(phoneNumber, code) {
  const sessionInfo = await sessionGet(phoneNumber);

  if (!sessionInfo) {
    const err = new Error('NO_SESSION');
    err.code = 'NO_SESSION';
    throw err;
  }

  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPhoneNumber?key=${FIREBASE_API_KEY}`;

  let response;
  try {
    response = await axios.post(url, {
      sessionInfo,
      code,
    });
  } catch (e) {
    const detail = e.response?.data ?? e.message;
    console.error('[otp verifyOTP]', typeof detail === 'object' ? JSON.stringify(detail) : detail);
    const err = new Error('OTP provider request failed');
    err.code = 'OTP_PROVIDER';
    throw err;
  }

  const data = response.data;
  await sessionDel(phoneNumber);
  return data;
}

module.exports = { sendOTP, verifyOTP };
