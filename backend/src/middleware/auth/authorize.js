/**
 * Authorization Middleware
 * 
 * Role-based and permission-based authorization system:
 * - Granular permission checking
 * - Resource ownership validation
 * - Cross-workspace security enforcement
 * - Task-level access controls
 * - File access permissions
 * 
 * @author Nirpeksh Scale Up App
 * @version 1.0.0
 */

const Task = require('../../models/task/Task');
const FileAttachment = require('../../models/file/FileAttachment');
const Workspace = require('../../models/workspace/Workspace');
const { 
  AuthorizationError, 
  NotFoundError,
  AppError,
  catchAsync 
} = require('../error');
const { securityLogger } = require('../../utils/logger/logger');

/**
 * Check if user owns a resource
 */
const isResourceOwner = (resource, userId, ownerField = 'createdBy') => {
  if (!resource || !userId) return false;
  
  const ownerId = resource[ownerField];
  return ownerId && ownerId.toString() === userId.toString();
};

/**
 * Check if user has workspace-level permission
 */
const hasWorkspacePermission = (workspace, userId, permission) => {
  if (!workspace || !userId) return false;
  
  // Owner has all permissions
  if (workspace.owner.toString() === userId.toString()) {
    return true;
  }
  
  // Check member permissions
  const member = workspace.members.find(m => 
    m.user.toString() === userId.toString() && m.status === 'active'
  );
  
  return member && member.permissions[permission] === true;
};

/**
 * Log authorization events for security monitoring
 */
const logAuthorizationEvent = (event, req, resourceType, resourceId, success = false) => {
  const logLevel = success ? 'info' : 'warn';
  
  securityLogger[logLevel](`Authorization ${success ? 'granted' : 'denied'}: ${event}`, {
    userId: req.user?.id,
    email: req.user?.email,
    workspaceId: req.workspace?.id,
    resourceType,
    resourceId,
    userRole: req.userRole,
    ip: req.clientIP,
    userAgent: req.get('User-Agent'),
    path: req.originalUrl,
    method: req.method
  });
};

/**
 * Task Authorization Middleware
 */

// Check if user can view a task
const canViewTask = catchAsync(async (req, res, next) => {
  const taskId = req.params.taskId || req.params.id;
  
  if (!taskId) {
    return next(new AppError('Task ID is required', 400));
  }
  
  try {
    const task = await Task.findById(taskId).populate('workspace');
    
    if (!task) {
      logAuthorizationEvent('task_view', req, 'task', taskId, false);
      return next(new NotFoundError('Task not found'));
    }
    
    // Check if task belongs to user's accessible workspace
    const hasAccess = task.workspace.owner.toString() === req.user.id ||
                     task.workspace.members.some(member => 
                       member.user.toString() === req.user.id && 
                       member.status === 'active'
                     );
    
    if (!hasAccess) {
      logAuthorizationEvent('task_view', req, 'task', taskId, false);
      return next(new AuthorizationError('You do not have access to this task'));
    }
    
    // Attach task to request for use in controllers
    req.task = task;
    
    logAuthorizationEvent('task_view', req, 'task', taskId, true);
    next();
    
  } catch (error) {
    logAuthorizationEvent('task_view_error', req, 'task', taskId, false);
    return next(new AppError('Error checking task access', 500));
  }
});

// Check if user can edit a task
const canEditTask = catchAsync(async (req, res, next) => {
  const task = req.task; // Should be set by canViewTask middleware
  
  if (!task) {
    return next(new AppError('Task context not found', 500));
  }
  
  // Check workspace permissions
  if (!hasWorkspacePermission(task.workspace, req.user.id, 'canEditTasks')) {
    // Allow task owner to edit their own tasks even without workspace permission
    if (!isResourceOwner(task, req.user.id, 'createdBy') && 
        task.assignedTo?.toString() !== req.user.id) {
      logAuthorizationEvent('task_edit', req, 'task', task.id, false);
      return next(new AuthorizationError('You do not have permission to edit this task'));
    }
  }
  
  logAuthorizationEvent('task_edit', req, 'task', task.id, true);
  next();
});

// Check if user can delete a task
const canDeleteTask = catchAsync(async (req, res, next) => {
  const task = req.task; // Should be set by canViewTask middleware
  
  if (!task) {
    return next(new AppError('Task context not found', 500));
  }
  
  // Check workspace permissions
  if (!hasWorkspacePermission(task.workspace, req.user.id, 'canDeleteTasks')) {
    // Allow task owner to delete their own tasks
    if (!isResourceOwner(task, req.user.id, 'createdBy')) {
      logAuthorizationEvent('task_delete', req, 'task', task.id, false);
      return next(new AuthorizationError('You do not have permission to delete this task'));
    }
  }
  
  logAuthorizationEvent('task_delete', req, 'task', task.id, true);
  next();
});

