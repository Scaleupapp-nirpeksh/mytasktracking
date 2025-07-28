/**
 * Global Error Handling Middleware
 * 
 * Centralized error handling for the Task Tracker application:
 * - Standardized error responses
 * - Environment-specific error details
 * - Security-conscious error messages
 * - Comprehensive error logging
 * - HTTP status code management
 * 
 * @author Nirpeksh Scale Up App
 * @version 1.0.0
 */

const { logger, logSecurity } = require('../../utils/logger/logger');

/**
 * Custom Error Classes
 */

class AppError extends Error {
  constructor(message, statusCode, errorCode = null) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;
    this.errorCode = errorCode;

    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message, field = null) {
    super(message, 400, 'VALIDATION_ERROR');
    this.field = field;
  }
}

class AuthenticationError extends AppError {
  constructor(message = 'Authentication failed') {
    super(message, 401, 'AUTHENTICATION_ERROR');
  }
}

class AuthorizationError extends AppError {
  constructor(message = 'Access denied') {
    super(message, 403, 'AUTHORIZATION_ERROR');
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404, 'NOT_FOUND_ERROR');
  }
}

class ConflictError extends AppError {
  constructor(message = 'Resource conflict') {
    super(message, 409, 'CONFLICT_ERROR');
  }
}

class RateLimitError extends AppError {
  constructor(message = 'Too many requests') {
    super(message, 429, 'RATE_LIMIT_ERROR');
  }
}

class DatabaseError extends AppError {
  constructor(message = 'Database operation failed') {
    super(message, 500, 'DATABASE_ERROR');
  }
}

class FileUploadError extends AppError {
  constructor(message = 'File upload failed') {
    super(message, 400, 'FILE_UPLOAD_ERROR');
  }
}

/**
 * Handle different types of errors and convert them to AppError
 */
const handleCastErrorDB = (err) => {
  const message = `Invalid ${err.path}: ${err.value}`;
  return new ValidationError(message);
};

const handleDuplicateFieldsDB = (err) => {
  const field = Object.keys(err.keyValue)[0];
  const value = err.keyValue[field];
  const message = `${field} '${value}' already exists`;
  return new ConflictError(message);
};

const handleValidationErrorDB = (err) => {
  const errors = Object.values(err.errors).map(el => el.message);
  const message = `Invalid input data: ${errors.join('. ')}`;
  return new ValidationError(message);
};

const handleJWTError = () => {
  return new AuthenticationError('Invalid token. Please log in again');
};

const handleJWTExpiredError = () => {
  return new AuthenticationError('Your token has expired. Please log in again');
};

const handleMulterError = (err) => {
  let message = 'File upload error';
  
  switch (err.code) {
    case 'LIMIT_FILE_SIZE':
      message = 'File size too large. Maximum allowed size is 10MB';
      break;
    case 'LIMIT_FILE_COUNT':
      message = 'Too many files. Maximum 5 files allowed';
      break;
    case 'LIMIT_UNEXPECTED_FILE':
      message = 'Unexpected file field';
      break;
    case 'LIMIT_PART_COUNT':
      message = 'Too many parts in multipart form';
      break;
    default:
      message = err.message || 'File upload error';
  }
  
  return new FileUploadError(message);
};

/**
 * Send error response in development
 */
const sendErrorDev = (err, req, res) => {
  // API
  if (req.originalUrl.startsWith('/api')) {
    return res.status(err.statusCode).json({
      status: err.status,
      error: err,
      message: err.message,
      stack: err.stack,
      errorCode: err.errorCode,
      timestamp: new Date().toISOString(),
      path: req.originalUrl,
      method: req.method
    });
  }

  // Rendered website
  console.error('ERROR 💥', err);
  return res.status(err.statusCode).json({
    title: 'Something went wrong!',
    msg: err.message
  });
};

/**
 * Send error response in production
 */
const sendErrorProd = (err, req, res) => {
  // API
  if (req.originalUrl.startsWith('/api')) {
    // Operational, trusted error: send message to client
    if (err.isOperational) {
      return res.status(err.statusCode).json({
        status: err.status,
        message: err.message,
        errorCode: err.errorCode,
        timestamp: new Date().toISOString()
      });
    }

    // Programming or other unknown error: don't leak error details
    logger.error('Programming Error:', err);
    
    return res.status(500).json({
      status: 'error',
      message: 'Something went wrong!',
      errorCode: 'INTERNAL_SERVER_ERROR',
      timestamp: new Date().toISOString()
    });
  }

  // Rendered website
  if (err.isOperational) {
    return res.status(err.statusCode).json({
      title: 'Something went wrong!',
      msg: err.message
    });
  }

  // Programming or other unknown error
  logger.error('Programming Error:', err);
  return res.status(err.statusCode).json({
    title: 'Something went wrong!',
    msg: 'Please try again later.'
  });
};

