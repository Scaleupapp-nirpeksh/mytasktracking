/**
 * Authentication Service
 * 
 * Core authentication business logic:
 * - User registration and login
 * - Password reset and email verification
 * - Token management and refresh
 * - Account security and lockout handling
 * - Two-factor authentication support
 * 
 * @author Nirpeksh Scale Up App
 * @version 1.0.0
 */

const crypto = require('crypto');
const { promisify } = require('util');
const jwt = require('jsonwebtoken');
const User = require('../../models/user/User');
const Workspace = require('../../models/workspace/Workspace');
const { 
  AuthenticationError,
  ValidationError,
  AppError 
} = require('../../middleware/error');
const { authLogger, securityLogger } = require('../../utils/logger/logger');
const emailService = require('../email/emailService');

/**
 * Generate JWT access token
 */
const generateAccessToken = (userId) => {
  return jwt.sign(
    { 
      id: userId,
      type: 'access',
      iat: Math.floor(Date.now() / 1000)
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRE || '7d',
      issuer: 'task-tracker-api',
      audience: 'task-tracker-app'
    }
  );
};

/**
 * Generate JWT refresh token
 */
const generateRefreshToken = (userId) => {
  return jwt.sign(
    { 
      id: userId,
      type: 'refresh',
      iat: Math.floor(Date.now() / 1000)
    },
    process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_REFRESH_EXPIRE || '30d',
      issuer: 'task-tracker-api',
      audience: 'task-tracker-app'
    }
  );
};

/**
 * Generate secure tokens for password reset and email verification
 */
const generateSecureToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

/**
 * Hash a token for storage in database
 */
const hashToken = (token) => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

/**
 * Create default workspaces for new user
 */
const createDefaultWorkspaces = async (userId, userEmail) => {
  try {
    const workspaces = [];
    
    // Create Personal workspace
    const personalWorkspace = new Workspace({
      name: 'Personal',
      description: 'Your personal task workspace',
      type: 'personal',
      color: '#3B82F6',
      icon: 'user',
      owner: userId,
      members: [{
        user: userId,
        role: 'owner',
        permissions: {
          canCreateTasks: true,
          canEditTasks: true,
          canDeleteTasks: true,
          canManageMembers: true,
          canManageSettings: true,
          canViewReports: true,
          canExportData: true
        }
      }],
      settings: {
        isPrivate: true,
        allowInvites: false,
        taskNumbering: {
          prefix: 'PER'
        }
      },
      categories: [
        { name: 'General', isDefault: true },
        { name: 'Health & Fitness', color: '#10B981' },
        { name: 'Learning', color: '#8B5CF6' },
        { name: 'Finance', color: '#F59E0B' },
        { name: 'Home', color: '#EF4444' }
      ],
      tags: [
        { name: 'important', color: '#EF4444' },
        { name: 'urgent', color: '#F59E0B' },
        { name: 'personal', color: '#3B82F6' }
      ]
    });
    
    workspaces.push(await personalWorkspace.save());
    
    // Create Business workspace
    const businessWorkspace = new Workspace({
      name: 'Business',
      description: 'Your business and entrepreneurial tasks',
      type: 'business',
      color: '#10B981',
      icon: 'briefcase',
      owner: userId,
      members: [{
        user: userId,
        role: 'owner',
        permissions: {
          canCreateTasks: true,
          canEditTasks: true,
          canDeleteTasks: true,
          canManageMembers: true,
          canManageSettings: true,
          canViewReports: true,
          canExportData: true
        }
      }],
      settings: {
        isPrivate: false,
        allowInvites: true,
        taskNumbering: {
          prefix: 'BIZ'
        }
      },
      categories: [
        { name: 'General', isDefault: true },
        { name: 'Marketing', color: '#EC4899' },
        { name: 'Development', color: '#3B82F6' },
        { name: 'Sales', color: '#10B981' },
        { name: 'Operations', color: '#F59E0B' }
      ],
      tags: [
        { name: 'revenue', color: '#10B981' },
        { name: 'growth', color: '#8B5CF6' },
        { name: 'client', color: '#3B82F6' }
      ]
    });
    
    workspaces.push(await businessWorkspace.save());
    
    // Create Company workspace (placeholder for when user joins a company)
    const companyWorkspace = new Workspace({
      name: 'Company',
      description: 'Your workplace and professional tasks',
      type: 'company',
      color: '#6B7280',
      icon: 'building',
      owner: userId,
      members: [{
        user: userId,
        role: 'owner',
        permissions: {
          canCreateTasks: true,
          canEditTasks: true,
          canDeleteTasks: true,
          canManageMembers: true,
          canManageSettings: true,
          canViewReports: true,
          canExportData: true
        }
      }],
      settings: {
        isPrivate: false,
        allowInvites: true,
        taskNumbering: {
          prefix: 'TASK'
        }
      },
      categories: [
        { name: 'General', isDefault: true },
        { name: 'Projects', color: '#3B82F6' },
        { name: 'Meetings', color: '#8B5CF6' },
        { name: 'Reports', color: '#10B981' },
        { name: 'Administration', color: '#F59E0B' }
      ],
      tags: [
        { name: 'key-task', color: '#EF4444' },
        { name: 'manager-review', color: '#F59E0B' },
        { name: 'deadline', color: '#8B5CF6' }
      ]
    });
    
    workspaces.push(await companyWorkspace.save());
    
    authLogger.info('Default workspaces created for user', {
      userId,
      workspaceCount: workspaces.length,
      workspaceNames: workspaces.map(w => w.name)
    });
    
    return workspaces;
    
  } catch (error) {
    authLogger.error('Failed to create default workspaces', {
      userId,
      error: error.message
    });
    throw new AppError('Failed to create default workspaces', 500);
  }
};

