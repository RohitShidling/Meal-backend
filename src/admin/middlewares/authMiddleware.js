const jwt = require('jsonwebtoken');
const AppError = require('../../common/utils/AppError');

const adminAuthMiddleware = (req, res, next) => {
  try {
    let token;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.query && req.query.token) {
      token = req.query.token;
    }

    if (!token) {
      return next(new AppError('Access denied. No token provided.', 401));
    }
    const decoded = jwt.verify(token, process.env.ADMIN_JWT_SECRET);
    
    if (decoded.role !== 'admin') {
       return next(new AppError('Forbidden. Invalid role.', 403));
    }

    req.user = decoded;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return next(new AppError('Token expired. Please login again.', 401));
    }
    return next(new AppError('Invalid token.', 401));
  }
};

module.exports = adminAuthMiddleware;
