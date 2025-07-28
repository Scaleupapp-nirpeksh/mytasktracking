/**
 * Workspace Routes
 * 
 * Express routes for workspace management operations:
 * - Workspace CRUD with member management
 * - Permission and role-based access control
 * - Settings and configuration management
 * - Analytics and data export
 * 
 * @author Nirpeksh Scale Up App
 * @version 1.0.0
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const Joi = require('joi');

// Import controllers
const workspaceController = require('../../controllers/workspace/workspaceController');

// Import middleware
const { authenticate, workspaceContext } = require('../../middleware/auth/authenticate');
const { 
  canManageMembers, 
  canManageSettings, 
  canViewReports, 
  canExportData 
} = require('../../middleware/auth/authorize');
const { ValidationError, catchAsync } = require('../../middleware/error');

// Create router
const router = express.Router();

/**
 * Apply authentication to all routes
 */
router.use(authenticate);

/**
 * Rate limiting configurations
 */

// General workspace operations
const workspaceOperationsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // 50 operations per window
  message: {
    status: 'error',
    message: 'Too many workspace operations, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `workspace-ops-${req.user.id}`
});

// Workspace creation (more restrictive)
const workspaceCreationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 workspaces per hour
  message: {
    status: 'error',
    message: 'Too many workspaces created, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `workspace-create-${req.user.id}`
});

// Member management operations
const memberManagementLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 20, // 20 member operations per 10 minutes
  message: {
    status: 'error',
    message: 'Too many member management operations, please slow down'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `member-mgmt-${req.user.id}`
});

/**
 * Validation Schemas
 */

// Workspace creation validation
const createWorkspaceSchema = Joi.object({
  name: Joi.string()
    .trim()
    .min(2)
    .max(100)
    .required()
    .messages({
      'string.empty': 'Workspace name is required',
      'string.min': 'Workspace name must be at least 2 characters',
      'string.max': 'Workspace name cannot exceed 100 characters'
    }),
    
  description: Joi.string()
    .trim()
    .max(500)
    .allow('')
    .messages({
      'string.max': 'Description cannot exceed 500 characters'
    }),
    
  type: Joi.string()
    .valid('personal', 'business', 'company')
    .required()
    .messages({
      'any.only': 'Type must be either personal, business, or company'
    }),
    
  color: Joi.string()
    .pattern(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/)
    .messages({
      'string.pattern.base': 'Color must be a valid hex color'
    }),
    
  icon: Joi.string()
    .max(50)
    .messages({
      'string.max': 'Icon name cannot exceed 50 characters'
    })
});

// Workspace update validation
const updateWorkspaceSchema = Joi.object({
  name: Joi.string()
    .trim()
    .min(2)
    .max(100)
    .messages({
      'string.min': 'Workspace name must be at least 2 characters',
      'string.max': 'Workspace name cannot exceed 100 characters'
    }),
    
  description: Joi.string()
    .trim()
    .max(500)
    .allow('')
    .messages({
      'string.max': 'Description cannot exceed 500 characters'
    }),
    
  color: Joi.string()
    .pattern(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/)
    .messages({
      'string.pattern.base': 'Color must be a valid hex color'
    }),
    
  icon: Joi.string()
    .max(50)
    .messages({
      'string.max': 'Icon name cannot exceed 50 characters'
    }),
    
  settings: Joi.object({
    isPrivate: Joi.boolean(),
    allowInvites: Joi.boolean(),
    requireApproval: Joi.boolean(),
    defaultTaskPriority: Joi.string().valid('low', 'medium', 'high', 'urgent'),
    taskNumbering: Joi.object({
      enabled: Joi.boolean(),
      prefix: Joi.string().max(5)
    }),
    notifications: Joi.object({
      taskCreated: Joi.boolean(),
      taskAssigned: Joi.boolean(),
      taskCompleted: Joi.boolean(),
      taskOverdue: Joi.boolean(),
      dailyDigest: Joi.boolean(),
      weeklyReport: Joi.boolean()
    })
  })
});

// Member management validation
const addMemberSchema = Joi.object({
  email: Joi.string()
    .email()
    .required()
    .messages({
      'string.email': 'Please provide a valid email address',
      'string.empty': 'Email is required'
    }),
    
  role: Joi.string()
    .valid('admin', 'member', 'viewer')
    .default('member')
    .messages({
      'any.only': 'Role must be admin, member, or viewer'
    })
});

const updateMemberRoleSchema = Joi.object({
  role: Joi.string()
    .valid('admin', 'member', 'viewer')
    .required()
    .messages({
      'any.only': 'Role must be admin, member, or viewer',
      'string.empty': 'Role is required'
    })
});

