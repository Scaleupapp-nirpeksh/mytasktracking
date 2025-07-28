/**
 * Authentication Middleware
 * 
 * JWT-based authentication system with comprehensive security features:
 * - Token validation and verification
 * - User authentication and session management
 * - Security logging and threat detection
 * - Rate limiting for authentication attempts
 * - Multi-workspace context handling
 * 
 * @author Nirpeksh Scale Up App
 * @version 1.0.0
 */

const jwt = require('jsonwebtoken');
const { promisify } = require('util');
const User = require('../../models/user/User');
const Workspace = require('../../models/workspace/Workspace');
const { 
  AuthenticationError, 
  AuthorizationError,
  AppError,
  catchAsync 
} = require('../error');
const { authLogger, securityLogger } = require('../../utils/logger/logger');

/**
 * Extract JWT token from request headers or cookies
 */
const extractToken = (req) => {
  let token;
  
  // Check Authorization header (Bearer token)
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }
  
  // Check cookie (if using cookie-based authentication)
  else if (req.cookies && req.cookies.jwt) {
    token = req.cookies.jwt;
  }
  
  // Check custom header
  else if (req.headers['x-auth-token']) {
    token = req.headers['x-auth-token'];
  }
  
  return token;
};

/**
 * Get client IP address (works with proxies and load balancers)
 */
const getClientIP = (req) => {
  return req.ip || 
         req.connection.remoteAddress || 
         req.socket.remoteAddress ||
         (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
         req.headers['x-forwarded-for']?.split(',')[0] ||
         req.headers['x-real-ip'] ||
         'unknown';
};

/**
 * Main authentication middleware
 * Verifies JWT token and attaches user to request object
 */
const authenticate = catchAsync(async (req, res, next) => {
  const startTime = Date.now();
  
  try {
    // 1) Get token from request
    const token = extractToken(req);
    
    if (!token) {
      authLogger.warn('Authentication failed: No token provided', {
        ip: getClientIP(req),
        userAgent: req.get('User-Agent'),
        path: req.originalUrl,
        method: req.method
      });
      
      return next(new AuthenticationError('You are not logged in! Please log in to get access.'));
    }

    // 2) Verify token
    let decoded;
    try {
      decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);
    } catch (error) {
      let errorMessage = 'Invalid token. Please log in again!';
      
      if (error.name === 'TokenExpiredError') {
        errorMessage = 'Your token has expired! Please log in again.';
      } else if (error.name === 'JsonWebTokenError') {
        errorMessage = 'Invalid token. Please log in again!';
      }
      
      authLogger.warn('Token verification failed', {
        error: error.message,
        ip: getClientIP(req),
        userAgent: req.get('User-Agent'),
        path: req.originalUrl,
        method: req.method
      });
      
      return next(new AuthenticationError(errorMessage));
    }

    // 3) Check if user still exists
    const currentUser = await User.findById(decoded.id).select('+passwordChangedAt');
    
    if (!currentUser) {
      authLogger.warn('Authentication failed: User no longer exists', {
        userId: decoded.id,
        ip: getClientIP(req),
        userAgent: req.get('User-Agent'),
        path: req.originalUrl
      });
      
      return next(new AuthenticationError('The user belonging to this token does no longer exist.'));
    }

    // 4) Check if user is active
    if (!currentUser.isActive) {
      authLogger.warn('Authentication failed: User account is deactivated', {
        userId: currentUser.id,
        email: currentUser.email,
        ip: getClientIP(req)
      });
      
      return next(new AuthenticationError('Your account has been deactivated. Please contact support.'));
    }

    // 5) Check if user is locked
    if (currentUser.isLocked) {
      const lockTime = Math.ceil((currentUser.lockUntil - Date.now()) / (1000 * 60)); // minutes
      
      securityLogger.warn('Authentication attempt on locked account', {
        userId: currentUser.id,
        email: currentUser.email,
        ip: getClientIP(req),
        lockTimeRemaining: `${lockTime} minutes`
      });
      
      return next(new AuthenticationError(`Account is locked. Try again in ${lockTime} minutes.`));
    }

    // 6) Check if email is verified (if required)
    if (process.env.ENABLE_EMAIL_VERIFICATION === 'true' && !currentUser.isEmailVerified) {
      authLogger.warn('Authentication failed: Email not verified', {
        userId: currentUser.id,
        email: currentUser.email,
        ip: getClientIP(req)
      });
      
      return next(new AuthenticationError('Please verify your email address before accessing your account.'));
    }

    // 7) Check if user changed password after the token was issued
    if (currentUser.changedPasswordAfter(decoded.iat)) {
      authLogger.info('Authentication failed: Password changed after token issuance', {
        userId: currentUser.id,
        email: currentUser.email,
        tokenIssuedAt: new Date(decoded.iat * 1000),
        passwordChangedAt: currentUser.passwordChangedAt
      });
      
      return next(new AuthenticationError('User recently changed password! Please log in again.'));
    }

    // 8) Update user's last activity and login information
    const clientIP = getClientIP(req);
    const userAgent = req.get('User-Agent');
    
    // Update last activity (don't await to avoid slowing down the request)
    User.findByIdAndUpdate(currentUser.id, {
      lastActiveAt: new Date(),
      lastLoginIP: clientIP
    }, { new: false }).catch(error => {
      authLogger.error('Failed to update user last activity', {
        userId: currentUser.id,
        error: error.message
      });
    });

    // 9) Attach user to request object
    req.user = currentUser;
    req.authToken = token;
    req.clientIP = clientIP;

    // 10) Log successful authentication
    const duration = Date.now() - startTime;
    authLogger.info('User authenticated successfully', {
      userId: currentUser.id,
      email: currentUser.email,
      ip: clientIP,
      userAgent,
      path: req.originalUrl,
      method: req.method,
      duration: `${duration}ms`
    });

    next();

  } catch (error) {
    authLogger.error('Authentication middleware error', {
      error: error.message,
      stack: error.stack,
      ip: getClientIP(req),
      path: req.originalUrl
    });
    
    return next(new AuthenticationError('Authentication failed. Please try again.'));
  }
});

