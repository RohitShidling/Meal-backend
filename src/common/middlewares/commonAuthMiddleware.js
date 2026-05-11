const jwt = require('jsonwebtoken');
const db = require('../database');
const AppError = require('../utils/AppError');

/**
 * Middleware to allow both Admin and Client access
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
    
    const decodedAdmin = jwt.decode(token);
    if (!decodedAdmin || !decodedAdmin.role) {
      return next(new AppError('Invalid, expired, or deleted user session.', 401));
    }

    let decoded;
    if (decodedAdmin.role === 'admin') {
      decoded = jwt.verify(token, process.env.ADMIN_JWT_SECRET);
      const adminCheck = await db.query('SELECT id FROM admins WHERE id = $1 AND is_logged_in = true', [decoded.id]);
      if (adminCheck.rows.length === 0) {
        return next(new AppError('Invalid, expired, or deleted user session.', 401));
      }
    } else if (decodedAdmin.role === 'client') {
      decoded = jwt.verify(token, process.env.CLIENT_JWT_SECRET);
      const clientCheck = await db.query('SELECT id FROM clients WHERE id = $1', [decoded.id]);
      if (clientCheck.rows.length === 0) {
        return next(new AppError('Invalid, expired, or deleted user session.', 401));
      }
    } else {
      return next(new AppError('Invalid, expired, or deleted user session.', 401));
    }

    req.user = decoded;
    next();
  } catch (error) {
    return next(new AppError('Authentication failed.', 401));
  }
};

module.exports = commonAuthMiddleware;
