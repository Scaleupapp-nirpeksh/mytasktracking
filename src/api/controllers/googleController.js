// src/api/controllers/googleController.js

const User = require('../models/userModel');
const googleService = require('../../services/googleCalendarService');
const catchAsync = require('../../utils/catchAsync');
const AppError = require('../../utils/appError');

/**
 * Initiates the Google OAuth 2.0 authorization process.
 *
 * This function generates a unique authorization URL for the currently
 * logged-in user and redirects them to Google's consent screen.
 */
exports.getAuthUrl = catchAsync(async (req, res, next) => {
  const url = googleService.generateAuthUrl(req.user.id);
  res.status(200).json({
    status: 'success',
    data: {
      authUrl: url,
    },
  });
});

/**
 * Handles the callback from Google after user consent.
 *
 * It exchanges the authorization code for tokens, verifies the user,
 * and saves the tokens to the user's document in the database.
 */
exports.handleCallback = catchAsync(async (req, res, next) => {
  const { code, state } = req.query;

  // 1) Security check: Ensure the 'state' parameter matches the logged-in user's ID
  if (state !== req.user.id) {
    return next(new AppError('Invalid state parameter. Cross-site request forgery detected.', 400));
  }

  // 2) Exchange the authorization code for tokens
  const tokens = await googleService.getTokens(code);

  // 3) Find the user and save the tokens to their record
  const user = await User.findById(req.user.id);
  if (!user) {
    return next(new AppError('User not found.', 404));
  }

  user.googleAccessToken = tokens.access_token;
  user.googleRefreshToken = tokens.refresh_token;
  if (tokens.expiry_date) {
    user.googleTokenExpiryDate = new Date(tokens.expiry_date);
  }

  await user.save({ validateBeforeSave: false }); // Bypass password validation etc.

  // 4) Redirect the user back to the frontend application (URL from env vars)
  // In a real app, you would redirect to a settings page.
  res.status(200).json({
    status: 'success',
    message: 'Google Calendar integration successful!',
  });
});
