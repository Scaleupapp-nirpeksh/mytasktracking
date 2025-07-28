// src/api/models/userModel.js

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

/**
 * User Schema Definition
 *
 * This schema defines the structure for user documents in the MongoDB database.
 * It includes fields for name, email, and password, with appropriate validation
 * and security measures. It also includes fields for Google Calendar integration.
 */
const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please provide your name.'],
    trim: true,
  },
  email: {
    type: String,
    required: [true, 'Please provide your email.'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [
      /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
      'Please provide a valid email address.',
    ],
  },
  password: {
    type: String,
    required: [true, 'Please provide a password.'],
    minlength: [8, 'Password must be at least 8 characters long.'],
    // The 'select: false' option ensures that the password is not returned
    // in any query by default, enhancing security.
    select: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },

  // --- Google Calendar Integration Fields ---
  googleId: {
    type: String,
    select: false,
  },
  googleAccessToken: {
    type: String,
    select: false,
  },
  googleRefreshToken: {
    type: String,
    select: false,
  },
  googleTokenExpiryDate: {
    type: Date,
    select: false,
  },
});

// --- Mongoose Middleware (Hooks) ---

/**
 * Pre-save middleware to hash the user's password.
 *
 * This function runs automatically before a new user document is saved.
 * It hashes the password using bcrypt to ensure that plain-text passwords
 * are never stored in the database.
 */
userSchema.pre('save', async function (next) {
  // Only run this function if the password was actually modified
  if (!this.isModified('password')) return next();

  // Hash the password with a cost factor of 12
  this.password = await bcrypt.hash(this.password, 12);

  next();
});

// --- Mongoose Instance Methods ---

/**
 * Compares a candidate password with the user's stored (hashed) password.
 *
 * @param {string} candidatePassword The password provided by the user during login.
 * @param {string} userPassword The hashed password stored in the database.
 * @returns {Promise<boolean>} True if the passwords match, false otherwise.
 */
userSchema.methods.correctPassword = async function (
  candidatePassword,
  userPassword
) {
  return await bcrypt.compare(candidatePassword, userPassword);
};

// --- Model Creation ---
const User = mongoose.model('User', userSchema);

module.exports = User;
