const jwt = require('jsonwebtoken');
const db = require('../database');
const AppError = require('../utils/AppError');

const normalizeRole = (value) => {
  const role = String(value || '').trim().toLowerCase();
  if (role === 'superadmin') return 'super_admin';
  return role;
};

const verifyIfPossible = (token, secret) => {
  try {
    return jwt.verify(token, secret);
  } catch (error) {
    return null;
  }
};

/**
 * Verifies Bearer JWT against admin OR client secret and attaches req.user.
 * Controllers must branch on req.user.role where behavior differs (see subscriptionPlanDurationController).
 * For mobile-only surfaces, chain requireClientRoleMiddleware after this.
 */
const commonAuthMiddleware = async (req, res, next) => {
  try {
    let token;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }

    if (!token) {
      return next(new AppError('Access denied. No token provided.', 401));
    }
    
    const decodedByAdminSecret = verifyIfPossible(token, process.env.ADMIN_JWT_SECRET);
    const decodedByClientSecret = verifyIfPossible(token, process.env.CLIENT_JWT_SECRET);
    const decoded = decodedByAdminSecret || decodedByClientSecret;
    if (!decoded) {
      return next(new AppError('Authentication failed.', 401));
    }

    const normalizedRole = normalizeRole(decoded.role);
    if (['admin', 'super_admin'].includes(normalizedRole)) {
      const adminCheck = await db.query('SELECT id FROM admins WHERE id = $1 AND is_logged_in = true', [decoded.id]);
      if (adminCheck.rows.length === 0) {
        return next(new AppError('Invalid, expired, or deleted user session.', 401));
      }
    } else if (normalizedRole === 'client') {
      const clientCheck = await db.query('SELECT id FROM clients WHERE id = $1', [decoded.id]);
      if (clientCheck.rows.length === 0) {
        return next(new AppError('Invalid, expired, or deleted user session.', 401));
      }
    } else {
      return next(new AppError('Invalid, expired, or deleted user session.', 401));
    }

    req.user = {
      ...decoded,
      role: normalizedRole,
    };
    next();
  } catch (error) {
    return next(new AppError('Authentication failed.', 401));
  }
};

module.exports = commonAuthMiddleware;
