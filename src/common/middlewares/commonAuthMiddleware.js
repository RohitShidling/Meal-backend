const jwt = require('jsonwebtoken');
const AppError = require('../utils/AppError');

/**
 * Middleware to allow both Admin and Client access
 */
const commonAuthMiddleware = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(new AppError('Access denied. No token provided.', 401));
    }

    const token = authHeader.split(' ')[1];
    
    let decoded;
    let authenticated = false;

    // Try Admin Secret
    try {
      decoded = jwt.verify(token, process.env.ADMIN_JWT_SECRET);
      if (decoded.role === 'admin') {
        authenticated = true;
      }
    } catch (err) {
      // Ignore and try client secret
    }

    // Try Client Secret if not already authenticated
    if (!authenticated) {
      try {
        decoded = jwt.verify(token, process.env.CLIENT_JWT_SECRET);
        if (decoded.role === 'client') {
          authenticated = true;
        }
      } catch (err) {
        // Both failed
      }
    }

    if (!authenticated) {
      return next(new AppError('Invalid or expired token.', 401));
    }

    req.user = decoded;
    next();
  } catch (error) {
    return next(new AppError('Authentication failed.', 401));
  }
};

module.exports = commonAuthMiddleware;