/**
 * Optional authentication middleware
 * Authenticates user if token is present, but doesn't require it
 */
const optionalAuthenticate = catchAsync(async (req, res, next) => {
  const token = extractToken(req);
  
  if (!token) {
    return next(); // Continue without authentication
  }
  
  try {
    const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);
    const currentUser = await User.findById(decoded.id).select('+passwordChangedAt');
    
    if (currentUser && currentUser.isActive && !currentUser.isLocked) {
      req.user = currentUser;
      req.authToken = token;
      req.clientIP = getClientIP(req);
      
      // Update last activity
      User.findByIdAndUpdate(currentUser.id, {
        lastActiveAt: new Date()
      }, { new: false }).catch(() => {}); // Ignore errors
    }
  } catch (error) {
    // Log the error but continue without authentication
    authLogger.debug('Optional authentication failed', {
      error: error.message,
      ip: getClientIP(req)
    });
  }
  
  next();
});

/**
 * Workspace context middleware
 * Extracts workspace information and validates user access
 */
const workspaceContext = catchAsync(async (req, res, next) => {
  let workspaceId = null;
  
  // Extract workspace ID from different sources
  if (req.params.workspaceId) {
    workspaceId = req.params.workspaceId;
  } else if (req.body.workspaceId) {
    workspaceId = req.body.workspaceId;
  } else if (req.query.workspaceId) {
    workspaceId = req.query.workspaceId;
  } else if (req.headers['x-workspace-id']) {
    workspaceId = req.headers['x-workspace-id'];
  }
  
  if (!workspaceId) {
    return next(); // Continue without workspace context
  }
  
  try {
    // Find workspace and verify user access
    const workspace = await Workspace.findById(workspaceId);
    
    if (!workspace) {
      return next(new AppError('Workspace not found', 404));
    }
    
    if (!workspace.isActive || workspace.isArchived) {
      return next(new AppError('Workspace is not accessible', 403));
    }
    
    // Check if user has access to workspace
    const hasAccess = workspace.owner.toString() === req.user.id ||
                     workspace.members.some(member => 
                       member.user.toString() === req.user.id && 
                       member.status === 'active'
                     );
    
    if (!hasAccess) {
      securityLogger.warn('Unauthorized workspace access attempt', {
        userId: req.user.id,
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        ip: req.clientIP
      });
      
      return next(new AuthorizationError('You do not have access to this workspace'));
    }
    
    // Find user's role in workspace
    let userRole = 'viewer';
    let userPermissions = {};
    
    if (workspace.owner.toString() === req.user.id) {
      userRole = 'owner';
      userPermissions = workspace.getPermissionsByRole('owner');
    } else {
      const memberInfo = workspace.members.find(member => 
        member.user.toString() === req.user.id && member.status === 'active'
      );
      
      if (memberInfo) {
        userRole = memberInfo.role;
        userPermissions = memberInfo.permissions;
      }
    }
    
    // Attach workspace context to request
    req.workspace = workspace;
    req.userRole = userRole;
    req.userPermissions = userPermissions;
    
    authLogger.debug('Workspace context established', {
      userId: req.user.id,
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      userRole
    });
    
  } catch (error) {
    authLogger.error('Workspace context middleware error', {
      error: error.message,
      workspaceId,
      userId: req.user?.id
    });
    
    return next(new AppError('Error establishing workspace context', 500));
  }
  
  next();
});

