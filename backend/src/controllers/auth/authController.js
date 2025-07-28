/**
 * Authentication Controller
 * 
 * HTTP request handlers for authentication endpoints:
 * - User registration and login
 * - Password reset and email verification
 * - Token refresh and logout
 * - Account management operations
 * - Security and audit logging
 * 
 * @author Nirpeksh Scale Up App
 * @version 1.0.0
 */

const authService = require('../../services/auth/authService');
const { catchAsync } = require('../../middleware/error');
const { authLogger } = require('../../utils/logger/logger');

/**
 * Set authentication cookies
 */
const setAuthCookies = (res, accessToken, refreshToken) => {
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/'
  };

  // Set access token cookie (shorter expiry)
  res.cookie('accessToken', accessToken, {
    ...cookieOptions,
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  });

  // Set refresh token cookie (longer expiry)
  res.cookie('refreshToken', refreshToken, {
    ...cookieOptions,
    maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
  });
};

/**
 * Clear authentication cookies
 */
const clearAuthCookies = (res) => {
  res.clearCookie('accessToken');
  res.clearCookie('refreshToken');
};

/**
 * Get client information from request
 */
const getClientInfo = (req) => {
  return {
    ip: req.ip || req.connection.remoteAddress || 'unknown',
    userAgent: req.get('User-Agent') || 'unknown'
  };
};

/**
 * @desc    Register a new user
 * @route   POST /api/auth/register
 * @access  Public
 */
const register = catchAsync(async (req, res) => {
  const { firstName, lastName, email, password } = req.body;
  const { ip, userAgent } = getClientInfo(req);

  // Input validation
  if (!firstName || !lastName || !email || !password) {
    return res.status(400).json({
      status: 'fail',
      message: 'Please provide all required fields: firstName, lastName, email, and password'
    });
  }

  // Register user through service
  const result = await authService.registerUser(
    { firstName, lastName, email, password },
    ip,
    userAgent
  );

  // Set authentication cookies
  setAuthCookies(res, result.accessToken, result.refreshToken);

  // Prepare response
  const response = {
    status: 'success',
    message: 'User registered successfully',
    data: {
      user: result.user,
      accessToken: result.accessToken
    }
  };

  if (result.requiresEmailVerification) {
    response.message = 'User registered successfully. Please check your email to verify your account.';
    response.data.requiresEmailVerification = true;
  }

  res.status(201).json(response);
});

/**
 * @desc    Login user
 * @route   POST /api/auth/login
 * @access  Public
 */
const login = catchAsync(async (req, res) => {
  const { email, password } = req.body;
  const { ip, userAgent } = getClientInfo(req);

  // Input validation
  if (!email || !password) {
    return res.status(400).json({
      status: 'fail',
      message: 'Please provide email and password'
    });
  }

  // Login user through service
  const result = await authService.loginUser(email, password, ip, userAgent);

  // Set authentication cookies
  setAuthCookies(res, result.accessToken, result.refreshToken);

  res.status(200).json({
    status: 'success',
    message: 'Logged in successfully',
    data: {
      user: result.user,
      accessToken: result.accessToken
    }
  });
});

/**
 * @desc    Refresh access token
 * @route   POST /api/auth/refresh
 * @access  Public
 */
const refreshToken = catchAsync(async (req, res) => {
  const { ip } = getClientInfo(req);
  
  // Get refresh token from cookies or body
  const refreshTokenValue = req.cookies.refreshToken || req.body.refreshToken;

  if (!refreshTokenValue) {
    return res.status(401).json({
      status: 'fail',
      message: 'Refresh token not provided'
    });
  }

  // Refresh token through service
  const result = await authService.refreshAccessToken(refreshTokenValue, ip);

  // Update access token cookie
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  };

  res.cookie('accessToken', result.accessToken, cookieOptions);

  res.status(200).json({
    status: 'success',
    message: 'Token refreshed successfully',
    data: {
      accessToken: result.accessToken,
      user: result.user
    }
  });
});

/**
 * @desc    Logout user
 * @route   POST /api/auth/logout
 * @access  Private
 */
const logout = catchAsync(async (req, res) => {
  // Clear authentication cookies
  clearAuthCookies(res);

  // Log logout event
  authLogger.info('User logged out', {
    userId: req.user?.id,
    email: req.user?.email,
    ip: req.ip
  });

  res.status(200).json({
    status: 'success',
    message: 'Logged out successfully'
  });
});

/**
 * @desc    Get current user information
 * @route   GET /api/auth/me
 * @access  Private
 */
const getMe = catchAsync(async (req, res) => {
  // User information is already attached by authentication middleware
  const user = req.user;

  res.status(200).json({
    status: 'success',
    data: {
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        fullName: user.fullName,
        email: user.email,
        username: user.username,
        avatar: user.avatar,
        bio: user.bio,
        phone: user.phone,
        timezone: user.timezone,
        dateFormat: user.dateFormat,
        timeFormat: user.timeFormat,
        preferences: user.preferences,
        isEmailVerified: user.isEmailVerified,
        lastLogin: user.lastLogin,
        createdAt: user.createdAt
      }
    }
  });
});

/**
 * @desc    Update user profile
 * @route   PATCH /api/auth/profile
 * @access  Private
 */
