const jwt = require('jsonwebtoken');
const db = require('../../common/database');
const AppError = require('../../common/utils/AppError');

const normalizeRole = (value) => {
  const role = String(value || '').trim().toLowerCase();
  if (role === 'superadmin') return 'super_admin';
  return role;
};

const adminAuthMiddleware = async (req, res, next) => {
  try {
    let token;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }

    if (!token) {
      return next(new AppError('Access denied. No token provided.', 401));
    }
    const decoded = jwt.verify(token, process.env.ADMIN_JWT_SECRET);
    
    const role = normalizeRole(decoded.role);
    if (!['admin', 'super_admin'].includes(role)) {
       return next(new AppError('Forbidden. Invalid role. Admin access token is required.', 403));
    }

    // Verify admin still exists in DB
    const adminCheck = await db.query('SELECT id FROM admins WHERE id = $1 AND is_logged_in = true', [decoded.id]);
    if (adminCheck.rows.length === 0) {
      return next(new AppError('Admin session invalid or user deleted. Please login again.', 401));
    }

    req.user = {
      ...decoded,
      role,
    };

    if (process.env.ADMIN_AUTH_AUDIT_LOG === 'true') {
      try {
        console.log(
          JSON.stringify({
            level: 'info',
            event: 'admin_jwt_accept',
            method: req.method,
            path: String(req.originalUrl || '').split('?')[0],
            admin_id: decoded.id,
            role,
          })
        );
      } catch (_) {
        /* ignore */
      }
    }

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return next(new AppError('Token expired. Please login again.', 401));
    }
    return next(new AppError('Invalid token.', 401));
  }
};

module.exports = adminAuthMiddleware;
