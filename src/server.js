// src/server.js

// 1. Load environment variables from .env file
const dotenv = require('dotenv');
dotenv.config();

// 2. Import necessary modules
const http = require('http');
const app = require('./app'); // The configured Express app
const connectDB = require('./config/db');
const logger = require('./utils/logger');
const initializeTaskNotifier = require('./jobs/taskNotifierJob');
const initializeCalendarSync = require('./jobs/calendarSyncJob');
const initializeRecurringTaskJob = require('./jobs/recurringTaskJob'); // <-- IMPORT NEW RECURRING JOB

// 3. Handle Uncaught Exceptions
process.on('uncaughtException', (err) => {
  logger.error('UNCAUGHT EXCEPTION! 💥 Shutting down...');
  logger.error(`${err.name}: ${err.message}`);
  process.exit(1);
});

// 4. Define Server Port
const PORT = process.env.PORT || 5000;

// 5. Create HTTP Server
const server = http.createServer(app);

// 6. Start the Server
const startServer = async () => {
  try {
    // Connect to the database before starting the server
    await connectDB();

    server.listen(PORT, () => {
      logger.info(`Server is running on port ${PORT} in ${process.env.NODE_ENV} mode.`);
      
      // Initialize and start all cron jobs after the server is running
      initializeTaskNotifier();
      initializeCalendarSync();
      initializeRecurringTaskJob(); // <-- START THE RECURRING TASK JOB
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// 7. Handle Unhandled Promise Rejections
process.on('unhandledRejection', (err) => {
  logger.error('UNHANDLED REJECTION! 💥 Shutting down...');
  logger.error(`${err.name}: ${err.message}`);
  // Close server & exit process
  server.close(() => {
    process.exit(1);
  });
});

// 8. Handle SIGTERM for graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM RECEIVED. Shutting down gracefully...');
  server.close(() => {
    logger.info('Process terminated!');
  });
});

// --- GO! ---
startServer();
