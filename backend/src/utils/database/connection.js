/**
 * MongoDB Database Connection Utility
 * 
 * Handles MongoDB connection with Mongoose, including:
 * - Connection pooling and optimization
 * - Retry logic for connection failures
 * - Environment-specific configurations
 * - Connection event handling and logging
 * - Graceful disconnection
 * 
 * @author Nirpeksh Scale Up App
 * @version 1.0.0
 */

const mongoose = require('mongoose');
const logger = require('../logger/logger');

/**
 * MongoDB connection configuration
 * Optimized for production use with connection pooling and timeouts
 */
const getConnectionOptions = () => {
  const baseOptions = {
    // Connection pool settings
    maxPoolSize: parseInt(process.env.DB_MAX_POOL_SIZE) || 10, // Maximum connections
    minPoolSize: parseInt(process.env.DB_MIN_POOL_SIZE) || 5,  // Minimum connections
    maxIdleTimeMS: 30000, // Close connections after 30 seconds of inactivity
    
    // Timeout settings
    serverSelectionTimeoutMS: 5000, // How long to try selecting a server
    socketTimeoutMS: 45000, // How long to wait for socket operations
    connectTimeoutMS: 10000, // How long to wait for initial connection
    
    // Heartbeat settings
    heartbeatFrequencyMS: 10000, // How often to check server status
    
    // Buffer settings
    bufferMaxEntries: 0, // Disable mongoose buffering
    bufferCommands: false, // Disable mongoose buffering
    
    // Other optimizations
    useNewUrlParser: true,
    useUnifiedTopology: true,
    autoIndex: process.env.NODE_ENV !== 'production', // Disable in production for performance
    autoCreate: true, // Automatically create collections
  };

  // Add authentication if provided
  if (process.env.DB_USERNAME && process.env.DB_PASSWORD) {
    baseOptions.auth = {
      username: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD
    };
  }

  return baseOptions;
};

/**
 * Get the appropriate MongoDB URI based on environment
 */
const getMongoURI = () => {
  const nodeEnv = process.env.NODE_ENV;
  
  switch (nodeEnv) {
    case 'test':
      return process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/mytasktracking_test';
    case 'production':
      return process.env.MONGODB_URI;
    default:
      return process.env.MONGODB_URI || 'mongodb://localhost:27017/mytasktracking';
  }
};

/**
 * Set up MongoDB connection event listeners
 */
const setupConnectionEventListeners = () => {
  // Connection successful
  mongoose.connection.on('connected', () => {
    logger.info('✅ MongoDB connected successfully', {
      host: mongoose.connection.host,
      port: mongoose.connection.port,
      database: mongoose.connection.name,
      readyState: mongoose.connection.readyState
    });
  });

  // Connection error
  mongoose.connection.on('error', (error) => {
    logger.error('❌ MongoDB connection error:', error);
  });

  // Connection disconnected
  mongoose.connection.on('disconnected', () => {
    logger.warn('⚠️ MongoDB disconnected');
  });

  // Connection reconnected
  mongoose.connection.on('reconnected', () => {
    logger.info('🔄 MongoDB reconnected');
  });

  // Connection ready
  mongoose.connection.on('open', () => {
    logger.info('🚀 MongoDB connection is open and ready');
  });

  // Application termination
  process.on('SIGINT', async () => {
    try {
      await mongoose.connection.close();
      logger.info('🛑 MongoDB connection closed due to app termination');
      process.exit(0);
    } catch (error) {
      logger.error('❌ Error closing MongoDB connection:', error);
      process.exit(1);
    }
  });
};

/**
 * Main function to establish MongoDB connection
 * Includes retry logic for failed connections
 */
const connectDB = async (retryCount = 0) => {
  const maxRetries = 5;
  const retryDelay = 5000; // 5 seconds
  
  try {
    const mongoURI = getMongoURI();
    const options = getConnectionOptions();

    if (!mongoURI) {
      throw new Error('MongoDB URI is not defined in environment variables');
    }

    logger.info(`🔌 Attempting to connect to MongoDB (attempt ${retryCount + 1}/${maxRetries + 1})...`, {
      environment: process.env.NODE_ENV,
      database: mongoURI.split('/').pop()?.split('?')[0] || 'unknown'
    });

    // Set up event listeners before connecting
    if (retryCount === 0) {
      setupConnectionEventListeners();
    }

    // Attempt connection
    await mongoose.connect(mongoURI, options);

    // Verify connection
    const dbState = mongoose.connection.readyState;
    if (dbState !== 1) {
      throw new Error(`Database connection state is ${dbState}, expected 1 (connected)`);
    }

    logger.info('✅ Database connection established successfully', {
      connectionState: dbState,
      poolSize: options.maxPoolSize,
      environment: process.env.NODE_ENV
    });

    return mongoose.connection;

  } catch (error) {
    logger.error(`❌ Database connection attempt ${retryCount + 1} failed:`, {
      error: error.message,
      stack: error.stack,
      retryCount: retryCount + 1,
      maxRetries: maxRetries + 1
    });

    // If we haven't exceeded max retries, try again
    if (retryCount < maxRetries) {
      logger.info(`⏳ Retrying database connection in ${retryDelay / 1000} seconds...`);
      
      await new Promise(resolve => setTimeout(resolve, retryDelay));
      return connectDB(retryCount + 1);
    }

    // If all retries failed, throw the error
    logger.error('💥 All database connection attempts failed. Exiting application.');
    throw new Error(`Failed to connect to MongoDB after ${maxRetries + 1} attempts: ${error.message}`);
  }
};

/**
 * Gracefully close the database connection
 */
const disconnectDB = async () => {
  try {
    await mongoose.connection.close();
    logger.info('✅ MongoDB connection closed gracefully');
  } catch (error) {
    logger.error('❌ Error closing MongoDB connection:', error);
    throw error;
  }
};

/**
 * Check if database is connected
 */
const isConnected = () => {
  return mongoose.connection.readyState === 1;
};

/**
 * Get connection status information
 */
const getConnectionStatus = () => {
  const states = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting'
  };

  return {
    state: states[mongoose.connection.readyState] || 'unknown',
    host: mongoose.connection.host || null,
    port: mongoose.connection.port || null,
    database: mongoose.connection.name || null,
    readyState: mongoose.connection.readyState
  };
};

/**
 * Database health check
 */
const healthCheck = async () => {
  try {
    if (!isConnected()) {
      return { status: 'disconnected', healthy: false };
    }

    // Perform a simple database operation to verify health
    await mongoose.connection.db.admin().ping();
    
    return {
      status: 'healthy',
      healthy: true,
      ...getConnectionStatus()
    };
  } catch (error) {
    logger.error('❌ Database health check failed:', error);
    return {
      status: 'unhealthy',
      healthy: false,
      error: error.message
    };
  }
};

module.exports = {
  connectDB,
  disconnectDB,
  isConnected,
  getConnectionStatus,
  healthCheck
};