/**
 * Register a new user
 */
const registerUser = async (userData, clientIP, userAgent) => {
  try {
    const { firstName, lastName, email, password } = userData;
    
    // Check if user already exists
    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      authLogger.warn('Registration attempt with existing email', {
        email,
        ip: clientIP,
        userAgent
      });
      throw new ValidationError('User with this email already exists');
    }
    
    // Create new user
    const user = new User({
      firstName,
      lastName,
      email,
      password
    });
    
    // Generate email verification token if email verification is enabled
    if (process.env.ENABLE_EMAIL_VERIFICATION === 'true') {
      const verificationToken = user.createEmailVerificationToken();
      
      // Send verification email (don't wait for it)
      emailService.sendEmailVerification(user.email, user.firstName, verificationToken)
        .catch(error => {
          authLogger.error('Failed to send verification email', {
            userId: user.id,
            email: user.email,
            error: error.message
          });
        });
    } else {
      user.isEmailVerified = true;
    }
    
    await user.save();
    
    // Create default workspaces
    await createDefaultWorkspaces(user.id, user.email);
    
    // Generate tokens
    const accessToken = generateAccessToken(user.id);
    const refreshToken = generateRefreshToken(user.id);
    
    // Update user login information
    user.lastLogin = new Date();
    user.lastLoginIP = clientIP;
    await user.save({ validateBeforeSave: false });
    
    authLogger.info('User registered successfully', {
      userId: user.id,
      email: user.email,
      ip: clientIP,
      userAgent,
      emailVerificationRequired: process.env.ENABLE_EMAIL_VERIFICATION === 'true'
    });
    
    // Remove sensitive data
    user.password = undefined;
    
    return {
      user,
      accessToken,
      refreshToken,
      requiresEmailVerification: process.env.ENABLE_EMAIL_VERIFICATION === 'true' && !user.isEmailVerified
    };
    
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    
    authLogger.error('Registration failed', {
      email: userData.email,
      error: error.message,
      ip: clientIP
    });
    
    throw new AppError('Registration failed', 500);
  }
};

/**
 * Login user with email and password
 */
