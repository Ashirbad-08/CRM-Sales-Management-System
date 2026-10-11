const jwt = require('jsonwebtoken');
const config = require('../config/env');
const User = require('../models/User');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');

/** Accepts "Authorization: Bearer <jwt>" or the HTTP-only accessToken cookie. */
const authenticate = catchAsync(async (req, res, next) => {
  const header = req.headers.authorization;
  const token = header && header.startsWith('Bearer ') ? header.slice(7) : req.cookies && req.cookies.accessToken;
  if (!token) throw new AppError('Authentication required', 401);

  let payload;
  try {
    payload = jwt.verify(token, config.jwt.accessSecret, { algorithms: ['HS256'] });
  } catch (err) {
    throw new AppError(err.name === 'TokenExpiredError' ? 'Access token expired' : 'Invalid access token', 401);
  }

  const user = await User.findById(payload.sub).select('+tokenVersion');
  if (!user || (user.tokenVersion || 0) !== payload.tv) throw new AppError('Session is no longer valid. Please log in again', 401);
  if (!user.isActive) throw new AppError('Your account has been deactivated', 403);

  req.user = user;
  next();
});

/** Role-based authorization: authorize(ROLES.ADMIN, ROLES.MANAGER) */
const authorize = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return next(new AppError('You do not have permission to perform this action', 403));
  }
  next();
};

module.exports = { authenticate, authorize };
