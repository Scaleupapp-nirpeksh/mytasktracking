// src/api/controllers/googleController.js

const User = require('../models/userModel');
const googleService = require('../../services/googleCalendarService');
const catchAsync = require('../../utils/catchAsync');
const AppError = require('../../utils/appError');
const logger = require('../../utils/logger');

/**
 * Initiates the Google OAuth 2.0 authorization process.
 */
exports.getAuthUrl = catchAsync(async (req, res, next) => {
  // Validate configuration before generating URL
  try {
    googleService.validateConfiguration();
  } catch (error) {
    logger.error('Google OAuth configuration error:', error.message);
    return next(new AppError('Google Calendar integration is not properly configured', 500));
  }

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
 */
exports.handleCallback = catchAsync(async (req, res, next) => {
  const { code, state, error: oauthError, error_description } = req.query;

  logger.info('OAuth callback received:', {
    hasCode: !!code,
    hasState: !!state,
    hasError: !!oauthError,
    userId: req.user?.id
  });

  // 1) Check if user denied access or other OAuth error occurred
  if (oauthError) {
    logger.warn('OAuth error received:', { error: oauthError, description: error_description });
    
    const errorMessages = {
      'access_denied': 'User denied access to Google Calendar',
      'invalid_request': 'Invalid OAuth request parameters',
      'unauthorized_client': 'Client not authorized for this request',
      'unsupported_response_type': 'Unsupported response type',
      'invalid_scope': 'Invalid or unsupported scope',
      'server_error': 'Google server error occurred',
      'temporarily_unavailable': 'Google service temporarily unavailable'
    };

    const message = errorMessages[oauthError] || `OAuth error: ${oauthError}`;
    return next(new AppError(message, 400));
  }

  // 2) Validate required parameters
  if (!code) {
    return next(new AppError('Authorization code not provided by Google', 400));
  }

  if (!state) {
    return next(new AppError('State parameter not provided by Google', 400));
  }

  // 3) Security check: Ensure the 'state' parameter matches the logged-in user's ID
  if (state !== req.user.id) {
    logger.warn('State parameter mismatch:', {
      expected: req.user.id,
      received: state
    });
    return next(new AppError('Invalid state parameter. Please try the authorization process again.', 400));
  }

  try {
    // 4) Exchange the authorization code for tokens
    logger.info('Exchanging authorization code for tokens');
    const tokens = await googleService.getTokens(code);

    // 5) Validate tokens
    if (!tokens.access_token) {
      throw new Error('No access token received from Google');
    }

    // 6) Find the user and save the tokens to their record
    const user = await User.findById(req.user.id);
    if (!user) {
      return next(new AppError('User not found.', 404));
    }

    // Update user with tokens
    user.googleAccessToken = tokens.access_token;
    if (tokens.refresh_token) {
      user.googleRefreshToken = tokens.refresh_token;
    }
    if (tokens.expiry_date) {
      user.googleTokenExpiryDate = new Date(tokens.expiry_date);
    }

    await user.save({ validateBeforeSave: false });

    logger.info(`Google Calendar integration successful for user: ${user.email}`);

    // 7) Return success response
    res.status(200).json({
      status: 'success',
      message: 'Google Calendar integration successful!',
      data: {
        hasRefreshToken: !!tokens.refresh_token,
        expiryDate: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null
      }
    });

  } catch (error) {
    logger.error('Token exchange or user update failed:', {
      error: error.message,
      stack: error.stack,
      userId: req.user.id
    });

    // Provide specific error messages based on the error type
    if (error.message.includes('invalid_grant')) {
      return next(new AppError('Authorization code expired or invalid. Please try again.', 400));
    } else if (error.message.includes('redirect_uri_mismatch')) {
      return next(new AppError('Configuration error: redirect URI mismatch. Please contact support.', 500));
    } else if (error.message.includes('invalid_client')) {
      return next(new AppError('Configuration error: invalid client credentials. Please contact support.', 500));
    }

    return next(new AppError('Failed to connect Google Calendar. Please try again.', 500));
  }
});

/**
 * Disconnect Google Calendar integration
 */
exports.disconnectGoogle = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.user.id);
  if (!user) {
    return next(new AppError('User not found.', 404));
  }

  // Clear Google tokens
  user.googleAccessToken = null;
  user.googleRefreshToken = null;
  user.googleTokenExpiryDate = null;

  await user.save({ validateBeforeSave: false });

  logger.info(`Google Calendar integration disconnected for user: ${user.email}`);

  res.status(200).json({
    status: 'success',
    message: 'Google Calendar integration disconnected successfully!'
  });
});

/**
 * Get Google Calendar integration status
 */
exports.getIntegrationStatus = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.user.id).select('+googleRefreshToken +googleTokenExpiryDate');
  
  const isConnected = !!(user.googleRefreshToken);
  const tokenExpiry = user.googleTokenExpiryDate;
  const isTokenExpired = tokenExpiry ? new Date() > tokenExpiry : false;

  res.status(200).json({
    status: 'success',
    data: {
      isConnected,
      tokenExpiry: tokenExpiry ? tokenExpiry.toISOString() : null,
      isTokenExpired,
      needsReauthorization: isConnected && isTokenExpired
    }
  });
});