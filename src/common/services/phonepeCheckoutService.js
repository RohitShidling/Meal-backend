const phonepe = require('../utils/phonepe');

const DEFAULT_FRONTEND_REDIRECT = process.env.DEFAULT_FRONTEND_REDIRECT_URL;

const getAllowedFrontendOrigins = () => {
  const configured = process.env.ALLOWED_PAYMENT_REDIRECT_ORIGINS || process.env.CORS_ORIGINS || '';
  return configured
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
};

const sanitizeFrontendRedirectUrl = (candidateUrl) => {
  if (!candidateUrl) return DEFAULT_FRONTEND_REDIRECT || process.env.PHONEPE_REDIRECT_URL;
  const allowlist = getAllowedFrontendOrigins();
  if (allowlist.length === 0) {
    return DEFAULT_FRONTEND_REDIRECT || process.env.PHONEPE_REDIRECT_URL;
  }
  try {
    const parsed = new URL(candidateUrl);
    if (allowlist.includes(parsed.origin)) return candidateUrl;
    return DEFAULT_FRONTEND_REDIRECT || process.env.PHONEPE_REDIRECT_URL;
  } catch {
    return DEFAULT_FRONTEND_REDIRECT || process.env.PHONEPE_REDIRECT_URL;
  }
};

const resolveApiBaseUrl = (req) => {
  const configured = process.env.API_BASE_URL;
  if (configured) return configured.replace(/\/$/, '');
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.headers['x-forwarded-host'] || req.get('host');
  return `${proto}://${host}`;
};

/**
 * @param {object} params
 * @param {import('express').Request} params.req
 * @param {string} params.clientId
 * @param {string} params.merchantTransactionId
 * @param {number} params.amount
 * @param {string} [params.customRedirect]
 * @param {string} params.callbackPath - e.g. /api/client/payment/callback
 */
const initiatePhonePePayment = async ({
  req,
  clientId,
  merchantTransactionId,
  amount,
  customRedirect,
  callbackPath = '/api/client/payment/callback',
  mobileNumber,
}) => {
  const finalRedirectUrl = sanitizeFrontendRedirectUrl(
    customRedirect || process.env.PHONEPE_REDIRECT_URL || DEFAULT_FRONTEND_REDIRECT
  );
  const backendCallbackUrl = `${resolveApiBaseUrl(req)}${callbackPath}?tid=${merchantTransactionId}&frontendUrl=${encodeURIComponent(finalRedirectUrl)}`;

  const response = await phonepe.initiatePayment({
    transactionId: merchantTransactionId,
    userId: clientId,
    amount,
    redirectUrl: backendCallbackUrl,
    mobileNumber: String(mobileNumber || '').replace(/\D/g, '').slice(-10),
  });

  if (!response.success) {
    return { success: false, message: response.message || 'Payment Gateway Error' };
  }

  return {
    success: true,
    paymentUrl: response.data.instrumentResponse.redirectInfo.url,
    redirectUrl: finalRedirectUrl,
  };
};

module.exports = {
  sanitizeFrontendRedirectUrl,
  resolveApiBaseUrl,
  initiatePhonePePayment,
};
