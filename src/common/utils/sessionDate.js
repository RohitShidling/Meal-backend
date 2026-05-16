const mealEligibilityService = require('../services/mealEligibilityService');

const YMD = /^\d{4}-\d{2}-\d{2}$/;

const sessionTimezone = () =>
  /^[A-Za-z0-9_/+-]+$/.test(process.env.PG_SESSION_TIMEZONE || '')
    ? process.env.PG_SESSION_TIMEZONE
    : 'Asia/Kolkata';

/**
 * Normalize any date-like value to calendar YYYY-MM-DD in the app session timezone.
 * Avoids off-by-one when DB TIMESTAMP values are read as JS Date (UTC midnight).
 */
const toSessionYmd = (input) => {
  if (input == null || input === '') return null;

  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) return null;
    return input.toLocaleDateString('en-CA', { timeZone: sessionTimezone() });
  }

  const raw = String(input).trim();
  if (YMD.test(raw)) return raw;
  if (raw.length >= 10 && YMD.test(raw.slice(0, 10))) return raw.slice(0, 10);

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleDateString('en-CA', { timeZone: sessionTimezone() });
  }
  return null;
};

const parseYmdStrict = (input) => {
  const normalized = toSessionYmd(input);
  if (!normalized || !YMD.test(normalized)) return null;
  const [y, m, d] = normalized.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return normalized;
};

const parseSessionToday = () => mealEligibilityService.parseSessionToday();

module.exports = {
  sessionTimezone,
  toSessionYmd,
  parseYmdStrict,
  parseSessionToday,
};