// Check if user can assign tasks
const canAssignTask = catchAsync(async (req, res, next) => {
  const task = req.task; // Should be set by canViewTask middleware
  
  if (!task) {
    return next(new AppError('Task context not found', 500));
  }
  
  // Check workspace permissions or ownership
  if (!hasWorkspacePermission(task.workspace, req.user.id, 'canEditTasks') &&
      !isResourceOwner(task, req.user.id, 'createdBy')) {
    logAuthorizationEvent('task_assign', req, 'task', task.id, false);
    return next(new AuthorizationError('You do not have permission to assign this task'));
  }
  
  logAuthorizationEvent('task_assign', req, 'task', task.id, true);
  next();
});

/**
 * File Authorization Middleware
 */

// Check if user can view a file
const canViewFile = catchAsync(async (req, res, next) => {
  const fileId = req.params.fileId || req.params.id;
  
  if (!fileId) {
    return next(new AppError('File ID is required', 400));
  }
  
  try {
    const file = await FileAttachment.findById(fileId).populate('workspace');
    
    if (!file || file.isDeleted) {
      logAuthorizationEvent('file_view', req, 'file', fileId, false);
      return next(new NotFoundError('File not found'));
    }
    
    // Check file-specific permissions
    if (!file.hasPermission(req.user.id, 'canView')) {
      // Check workspace access as fallback
      const hasWorkspaceAccess = file.workspace.owner.toString() === req.user.id ||
                                file.workspace.members.some(member => 
                                  member.user.toString() === req.user.id && 
                                  member.status === 'active'
                                );
      
      if (!hasWorkspaceAccess) {
        logAuthorizationEvent('file_view', req, 'file', fileId, false);
        return next(new AuthorizationError('You do not have access to this file'));
      }
    }
    
    // Check if file is expired
    if (file.isExpired) {
      logAuthorizationEvent('file_view_expired', req, 'file', fileId, false);
      return next(new AuthorizationError('This file has expired and is no longer accessible'));
    }
    
    // Attach file to request
    req.file = file;
    
    logAuthorizationEvent('file_view', req, 'file', fileId, true);
    next();
    
  } catch (error) {
    logAuthorizationEvent('file_view_error', req, 'file', fileId, false);
    return next(new AppError('Error checking file access', 500));
  }
});

// Check if user can download a file
const canDownloadFile = catchAsync(async (req, res, next) => {
  const file = req.file; // Should be set by canViewFile middleware
  
  if (!file) {
    return next(new AppError('File context not found', 500));
  }
  
  // Check file-specific download permissions
  if (!file.hasPermission(req.user.id, 'canDownload')) {
    logAuthorizationEvent('file_download', req, 'file', file.id, false);
    return next(new AuthorizationError('You do not have permission to download this file'));
  }
  
  logAuthorizationEvent('file_download', req, 'file', file.id, true);
  next();
});

// Check if user can delete a file
const canDeleteFile = catchAsync(async (req, res, next) => {
  const file = req.file; // Should be set by canViewFile middleware
  
  if (!file) {
    return next(new AppError('File context not found', 500));
  }
  
  // Check file-specific delete permissions or ownership
  if (!file.hasPermission(req.user.id, 'canDelete') && 
      !isResourceOwner(file, req.user.id, 'uploadedBy')) {
    logAuthorizationEvent('file_delete', req, 'file', file.id, false);
    return next(new AuthorizationError('You do not have permission to delete this file'));
  }
  
  logAuthorizationEvent('file_delete', req, 'file', file.id, true);
  next();
});

/**
 * Workspace Authorization Middleware
 */

// Check if user can manage workspace members
const canManageMembers = catchAsync(async (req, res, next) => {
  const workspace = req.workspace;
  
  if (!workspace) {
    return next(new AppError('Workspace context required', 400));
  }
  
  if (!hasWorkspacePermission(workspace, req.user.id, 'canManageMembers')) {
    logAuthorizationEvent('workspace_manage_members', req, 'workspace', workspace.id, false);
    return next(new AuthorizationError('You do not have permission to manage members'));
  }
  
  logAuthorizationEvent('workspace_manage_members', req, 'workspace', workspace.id, true);
  next();
});

// Check if user can manage workspace settings
const canManageSettings = catchAsync(async (req, res, next) => {
  const workspace = req.workspace;
  
  if (!workspace) {
    return next(new AppError('Workspace context required', 400));
  }
  
  if (!hasWorkspacePermission(workspace, req.user.id, 'canManageSettings')) {
    logAuthorizationEvent('workspace_manage_settings', req, 'workspace', workspace.id, false);
    return next(new AuthorizationError('You do not have permission to manage settings'));
  }
  
  logAuthorizationEvent('workspace_manage_settings', req, 'workspace', workspace.id, true);
  next();
});