const updateProfile = catchAsync(async (req, res) => {
  const userId = req.user.id;
  const allowedFields = [
    'firstName', 'lastName', 'username', 'bio', 'phone', 'timezone',
    'dateFormat', 'timeFormat', 'preferences'
  ];

  // Filter allowed fields
  const updates = {};
  Object.keys(req.body).forEach(key => {
    if (allowedFields.includes(key)) {
      updates[key] = req.body[key];
    }
  });

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({
      status: 'fail',
      message: 'No valid fields provided for update'
    });
  }

  // Update user
  const User = require('../../models/user/User');
  const updatedUser = await User.findByIdAndUpdate(userId, updates, {
    new: true,
    runValidators: true
  });

  authLogger.info('User profile updated', {
    userId,
    updatedFields: Object.keys(updates),
    ip: req.ip
  });

  res.status(200).json({
    status: 'success',
    message: 'Profile updated successfully',
    data: {
      user: updatedUser
    }
  });
});

/**
 * @desc    Change password
 * @route   PATCH /api/auth/change-password
 * @access  Private
 */
const changePassword = catchAsync(async (req, res) => {
  const { currentPassword, newPassword, confirmPassword } = req.body;
  const { ip } = getClientInfo(req);

  // Input validation
  if (!currentPassword || !newPassword || !confirmPassword) {
    return res.status(400).json({
      status: 'fail',
      message: 'Please provide current password, new password, and confirmation'
    });
  }

  if (newPassword !== confirmPassword) {
    return res.status(400).json({
      status: 'fail',
      message: 'New password and confirmation do not match'
    });
  }

  if (newPassword.length < 8) {
    return res.status(400).json({
      status: 'fail',
      message: 'New password must be at least 8 characters long'
    });
  }

  // Change password through service
  const result = await authService.changePassword(
    req.user.id,
    currentPassword,
    newPassword,
    ip
  );

  res.status(200).json({
    status: 'success',
    message: result.message
  });
});

/**
 * @desc    Request password reset
 * @route   POST /api/auth/forgot-password
 * @access  Public
 */
const forgotPassword = catchAsync(async (req, res) => {
  const { email } = req.body;
  const { ip } = getClientInfo(req);

  if (!email) {
    return res.status(400).json({
      status: 'fail',
      message: 'Please provide email address'
    });
  }

  // Initiate password reset through service
  const result = await authService.initiatePasswordReset(email, ip);

  res.status(200).json({
    status: 'success',
    message: result.message
  });
});

/**
 * @desc    Reset password with token
 * @route   PATCH /api/auth/reset-password/:token
 * @access  Public
 */
const resetPassword = catchAsync(async (req, res) => {
  const { token } = req.params;
  const { password, confirmPassword } = req.body;
  const { ip } = getClientInfo(req);

  // Input validation
  if (!password || !confirmPassword) {
    return res.status(400).json({
      status: 'fail',
      message: 'Please provide password and confirmation'
    });
  }

  if (password !== confirmPassword) {
    return res.status(400).json({
      status: 'fail',
      message: 'Password and confirmation do not match'
    });
  }

  if (password.length < 8) {
    return res.status(400).json({
      status: 'fail',
      message: 'Password must be at least 8 characters long'
    });
  }

  // Reset password through service
  const result = await authService.resetPassword(token, password, ip);

  res.status(200).json({
    status: 'success',
    message: result.message
  });
});

/**
 * @desc    Verify email address
 * @route   GET /api/auth/verify-email/:token
 * @access  Public
 */
const verifyEmail = catchAsync(async (req, res) => {
  const { token } = req.params;
  const { ip } = getClientInfo(req);

  if (!token) {
    return res.status(400).json({
      status: 'fail',
      message: 'Verification token is required'
    });
  }

  // Verify email through service
  const result = await authService.verifyEmail(token, ip);

  res.status(200).json({
    status: 'success',
    message: result.message,
    data: {
      user: result.user
    }
  });
});

/**
 * @desc    Resend email verification
 * @route   POST /api/auth/resend-verification
 * @access  Private
 */
const resendVerification = catchAsync(async (req, res) => {
  const user = req.user;

  if (user.isEmailVerified) {
    return res.status(400).json({
      status: 'fail',
      message: 'Email is already verified'
    });
  }

  // Generate new verification token
  const User = require('../../models/user/User');
  const userData = await User.findById(user.id);
  const verificationToken = userData.createEmailVerificationToken();
  await userData.save({ validateBeforeSave: false });

  // Send verification email
  const emailService = require('../../services/email/emailService');
  try {
    await emailService.sendEmailVerification(
      user.email,
      user.firstName,
      verificationToken
    );

    authLogger.info('Verification email resent', {
      userId: user.id,
      email: user.email,
      ip: req.ip
    });

    res.status(200).json({
      status: 'success',
      message: 'Verification email sent successfully'
    });

  } catch (error) {
    // Reset verification token if email fails
    userData.emailVerificationToken = undefined;
    userData.emailVerificationExpires = undefined;
    await userData.save({ validateBeforeSave: false });

    authLogger.error('Failed to resend verification email', {
      userId: user.id,
      email: user.email,
      error: error.message
    });

    res.status(500).json({
      status: 'error',
      message: 'Failed to send verification email. Please try again.'
    });
  }
});

/**
 * @desc    Check authentication status
 * @route   GET /api/auth/status
 * @access  Public (but will return user info if authenticated)
 */
const checkAuthStatus = catchAsync(async (req, res) => {
  // This route uses optional authentication middleware
  const isAuthenticated = !!req.user;

  const response = {
    status: 'success',
    data: {
      isAuthenticated,
      user: isAuthenticated ? {
        id: req.user.id,
        firstName: req.user.firstName,
        lastName: req.user.lastName,
        email: req.user.email,
        isEmailVerified: req.user.isEmailVerified
      } : null
    }
  };

  res.status(200).json(response);
});

module.exports = {
  register,
  login,
  refreshToken,
  logout,
  getMe,
  updateProfile,
  changePassword,
  forgotPassword,
  resetPassword,
  verifyEmail,
  resendVerification,
  checkAuthStatus
};