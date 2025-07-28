/**
 * Error Middleware Exports
 * 
 * Centralized export for all error handling middleware and utilities.
 * This allows for clean imports throughout the application.
 * 
 * @author Nirpeksh Scale Up App
 * @version 1.0.0
 */

const {
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
    errorHandler,
    notFound,
    catchAsync,
    
    // Utilities
    createError
  } = require('./errorHandler');
  
  module.exports = {
    // Error classes for creating specific errors
    AppError,
    ValidationError,
    AuthenticationError,
    AuthorizationError,
    NotFoundError,
    ConflictError,
    RateLimitError,
    DatabaseError,
    FileUploadError,
    
    // Core middleware functions
    errorHandler,
    notFound,
    catchAsync,
    
    // Utility functions
    createError
  };