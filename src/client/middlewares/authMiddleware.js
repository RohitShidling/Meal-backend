const jwt = require('jsonwebtoken');
const AppError = require('../../common/utils/AppError');

const clientAuthMiddleware = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(new AppError('Access denied. No token provided.', 401));
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.CLIENT_JWT_SECRET);
    
    if (decoded.role !== 'client') {
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

module.exports = clientAuthMiddleware;
