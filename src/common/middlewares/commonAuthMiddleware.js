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
    
    let decoded;
    let authenticated = false;

    // Try Admin Secret
    try {
      decoded = jwt.verify(token, process.env.ADMIN_JWT_SECRET);
      if (decoded.role === 'admin') {
        const adminCheck = await db.query('SELECT id FROM admins WHERE id = $1', [decoded.id]);
        if (adminCheck.rows.length > 0) {
          authenticated = true;
        }
      }
    } catch (err) {
      // Ignore and try client secret
    }

    // Try Client Secret if not already authenticated
    if (!authenticated) {
      try {
        decoded = jwt.verify(token, process.env.CLIENT_JWT_SECRET);
        if (decoded.role === 'client') {
          const clientCheck = await db.query('SELECT id FROM clients WHERE id = $1', [decoded.id]);
          if (clientCheck.rows.length > 0) {
            authenticated = true;
          }
        }
      } catch (err) {
        // Both failed
      }
    }

    if (!authenticated) {
      return next(new AppError('Invalid, expired, or deleted user session.', 401));
    }

    req.user = decoded;
    next();
  } catch (error) {
    return next(new AppError('Authentication failed.', 401));
  }
};

module.exports = commonAuthMiddleware;