/**
 * Get client IP address (works with proxies)
 */
const getClientIP = (req) => {
  return req.ip || 
         req.connection.remoteAddress || 
         req.socket.remoteAddress ||
         (req.connection.socket ? req.connection.socket.remoteAddress : null);
};

/**
 * Log security events for certain error types
 */
const logSecurityEvent = (err, req) => {
  const clientIP = getClientIP(req);
  const userAgent = req.get('User-Agent');
  const userId = req.user?.id || 'anonymous';

  // Log authentication failures
  if (err instanceof AuthenticationError || err.statusCode === 401) {
    logSecurity('authentication_failure', 'medium', {
      ip: clientIP,
      userAgent,
      userId,
      path: req.originalUrl,
      method: req.method,
      message: err.message
    });
  }

  // Log authorization failures
  if (err instanceof AuthorizationError || err.statusCode === 403) {
    logSecurity('authorization_failure', 'medium', {
      ip: clientIP,
      userAgent,
      userId,
      path: req.originalUrl,
      method: req.method,
      message: err.message
    });
  }

  // Log rate limiting
  if (err instanceof RateLimitError || err.statusCode === 429) {
    logSecurity('rate_limit_exceeded', 'low', {
      ip: clientIP,
      userAgent,
      userId,
      path: req.originalUrl,
      method: req.method
    });
  }

  // Log suspicious activities (multiple errors from same IP)
  if (err.statusCode >= 400) {
    // This could be enhanced with Redis to track multiple attempts
    logSecurity('client_error', 'low', {
      ip: clientIP,
      userAgent,
      userId,
      path: req.originalUrl,
      method: req.method,
      statusCode: err.statusCode,
      message: err.message
    });
  }
};

/**
 * Main error handling middleware
 */
const globalErrorHandler = (err, req, res, next) => {
  // Set default values
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  // Log the error with context
  const errorContext = {
    url: req.originalUrl,
    method: req.method,
    ip: getClientIP(req),
    userAgent: req.get('User-Agent'),
    userId: req.user?.id || null,
    workspaceId: req.workspace?.id || null,
    statusCode: err.statusCode,
    errorCode: err.errorCode || null
  };

  // Log based on severity
  if (err.statusCode >= 500) {
    logger.error('Server Error:', { ...errorContext, error: err.message, stack: err.stack });
  } else if (err.statusCode >= 400) {
    logger.warn('Client Error:', { ...errorContext, error: err.message });
  }

  // Log security events
  logSecurityEvent(err, req);

  let error = { ...err };
  error.message = err.message;

  // Handle specific error types
  if (error.name === 'CastError') error = handleCastErrorDB(error);
  if (error.code === 11000) error = handleDuplicateFieldsDB(error);
  if (error.name === 'ValidationError') error = handleValidationErrorDB(error);
  if (error.name === 'JsonWebTokenError') error = handleJWTError();
  if (error.name === 'TokenExpiredError') error = handleJWTExpiredError();
  if (error.name === 'MulterError') error = handleMulterError(error);

  // Send error response based on environment
  if (process.env.NODE_ENV === 'development') {
    sendErrorDev(error, req, res);
  } else {
    sendErrorProd(error, req, res);
  }
};

/**
 * 404 Not Found handler
 */
const notFound = (req, res, next) => {
  const message = `Can't find ${req.originalUrl} on this server!`;
  const error = new NotFoundError(message);
  
  // Log 404 attempts for potential security monitoring
  logger.warn('404 Not Found:', {
    url: req.originalUrl,
    method: req.method,
    ip: getClientIP(req),
    userAgent: req.get('User-Agent'),
    referrer: req.get('Referrer') || null
  });

  next(error);
};

/**
 * Async error wrapper
 * Catches errors in async route handlers
 */
const catchAsync = (fn) => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};

/**
 * Create error with specific type
 */
const createError = (message, statusCode, errorCode = null) => {
  return new AppError(message, statusCode, errorCode);
};

module.exports = {
  // Error classes
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  DatabaseError,
  FileUploadError,
  
  // Middleware
  errorHandler: globalErrorHandler,
  notFound,
  catchAsync,
  
  // Utilities
  createError
};