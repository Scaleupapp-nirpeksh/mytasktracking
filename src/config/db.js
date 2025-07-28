// src/config/db.js

const mongoose = require('mongoose');
const logger = require('../utils/logger');

/**
 * Establishes a connection to the MongoDB database.
 *
 * This function reads the MongoDB connection URI from the environment variables
 * and uses Mongoose to connect to the database. It includes robust error
 * handling and logs the connection status. The connection is made with options
 * recommended for modern applications to avoid deprecation warnings.
 */
const connectDB = async () => {
  try {
    // Retrieve the MongoDB connection string from environment variables.
    // This is a critical security practice to avoid hardcoding credentials.
    const mongoURI = process.env.MONGO_URI;

    if (!mongoURI) {
      logger.error('MONGO_URI is not defined in the environment variables.');
      // Exit the process with a failure code if the DB connection string is missing.
      process.exit(1);
    }

    // Attempt to connect to the database.
    const conn = await mongoose.connect(mongoURI, {
      // These options are recommended by Mongoose for modern usage.
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    logger.info(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    logger.error(`MongoDB Connection Error: ${error.message}`);
    // Exit the process with a failure code if the connection fails.
    process.exit(1);
  }
};

module.exports = connectDB;