// Category and tag validation
const categorySchema = Joi.object({
  name: Joi.string()
    .trim()
    .min(1)
    .max(50)
    .required()
    .messages({
      'string.empty': 'Category name is required',
      'string.max': 'Category name cannot exceed 50 characters'
    }),
    
  color: Joi.string()
    .pattern(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/)
    .default('#6B7280')
    .messages({
      'string.pattern.base': 'Color must be a valid hex color'
    }),
    
  description: Joi.string()
    .trim()
    .max(200)
    .allow('')
    .messages({
      'string.max': 'Description cannot exceed 200 characters'
    })
});

const tagSchema = Joi.object({
  name: Joi.string()
    .trim()
    .min(1)
    .max(30)
    .required()
    .messages({
      'string.empty': 'Tag name is required',
      'string.max': 'Tag name cannot exceed 30 characters'
    }),
    
  color: Joi.string()
    .pattern(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/)
    .default('#EF4444')
    .messages({
      'string.pattern.base': 'Color must be a valid hex color'
    })
});

/**
 * Validation middleware
 */
const validate = (schema) => {
  return catchAsync(async (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      allowUnknown: false,
      stripUnknown: true
    });

    if (error) {
      const errorMessage = error.details.map(detail => detail.message).join('; ');
      throw new ValidationError(errorMessage);
    }

    req.body = value;
    next();
  });
};

/**
 * Routes
 */

// @route   GET /api/workspaces
// @desc    Get all workspaces for current user
// @access  Private
router.get(
  '/',
  workspaceOperationsLimiter,
  workspaceController.getWorkspaces
);

// @route   POST /api/workspaces
// @desc    Create new workspace
// @access  Private
router.post(
  '/',
  workspaceCreationLimiter,
  validate(createWorkspaceSchema),
  workspaceController.createWorkspace
);

// @route   GET /api/workspaces/:id
// @desc    Get single workspace by ID
// @access  Private
router.get(
  '/:id',
  workspaceOperationsLimiter,
  workspaceController.getWorkspace
);

// @route   PATCH /api/workspaces/:id
// @desc    Update workspace settings
// @access  Private (requires canManageSettings permission)
router.patch(
  '/:id',
  workspaceOperationsLimiter,
  workspaceContext,
  canManageSettings,
  validate(updateWorkspaceSchema),
  workspaceController.updateWorkspace
);

// @route   DELETE /api/workspaces/:id
// @desc    Delete workspace (owner only)
// @access  Private
router.delete(
  '/:id',
  workspaceOperationsLimiter,
  workspaceController.deleteWorkspace
);

/**
 * Member Management Routes
 */

// @route   POST /api/workspaces/:id/members
// @desc    Add member to workspace
// @access  Private (requires canManageMembers permission)
router.post(
  '/:id/members',
  memberManagementLimiter,
  workspaceContext,
  canManageMembers,
  validate(addMemberSchema),
  workspaceController.addMember
);

// @route   PATCH /api/workspaces/:id/members/:memberId
// @desc    Update member role
// @access  Private (requires canManageMembers permission)
router.patch(
  '/:id/members/:memberId',
  memberManagementLimiter,
  workspaceContext,
  canManageMembers,
  validate(updateMemberRoleSchema),
  workspaceController.updateMemberRole
);

// @route   DELETE /api/workspaces/:id/members/:memberId
// @desc    Remove member from workspace
// @access  Private (requires canManageMembers permission or self-removal)
router.delete(
  '/:id/members/:memberId',
  memberManagementLimiter,
  workspaceContext,
  workspaceController.removeMember
);

/**
 * Categories and Tags Routes
 */

// @route   POST /api/workspaces/:id/categories
// @desc    Add category to workspace
// @access  Private (requires canManageSettings permission)
router.post(
  '/:id/categories',
  workspaceOperationsLimiter,
  workspaceContext,
  canManageSettings,
  validate(categorySchema),
  workspaceController.addCategory
);

// @route   POST /api/workspaces/:id/tags
// @desc    Add tag to workspace
// @access  Private (requires canCreateTasks permission)
router.post(
  '/:id/tags',
  workspaceOperationsLimiter,
  workspaceContext,
  validate(tagSchema),
  workspaceController.addTag
);

/**
 * Analytics and Reporting Routes
 */

// @route   GET /api/workspaces/:id/analytics
// @desc    Get workspace analytics
// @access  Private (requires canViewReports permission)
router.get(
  '/:id/analytics',
  workspaceOperationsLimiter,
  workspaceContext,
  canViewReports,
  workspaceController.getWorkspaceAnalytics
);

