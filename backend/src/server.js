/**
 * Task Tracker Backend Server
 * 
 * Main server entry point that initializes the Express application,
 * connects to database, sets up middleware, and starts the server.
 * 
 * Features:
 * - Production-ready error handling
 * - Graceful shutdown handling
 * - Database connection management
 * - Environment-based configuration
 * - Comprehensive logging
 * 
 * @author Nirpeksh Scale Up App
 * @version 1.0.0
 */

// Import required dependencies
require('dotenv').config();
require('express-async-errors'); // Handles async errors automatically

const app = require('./app');
const connectDB = require('./utils/database/connection');
const logger = require('./utils/logger/logger');

// Configuration
const PORT = process.env.PORT || 5000;
const NODE_ENV = process.env.NODE_ENV || 'development';

/**
 * Start the server with proper error handling and database connection
 */
async function startServer() {
  try {
    // Connect to MongoDB
    logger.info('🔌 Connecting to MongoDB...');
    await connectDB();
    logger.info('✅ MongoDB connected successfully');

    // Start the HTTP server
    const server = app.listen(PORT, () => {
      logger.info(`🚀 Server running in ${NODE_ENV} mode on port ${PORT}`);
      logger.info(`📍 Server URL: http://localhost:${PORT}`);
      logger.info(`📖 API Documentation: http://localhost:${PORT}/api-docs`);
      
      if (NODE_ENV === 'development') {
        logger.info(`🔧 Environment: Development`);
        logger.info(`📊 Health Check: http://localhost:${PORT}/health`);
      }
    });

    // Set server timeout
    server.timeout = process.env.REQUEST_TIMEOUT || 30000; // 30 seconds

    /**
     * Graceful shutdown handler
     * Ensures all connections are closed properly when the server shuts down
     */
    const gracefulShutdown = (signal) => {
      logger.info(`🛑 ${signal} received. Starting graceful shutdown...`);
      
      server.close(async (err) => {
        if (err) {
          logger.error('❌ Error during server close:', err);
          process.exit(1);
        }

        try {
          // Close database connection
          const mongoose = require('mongoose');
          await mongoose.connection.close();
          logger.info('✅ Database connection closed');

          // Close Redis connection if available
          if (global.redisClient) {
            await global.redisClient.quit();
            logger.info('✅ Redis connection closed');
          }

          logger.info('✅ Graceful shutdown completed');
          process.exit(0);
        } catch (shutdownError) {
          logger.error('❌ Error during graceful shutdown:', shutdownError);
          process.exit(1);
        }
      });

      // Force close after 10 seconds
      setTimeout(() => {
        logger.error('❌ Forcing shutdown after timeout');
        process.exit(1);
      }, 10000);
    };

    // Handle different shutdown signals
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('💥 Uncaught Exception:', error);
      gracefulShutdown('UNCAUGHT_EXCEPTION');
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
      gracefulShutdown('UNHANDLED_REJECTION');
    });

    // Handle warnings
    process.on('warning', (warning) => {
      logger.warn('⚠️ Node.js Warning:', warning);
    });

    return server;

  } catch (error) {
    logger.error('💥 Failed to start server:', error);
    process.exit(1);
  }
}

/**
 * Start the server only if this file is run directly
 * This allows for easier testing by importing the app without starting the server
 */
if (require.main === module) {
  startServer();
}

// Export for testing purposes
module.exports = { startServer };