/**
 * Authentication Routes
 * 
 * Express routes for authentication endpoints:
 * - User registration and login
 * - Password reset and email verification
 * - Token management and user profile
 * - Security middleware integration
 * 
 * @author Nirpeksh Scale Up App
 * @version 1.0.0
 */

const express = require('express');
const rateLimit = require('express-rate-limit');

// Import controllers
const authController = require('../../controllers/auth/authController');

// Import middleware
const { authenticate, optionalAuthenticate } = require('../../middleware/auth/authenticate');
const { catchAsync } = require('../../middleware/error');

// Create router
const router = express.Router();

/**
 * Rate limiting configurations for different endpoints
 */

// General auth rate limiting (more restrictive)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: {
    status: 'error',
    message: 'Too many authentication attempts, please try again later',
    retryAfter: 900 // 15 minutes in seconds
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Don't count successful requests
  keyGenerator: (req) => {
    // Rate limit by IP and email combination for login/register
    return `${req.ip}-${req.body.email || 'no-email'}`;
  }
});

// Password reset rate limiting (very restrictive)
const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 attempts per hour
  message: {
    status: 'error',
    message: 'Too many password reset attempts, please try again later',
    retryAfter: 3600 // 1 hour in seconds
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return `pwd-reset-${req.ip}-${req.body.email || 'no-email'}`;
  }
});

// Email verification rate limiting
const emailVerificationLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 3, // 3 attempts per 10 minutes
  message: {
    status: 'error',
    message: 'Too many verification attempts, please try again later',
    retryAfter: 600 // 10 minutes in seconds
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Profile update rate limiting
const profileUpdateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 updates per 15 minutes
  message: {
    status: 'error',
    message: 'Too many profile updates, please try again later',
    retryAfter: 900
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Input validation middleware (basic)
 */
const validateEmail = (req, res, next) => {
  const { email } = req.body;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({
      status: 'fail',
      message: 'Please provide a valid email address'
    });
  }
  next();
};

const validatePassword = (req, res, next) => {
  const { password } = req.body;
  if (password && password.length < 8) {
    return res.status(400).json({
      status: 'fail',
      message: 'Password must be at least 8 characters long'
    });
  }
  next();
};

/**
 * Public Routes (No authentication required)
 */

// @route   POST /api/auth/register
// @desc    Register a new user
// @access  Public
router.post(
  '/register',
  authLimiter,
  validateEmail,
  validatePassword,
  authController.register
);

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
router.post(
  '/login',
  authLimiter,
  validateEmail,
  authController.login
);

// @route   POST /api/auth/refresh
// @desc    Refresh access token
// @access  Public
router.post('/refresh', authController.refreshToken);

// @route   POST /api/auth/forgot-password
// @desc    Request password reset
// @access  Public
router.post(
  '/forgot-password',
  passwordResetLimiter,
  validateEmail,
  authController.forgotPassword
);

// @route   PATCH /api/auth/reset-password/:token
// @desc    Reset password with token
// @access  Public
router.patch(
  '/reset-password/:token',
  validatePassword,
  authController.resetPassword
);

// @route   GET /api/auth/verify-email/:token
// @desc    Verify email address
// @access  Public
router.get(
  '/verify-email/:token',
  emailVerificationLimiter,
  authController.verifyEmail
);

// @route   GET /api/auth/status
// @desc    Check authentication status
// @access  Public (but returns user info if authenticated)
router.get('/status', optionalAuthenticate, authController.checkAuthStatus);

/**
 * Protected Routes (Authentication required)
 */

// @route   POST /api/auth/logout
// @desc    Logout user
// @access  Private
router.post('/logout', authenticate, authController.logout);

// @route   GET /api/auth/me
// @desc    Get current user information
// @access  Private
router.get('/me', authenticate, authController.getMe);

// @route   PATCH /api/auth/profile
// @desc    Update user profile
// @access  Private
router.patch(
  '/profile',
  authenticate,
  profileUpdateLimiter,
  authController.updateProfile
);

// @route   PATCH /api/auth/change-password
// @desc    Change password
// @access  Private
router.patch(
  '/change-password',
  authenticate,
  authLimiter,
  validatePassword,
  authController.changePassword
);

// @route   POST /api/auth/resend-verification
// @desc    Resend email verification
// @access  Private
router.post(
  '/resend-verification',
  authenticate,
  emailVerificationLimiter,
  authController.resendVerification
);

/**
 * Development/Testing Routes (only available in development)
 */
if (process.env.NODE_ENV === 'development') {
  // @route   GET /api/auth/dev/test-token
  // @desc    Test token validation (development only)
  // @access  Private
  router.get('/dev/test-token', authenticate, (req, res) => {
    res.json({
      status: 'success',
      message: 'Token is valid',
      data: {
        user: req.user,
        tokenInfo: {
          issuedAt: new Date(req.user.iat * 1000),
          expiresAt: new Date(req.user.exp * 1000)
        }
      }
    });
  });

  // @route   GET /api/auth/dev/debug
  // @desc    Debug authentication information
  // @access  Public
  router.get('/dev/debug', optionalAuthenticate, (req, res) => {
    res.json({
      status: 'success',
      data: {
        isAuthenticated: !!req.user,
        headers: {
          authorization: req.headers.authorization,
          'x-auth-token': req.headers['x-auth-token']
        },
        cookies: req.cookies,
        user: req.user ? {
          id: req.user.id,
          email: req.user.email,
          isEmailVerified: req.user.isEmailVerified
        } : null
      }
    });
  });
}

/**
 * Route documentation endpoint
 */
router.get('/', (req, res) => {
  const routes = {
    public: {
      'POST /register': 'Register a new user account',
      'POST /login': 'Login with email and password',
      'POST /refresh': 'Refresh access token using refresh token',
      'POST /forgot-password': 'Request password reset email',
      'PATCH /reset-password/:token': 'Reset password using reset token',
      'GET /verify-email/:token': 'Verify email address using verification token',
      'GET /status': 'Check authentication status'
    },
    protected: {
      'POST /logout': 'Logout and clear tokens',
      'GET /me': 'Get current user information',
      'PATCH /profile': 'Update user profile',
      'PATCH /change-password': 'Change user password',
      'POST /resend-verification': 'Resend email verification'
    },
    ratelimits: {
      'auth operations': '5 attempts per 15 minutes',
      'password reset': '3 attempts per hour',
      'email verification': '3 attempts per 10 minutes',
      'profile updates': '10 updates per 15 minutes'
    }
  };

  if (process.env.NODE_ENV === 'development') {
    routes.development = {
      'GET /dev/test-token': 'Test token validation',
      'GET /dev/debug': 'Debug authentication information'
    };
  }

  res.json({
    status: 'success',
    message: 'Authentication API endpoints',
    data: routes
  });
});

/**
 * Error handling for undefined routes
 */
router.use('*', (req, res) => {
  res.status(404).json({
    status: 'fail',
    message: `Authentication endpoint ${req.originalUrl} not found`,
    availableEndpoints: [
      'POST /api/auth/register',
      'POST /api/auth/login',
      'POST /api/auth/refresh',
      'POST /api/auth/logout',
      'GET /api/auth/me',
      'PATCH /api/auth/profile',
      'PATCH /api/auth/change-password',
      'POST /api/auth/forgot-password',
      'PATCH /api/auth/reset-password/:token',
      'GET /api/auth/verify-email/:token',
      'POST /api/auth/resend-verification',
      'GET /api/auth/status'
    ]
  });
});

module.exports = router;