// @route   GET /api/workspaces/:id/export
// @desc    Export workspace data
// @access  Private (requires canExportData permission)
router.get(
  '/:id/export',
  workspaceOperationsLimiter,
  workspaceContext,
  canExportData,
  workspaceController.exportWorkspaceData
);

/**
 * Bulk Operations Routes (placeholders for future implementation)
 */

// @route   POST /api/workspaces/:id/bulk/invite
// @desc    Bulk invite members
// @access  Private
router.post('/:id/bulk/invite', memberManagementLimiter, (req, res) => {
  res.status(501).json({
    status: 'error',
    message: 'Bulk member invitations will be implemented in future version'
  });
});

// @route   PATCH /api/workspaces/:id/bulk/update-roles
// @desc    Bulk update member roles
// @access  Private
router.patch('/:id/bulk/update-roles', memberManagementLimiter, (req, res) => {
  res.status(501).json({
    status: 'error',
    message: 'Bulk role updates will be implemented in future version'
  });
});

/**
 * Development/Testing Routes (only available in development)
 */
if (process.env.NODE_ENV === 'development') {
  // @route   GET /api/workspaces/dev/test-permissions/:id
  // @desc    Test workspace permission system (development only)
  // @access  Private
  router.get('/dev/test-permissions/:id', workspaceContext, (req, res) => {
    res.json({
      status: 'success',
      message: 'Workspace permission test',
      data: {
        user: {
          id: req.user.id,
          email: req.user.email
        },
        workspace: {
          id: req.workspace?.id,
          name: req.workspace?.name,
          type: req.workspace?.type
        },
        userRole: req.userRole,
        userPermissions: req.userPermissions,
        accessGranted: !!req.workspace
      }
    });
  });

  // @route   GET /api/workspaces/dev/validation-test
  // @desc    Test validation schemas (development only)
  // @access  Private
  router.post('/dev/validation-test', validate(createWorkspaceSchema), (req, res) => {
    res.json({
      status: 'success',
      message: 'Validation test passed',
      data: {
        validatedData: req.body
      }
    });
  });
}

/**
 * Route documentation endpoint
 */
router.get('/docs', (req, res) => {
  const routes = {
    workspaces: {
      'GET /': 'Get all workspaces for current user',
      'POST /': 'Create new workspace',
      'GET /:id': 'Get single workspace by ID',
      'PATCH /:id': 'Update workspace settings (requires canManageSettings)',
      'DELETE /:id': 'Delete workspace (owner only)'
    },
    members: {
      'POST /:id/members': 'Add member to workspace (requires canManageMembers)',
      'PATCH /:id/members/:memberId': 'Update member role (requires canManageMembers)',
      'DELETE /:id/members/:memberId': 'Remove member (requires canManageMembers or self-removal)'
    },
    organization: {
      'POST /:id/categories': 'Add category to workspace (requires canManageSettings)',
      'POST /:id/tags': 'Add tag to workspace (requires canCreateTasks)'
    },
    analytics: {
      'GET /:id/analytics': 'Get workspace analytics (requires canViewReports)',
      'GET /:id/export': 'Export workspace data (requires canExportData)'
    },
    bulk: {
      'POST /:id/bulk/invite': 'Bulk invite members (coming soon)',
      'PATCH /:id/bulk/update-roles': 'Bulk update member roles (coming soon)'
    },
    rateLimits: {
      'general operations': '50 per 15 minutes per user',
      'workspace creation': '5 per hour per user',
      'member management': '20 per 10 minutes per user'
    },
    permissions: {
      'canManageMembers': 'Required for member management operations',
      'canManageSettings': 'Required for workspace settings and categories',
      'canViewReports': 'Required for analytics access',
      'canExportData': 'Required for data export',
      'canCreateTasks': 'Required for adding tags'
    }
  };

  if (process.env.NODE_ENV === 'development') {
    routes.development = {
      'GET /dev/test-permissions/:id': 'Test workspace permission system',
      'POST /dev/validation-test': 'Test validation schemas'
    };
  }

  res.json({
    status: 'success',
    message: 'Workspace API documentation',
    data: routes
  });
});

/**
 * Error handling for undefined routes
 */
router.use('*', (req, res) => {
  res.status(404).json({
    status: 'fail',
    message: `Workspace endpoint ${req.originalUrl} not found`,
    suggestion: 'Check /api/workspaces/docs for available endpoints'
  });
});

module.exports = router;