const loginUser = async (email, password, clientIP, userAgent) => {
  try {
    // Find user with password field
    const user = await User.findByEmail(email).select('+password +loginAttempts +lockUntil');
    
    if (!user) {
      authLogger.warn('Login attempt with non-existent email', {
        email,
        ip: clientIP,
        userAgent
      });
      throw new AuthenticationError('Invalid email or password');
    }
    
    // Check if account is locked
    if (user.isLocked) {
      const lockTime = Math.ceil((user.lockUntil - Date.now()) / (1000 * 60));
      
      securityLogger.warn('Login attempt on locked account', {
        userId: user.id,
        email: user.email,
        ip: clientIP,
        lockTimeRemaining: `${lockTime} minutes`
      });
      
      throw new AuthenticationError(`Account is locked. Try again in ${lockTime} minutes.`);
    }
    
    // Check if account is active
    if (!user.isActive) {
      authLogger.warn('Login attempt on inactive account', {
        userId: user.id,
        email: user.email,
        ip: clientIP
      });
      throw new AuthenticationError('Account has been deactivated');
    }
    
    // Verify password
    const isPasswordCorrect = await user.comparePassword(password);
    
    if (!isPasswordCorrect) {
      // Increment login attempts
      await user.incLoginAttempts();
      
      authLogger.warn('Failed login attempt - incorrect password', {
        userId: user.id,
        email: user.email,
        ip: clientIP,
        userAgent,
        attemptCount: user.loginAttempts + 1
      });
      
      throw new AuthenticationError('Invalid email or password');
    }
    
    // Check email verification if required
    if (process.env.ENABLE_EMAIL_VERIFICATION === 'true' && !user.isEmailVerified) {
      authLogger.warn('Login attempt with unverified email', {
        userId: user.id,
        email: user.email,
        ip: clientIP
      });
      throw new AuthenticationError('Please verify your email address before logging in');
    }
    
    // Reset login attempts on successful login
    if (user.loginAttempts > 0) {
      await user.resetLoginAttempts();
    }
    
    // Generate tokens
    const accessToken = generateAccessToken(user.id);
    const refreshToken = generateRefreshToken(user.id);
    
    // Update login information
    user.lastLogin = new Date();
    user.lastLoginIP = clientIP;
    await user.save({ validateBeforeSave: false });
    
    authLogger.info('User logged in successfully', {
      userId: user.id,
      email: user.email,
      ip: clientIP,
      userAgent
    });
    
    // Remove sensitive data
    user.password = undefined;
    user.loginAttempts = undefined;
    user.lockUntil = undefined;
    
    return {
      user,
      accessToken,
      refreshToken
    };
    
  } catch (error) {
    if (error instanceof AuthenticationError) {
      throw error;
    }
    
    authLogger.error('Login failed', {
      email,
      error: error.message,
      ip: clientIP
    });
    
    throw new AppError('Login failed', 500);
  }
};

/**
 * Refresh access token using refresh token
 */
const refreshAccessToken = async (refreshToken, clientIP) => {
  try {
    // Verify refresh token
    const decoded = await promisify(jwt.verify)(
      refreshToken, 
      process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET
    );
    
    if (decoded.type !== 'refresh') {
      throw new AuthenticationError('Invalid token type');
    }
    
    // Find user
    const user = await User.findById(decoded.id);
    
    if (!user || !user.isActive) {
      throw new AuthenticationError('User not found or inactive');
    }
    
    // Check if password was changed after token issue
    if (user.changedPasswordAfter(decoded.iat)) {
      throw new AuthenticationError('Password changed after token issuance');
    }
    
    // Generate new access token
    const newAccessToken = generateAccessToken(user.id);
    
    authLogger.info('Access token refreshed', {
      userId: user.id,
      ip: clientIP
    });
    
    return {
      accessToken: newAccessToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName
      }
    };
    
  } catch (error) {
    authLogger.warn('Token refresh failed', {
      error: error.message,
      ip: clientIP
    });
    
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      throw new AuthenticationError('Invalid or expired refresh token');
    }
    
    throw error;
  }
};

/**
 * Initiate password reset process
 */
const initiatePasswordReset = async (email, clientIP) => {
  try {
    const user = await User.findByEmail(email);
    
    if (!user) {
      // Don't reveal if email exists
      authLogger.warn('Password reset attempt for non-existent email', {
        email,
        ip: clientIP
      });
      return { message: 'If the email exists, a reset link will be sent' };
    }
    
    if (!user.isActive) {
      authLogger.warn('Password reset attempt for inactive account', {
        userId: user.id,
        email,
        ip: clientIP
      });
      return { message: 'If the email exists, a reset link will be sent' };
    }
    
    // Generate reset token
    const resetToken = user.createPasswordResetToken();
    await user.save({ validateBeforeSave: false });
    
    // Send reset email
    try {
      await emailService.sendPasswordReset(user.email, user.firstName, resetToken);
      
      authLogger.info('Password reset email sent', {
        userId: user.id,
        email: user.email,
        ip: clientIP
      });
      
    } catch (emailError) {
      // Reset the token if email fails
      user.passwordResetToken = undefined;
      user.passwordResetExpires = undefined;
      await user.save({ validateBeforeSave: false });
      
      authLogger.error('Failed to send password reset email', {
        userId: user.id,
        email: user.email,
        error: emailError.message
      });
      
      throw new AppError('Failed to send reset email. Please try again.', 500);
    }
    
    return { message: 'Password reset email sent successfully' };
    
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    
    authLogger.error('Password reset initiation failed', {
      email,
      error: error.message,
      ip: clientIP
    });
    
    throw new AppError('Failed to initiate password reset', 500);
  }
};