// Check if user can view reports
const canViewReports = catchAsync(async (req, res, next) => {
  const workspace = req.workspace;
  
  if (!workspace) {
    return next(new AppError('Workspace context required', 400));
  }
  
  if (!hasWorkspacePermission(workspace, req.user.id, 'canViewReports')) {
    logAuthorizationEvent('workspace_view_reports', req, 'workspace', workspace.id, false);
    return next(new AuthorizationError('You do not have permission to view reports'));
  }
  
  logAuthorizationEvent('workspace_view_reports', req, 'workspace', workspace.id, true);
  next();
});

// Check if user can export data
const canExportData = catchAsync(async (req, res, next) => {
  const workspace = req.workspace;
  
  if (!workspace) {
    return next(new AppError('Workspace context required', 400));
  }
  
  if (!hasWorkspacePermission(workspace, req.user.id, 'canExportData')) {
    logAuthorizationEvent('workspace_export_data', req, 'workspace', workspace.id, false);
    return next(new AuthorizationError('You do not have permission to export data'));
  }
  
  logAuthorizationEvent('workspace_export_data', req, 'workspace', workspace.id, true);
  next();
});

/**
 * Resource Ownership Middleware
 */

// Ensure user owns the resource or has admin privileges
const requireOwnershipOrAdmin = (resourceField = 'createdBy') => {
  return catchAsync(async (req, res, next) => {
    const resource = req.task || req.file || req.comment;
    
    if (!resource) {
      return next(new AppError('Resource context not found', 500));
    }
    
    // Check ownership
    if (isResourceOwner(resource, req.user.id, resourceField)) {
      return next();
    }
    
    // Check admin privileges
    if (req.userRole && ['admin', 'owner'].includes(req.userRole)) {
      return next();
    }
    
    logAuthorizationEvent('ownership_check', req, 'resource', resource.id, false);
    return next(new AuthorizationError('You can only access your own resources'));
  });
};

/**
 * Cross-workspace security check
 * Ensures that resources being accessed belong to the current workspace context
 */
const enforceWorkspaceIsolation = catchAsync(async (req, res, next) => {
  const resource = req.task || req.file;
  
  if (!resource || !req.workspace) {
    return next(); // Skip if no resource or workspace context
  }
  
  // Check if resource belongs to current workspace
  if (resource.workspace.toString() !== req.workspace.id) {
    securityLogger.error('Cross-workspace access attempt detected', {
      userId: req.user.id,
      currentWorkspace: req.workspace.id,
      resourceWorkspace: resource.workspace.toString(),
      resourceType: req.task ? 'task' : 'file',
      resourceId: resource.id,
      ip: req.clientIP
    });
    
    return next(new AuthorizationError('Resource does not belong to current workspace'));
  }
  
  next();
});

/**
 * Rate limiting for sensitive operations
 */
const rateLimitSensitiveOperations = (maxAttempts = 10, windowMs = 15 * 60 * 1000) => {
  const attempts = new Map();
  
  return catchAsync(async (req, res, next) => {
    const key = `${req.user.id}:${req.originalUrl}`;
    const now = Date.now();
    
    // Clean up old entries
    for (const [k, v] of attempts.entries()) {
      if (now - v.firstAttempt > windowMs) {
        attempts.delete(k);
      }
    }
    
    // Check current attempts
    const userAttempts = attempts.get(key);
    
    if (!userAttempts) {
      attempts.set(key, { count: 1, firstAttempt: now });
      return next();
    }
    
    if (userAttempts.count >= maxAttempts) {
      securityLogger.warn('Rate limit exceeded for sensitive operation', {
        userId: req.user.id,
        operation: req.originalUrl,
        attempts: userAttempts.count,
        ip: req.clientIP
      });
      
      return next(new AppError('Too many attempts. Please try again later.', 429));
    }
    
    userAttempts.count++;
    next();
  });
};

module.exports = {
  // Task permissions
  canViewTask,
  canEditTask,
  canDeleteTask,
  canAssignTask,
  
  // File permissions
  canViewFile,
  canDownloadFile,
  canDeleteFile,
  
  // Workspace permissions
  canManageMembers,
  canManageSettings,
  canViewReports,
  canExportData,
  
  // General authorization
  requireOwnershipOrAdmin,
  enforceWorkspaceIsolation,
  rateLimitSensitiveOperations,
  
  // Utility functions
  isResourceOwner,
  hasWorkspacePermission,
  logAuthorizationEvent
};