/**
 * Require workspace context middleware
 * Ensures that a valid workspace context is established
 */
const requireWorkspace = (req, res, next) => {
  if (!req.workspace) {
    return next(new AppError('Workspace context is required for this operation', 400));
  }
  next();
};

/**
 * Admin-only access middleware
 * Ensures user has admin or owner role in current workspace
 */
const requireAdmin = (req, res, next) => {
  if (!req.userRole || !['admin', 'owner'].includes(req.userRole)) {
    securityLogger.warn('Admin access denied', {
      userId: req.user.id,
      workspaceId: req.workspace?.id,
      userRole: req.userRole,
      path: req.originalUrl
    });
    
    return next(new AuthorizationError('Admin access required'));
  }
  next();
};

/**
 * Owner-only access middleware
 * Ensures user is the workspace owner
 */
const requireOwner = (req, res, next) => {
  if (!req.userRole || req.userRole !== 'owner') {
    securityLogger.warn('Owner access denied', {
      userId: req.user.id,
      workspaceId: req.workspace?.id,
      userRole: req.userRole,
      path: req.originalUrl
    });
    
    return next(new AuthorizationError('Owner access required'));
  }
  next();
};

/**
 * Permission-based access middleware factory
 * Returns middleware that checks for specific permissions
 */
const requirePermission = (permission) => {
  return (req, res, next) => {
    if (!req.userPermissions || !req.userPermissions[permission]) {
      securityLogger.warn('Permission denied', {
        userId: req.user.id,
        workspaceId: req.workspace?.id,
        requiredPermission: permission,
        userPermissions: req.userPermissions,
        path: req.originalUrl
      });
      
      return next(new AuthorizationError(`Permission required: ${permission}`));
    }
    next();
  };
};

/**
 * Generate JWT token for user
 */
const generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '7d',
    issuer: 'task-tracker-api',
    audience: 'task-tracker-app'
  });
};

/**
 * Generate refresh token
 */
const generateRefreshToken = (userId) => {
  return jwt.sign({ id: userId, type: 'refresh' }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRE || '30d',
    issuer: 'task-tracker-api',
    audience: 'task-tracker-app'
  });
};

module.exports = {
  authenticate,
  optionalAuthenticate,
  workspaceContext,
  requireWorkspace,
  requireAdmin,
  requireOwner,
  requirePermission,
  generateToken,
  generateRefreshToken,
  extractToken,
  getClientIP
};