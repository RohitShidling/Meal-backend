const AppError = require('../utils/AppError');

/**
 * Use after commonAuthMiddleware on routes that must only be callable with a
 * client JWT (mobile app contract). Admin tokens receive 403 — admins should
 * use /api/admin/* or documented exceptions (e.g. common profile with clientId).
 */
module.exports = (req, res, next) => {
  const role = String(req.user?.role || '').toLowerCase();
  if (role === 'client') return next();
  return next(
    new AppError('This endpoint is only available to client accounts. Use the admin API where applicable.', 403)
  );
};
