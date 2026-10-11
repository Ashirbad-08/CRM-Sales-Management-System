const mongoose = require('mongoose');
const { ZodError } = require('zod');
const config = require('../config/env');
const AppError = require('../utils/AppError');

function normalize(err) {
  if (err instanceof AppError) return err;

  if (err instanceof ZodError) {
    const errors = err.issues.map((i) => ({ field: i.path.join('.') || undefined, message: i.message }));
    return new AppError('Validation failed', 400, errors);
  }
  if (err instanceof mongoose.Error.ValidationError) {
    const errors = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
    return new AppError('Validation failed', 400, errors);
  }
  if (err instanceof mongoose.Error.ValidatorError) {
    return new AppError('Validation failed', 400, [{ field: err.path, message: err.message }]);
  }
  if (err instanceof mongoose.Error.CastError) return new AppError(`Invalid value for "${err.path}"`, 400);
  if (err.code === 11000) {
    const fields = Object.keys(err.keyPattern || {});
    return new AppError(`Duplicate value: ${fields.length ? fields.join(', ') : 'record'} already exists`, 409);
  }
  if (err.name === 'TokenExpiredError') return new AppError('Token expired', 401);
  if (err.name === 'JsonWebTokenError' || err.name === 'NotBeforeError') return new AppError('Invalid token', 401);
  if (err.type === 'entity.parse.failed') return new AppError('Malformed JSON in request body', 400);
  if (err.type === 'entity.too.large') return new AppError('Request body too large', 413);
  if (err.message === 'Not allowed by CORS') return new AppError('Origin not allowed by CORS policy', 403);

  const e = new AppError('Internal server error', 500);
  e.isOperational = false;
  return e;
}

const notFound = (req, res, next) => next(new AppError(`Route not found: ${req.method} ${req.originalUrl.split('?')[0]}`, 404));

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  const error = normalize(err);

  if (error.statusCode >= 500) {
    // Log server-side only; never log request bodies (may contain passwords).
    console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl.split('?')[0]} -> ${error.statusCode}`, config.isProd ? err.message : err.stack);
  }

  const body = { success: false, message: error.message };
  if (error.errors) body.errors = error.errors;
  if (!config.isProd && error.statusCode >= 500) body.stack = err.stack;
  res.status(error.statusCode).json(body);
};

module.exports = { notFound, errorHandler };
