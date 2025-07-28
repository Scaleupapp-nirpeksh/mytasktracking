// src/utils/appError.js

/**
 * A custom Error class for handling operational errors in the application.
 *
 * Operational errors are predictable errors that can occur during runtime,
 * such as invalid user input, failed database lookups, or failed external API calls.
 * This class allows us to create errors with a specific message and HTTP status code,
 * which can then be handled by our global error handling middleware to send a
 * meaningful response to the client.
 */
class AppError extends Error {
    /**
     * Creates an instance of AppError.
     * @param {string} message The error message that will be sent to the client.
     * @param {number} statusCode The HTTP status code associated with this error (e.g., 404, 400).
     */
    constructor(message, statusCode) {
      super(message);
  
      this.statusCode = statusCode;
      // Determine the status based on the status code ('fail' for 4xx, 'error' for 5xx).
      this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
      // This flag helps us differentiate our custom operational errors from other bugs.
      this.isOperational = true;
  
      // Capture the stack trace, excluding the constructor call from it.
      Error.captureStackTrace(this, this.constructor);
    }
  }
  
  module.exports = AppError;
  