/**
 * Reset password using reset token
 */
const resetPassword = async (resetToken, newPassword, clientIP) => {
  try {
    // Hash the token to compare with stored hash
    const hashedToken = hashToken(resetToken);
    
    // Find user with valid reset token
    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() }
    });
    
    if (!user) {
      authLogger.warn('Password reset attempt with invalid token', {
        token: resetToken.substring(0, 8) + '...',
        ip: clientIP
      });
      throw new AuthenticationError('Invalid or expired reset token');
    }
    
    // Update password
    user.password = newPassword;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    user.passwordChangedAt = new Date();
    
    await user.save();
    
    authLogger.info('Password reset successfully', {
      userId: user.id,
      email: user.email,
      ip: clientIP
    });
    
    return { message: 'Password reset successfully' };
    
  } catch (error) {
    if (error instanceof AuthenticationError) {
      throw error;
    }
    
    authLogger.error('Password reset failed', {
      error: error.message,
      ip: clientIP
    });
    
    throw new AppError('Failed to reset password', 500);
  }
};

/**
 * Verify email address
 */
const verifyEmail = async (verificationToken, clientIP) => {
  try {
    const hashedToken = hashToken(verificationToken);
    
    const user = await User.findOne({
      emailVerificationToken: hashedToken,
      emailVerificationExpires: { $gt: Date.now() }
    });
    
    if (!user) {
      authLogger.warn('Email verification attempt with invalid token', {
        token: verificationToken.substring(0, 8) + '...',
        ip: clientIP
      });
      throw new AuthenticationError('Invalid or expired verification token');
    }
    
    // Mark email as verified
    user.isEmailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    
    await user.save({ validateBeforeSave: false });
    
    authLogger.info('Email verified successfully', {
      userId: user.id,
      email: user.email,
      ip: clientIP
    });
    
    return { 
      message: 'Email verified successfully',
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        isEmailVerified: true
      }
    };
    
  } catch (error) {
    if (error instanceof AuthenticationError) {
      throw error;
    }
    
    authLogger.error('Email verification failed', {
      error: error.message,
      ip: clientIP
    });
    
    throw new AppError('Failed to verify email', 500);
  }
};

/**
 * Change user password
 */
const changePassword = async (userId, currentPassword, newPassword, clientIP) => {
  try {
    const user = await User.findById(userId).select('+password');
    
    if (!user) {
      throw new AuthenticationError('User not found');
    }
    
    // Verify current password
    const isCurrentPasswordCorrect = await user.comparePassword(currentPassword);
    
    if (!isCurrentPasswordCorrect) {
      authLogger.warn('Password change attempt with incorrect current password', {
        userId,
        ip: clientIP
      });
      throw new AuthenticationError('Current password is incorrect');
    }
    
    // Update password
    user.password = newPassword;
    user.passwordChangedAt = new Date();
    
    await user.save();
    
    authLogger.info('Password changed successfully', {
      userId,
      ip: clientIP
    });
    
    return { message: 'Password changed successfully' };
    
  } catch (error) {
    if (error instanceof AuthenticationError) {
      throw error;
    }
    
    authLogger.error('Password change failed', {
      userId,
      error: error.message,
      ip: clientIP
    });
    
    throw new AppError('Failed to change password', 500);
  }
};

module.exports = {
  registerUser,
  loginUser,
  refreshAccessToken,
  initiatePasswordReset,
  resetPassword,
  verifyEmail,
  changePassword,
  generateAccessToken,
  generateRefreshToken,
  generateSecureToken,
  hashToken,
  createDefaultWorkspaces
};