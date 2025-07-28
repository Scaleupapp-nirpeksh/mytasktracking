// src/utils/logger.js

const winston = require('winston');

// Define the format for log messages.
// This includes a timestamp, the log level, and the message itself.
const logFormat = winston.format.printf(({ level, message, timestamp }) => {
  return `${timestamp} [${level.toUpperCase()}]: ${message}`;
});

/**
 * A production-ready logger instance using Winston.
 *
 * This logger is configured to:
 * 1. Print logs to the console with colors for better readability during development.
 * 2. Add a timestamp to every log message.
 * 3. Differentiate log formats based on the environment (development vs. production).
 */
const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    logFormat
  ),
  transports: [
    // All logs will be output to the console.
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(), // Add colors to the output
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        logFormat
      ),
    }),
  ],
  // Do not exit on handled exceptions.
  exitOnError: false,
});

// In a real production scenario, you might add other transports,
// such as logging to a file or a cloud logging service.
// For example:
 if (process.env.NODE_ENV === 'production') {
   logger.add(new winston.transports.File({ filename: 'error.log', level: 'error' }));
   logger.add(new winston.transports.File({ filename: 'combined.log' }));
 }

module.exports = logger;
