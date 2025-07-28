/**
 * File Routes
 * 
 * Express routes for file management operations:
 * - File upload and download with S3 integration
 * - File metadata management and organization
 * - Access control and permissions
 * - Storage analytics and reporting
 * 
 * @author Nirpeksh Scale Up App
 * @version 1.0.0
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const Joi = require('joi');

// Import controllers
const fileController = require('../../controllers/file/fileController');

// Import middleware
const { authenticate, workspaceContext, requireWorkspace } = require('../../middleware/auth/authenticate');
const { 
  canViewFile, 
  canDownloadFile, 
  canDeleteFile,
  enforceWorkspaceIsolation 
} = require('../../middleware/auth/authorize');
const { ValidationError, catchAsync } = require('../../middleware/error');

// Create router
const router = express.Router();

/**
 * Apply authentication to all routes
 */
router.use(authenticate);
router.use(workspaceContext);
router.use(requireWorkspace);

/**
 * Rate limiting configurations
 */

// File upload rate limiting (most restrictive)
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 uploads per window
  message: {
    status: 'error',
    message: 'Too many file uploads, please try again later',
    retryAfter: 900
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `file-upload-${req.user.id}-${req.workspace.id}`
});

// File download rate limiting
const downloadLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 50, // 50 downloads per window
  message: {
    status: 'error',
    message: 'Too many download requests, please try again later',
    retryAfter: 300
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `file-download-${req.user.id}`
});

// General file operations
const fileOperationsLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 100, // 100 operations per window
  message: {
    status: 'error',
    message: 'Too many file operations, please try again later',
    retryAfter: 600
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `file-ops-${req.user.id}-${req.workspace.id}`
});

/**
 * Validation Schemas
 */

// File upload validation
const uploadValidationSchema = Joi.object({
  taskId: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .optional()
    .messages({
      'string.pattern.base': 'Task ID must be a valid ObjectId'
    }),
    
  description: Joi.string()
    .trim()
    .max(1000)
    .allow('')
    .optional()
    .messages({
      'string.max': 'Description cannot exceed 1000 characters'
    }),
    
  tags: Joi.string()
    .trim()
    .max(300)
    .optional()
    .messages({
      'string.max': 'Tags cannot exceed 300 characters'
    }),
    
  category: Joi.string()
    .trim()
    .max(50)
    .optional()
    .messages({
      'string.max': 'Category cannot exceed 50 characters'
    }),
    
  isPublic: Joi.alternatives()
    .try(Joi.boolean(), Joi.string().valid('true', 'false'))
    .default(false)
    .messages({
      'alternatives.match': 'isPublic must be a boolean or "true"/"false" string'
    })
});

// File update validation
const updateFileSchema = Joi.object({
  description: Joi.string()
    .trim()
    .max(1000)
    .allow('')
    .optional()
    .messages({
      'string.max': 'Description cannot exceed 1000 characters'
    }),
    
  tags: Joi.alternatives()
    .try(
      Joi.array().items(Joi.string().trim().max(30)),
      Joi.string().trim().max(300)
    )
    .optional()
    .messages({
      'alternatives.match': 'Tags must be an array of strings or comma-separated string'
    }),
    
  category: Joi.string()
    .trim()
    .max(50)
    .allow('')
    .optional()
    .messages({
      'string.max': 'Category cannot exceed 50 characters'
    }),
    
  visibility: Joi.string()
    .valid('private', 'workspace', 'public')
    .optional()
    .messages({
      'any.only': 'Visibility must be one of: private, workspace, public'
    })
});

// File query validation
const fileQuerySchema = Joi.object({
  taskId: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .optional()
    .messages({
      'string.pattern.base': 'Task ID must be a valid ObjectId'
    }),
    
  category: Joi.string()
    .trim()
    .max(50)
    .optional(),
    
  fileType: Joi.string()
    .valid('image', 'video', 'audio', 'pdf', 'document', 'spreadsheet', 'presentation', 'archive', 'text', 'other')
    .optional()
    .messages({
      'any.only': 'File type must be one of: image, video, audio, pdf, document, spreadsheet, presentation, archive, text, other'
    }),
    
  search: Joi.string()
    .trim()
    .min(1)
    .max(100)
    .optional()
    .messages({
      'string.min': 'Search term must be at least 1 character',
      'string.max': 'Search term cannot exceed 100 characters'
    }),
    
  page: Joi.number()
    .integer()
    .min(1)
    .default(1)
    .optional(),
    
  limit: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .default(25)
    .optional()
    .messages({
      'number.max': 'Limit cannot exceed 100'
    }),
    
  sortBy: Joi.string()
    .valid('filename', 'size', 'createdAt', 'lastAccessedAt', 'downloadCount')
    .default('createdAt')
    .optional(),
    
  sortOrder: Joi.string()
    .valid('asc', 'desc', '1', '-1')
    .default('desc')
    .optional()
});

/**
 * Validation middleware
 */
const validate = (schema, source = 'body') => {
  return catchAsync(async (req, res, next) => {
    const data = req[source];
    
    try {
      const { error, value } = schema.validate(data, {
        abortEarly: false,
        allowUnknown: false,
        stripUnknown: true
      });

      if (error) {
        const errorMessage = error.details.map(detail => detail.message).join('; ');
        throw new ValidationError(errorMessage);
      }

      req[source] = value;
      next();
    } catch (err) {
      throw new ValidationError('Validation failed');
    }
  });
};

/**
 * Custom middleware for file size validation
 */
const validateFileSize = (req, res, next) => {
  if (req.files && req.files.length > 0) {
    const maxSize = 10 * 1024 * 1024; // 10MB
    const oversizedFiles = req.files.filter(file => file.size > maxSize);
    
    if (oversizedFiles.length > 0) {
      return next(new ValidationError(`Files too large: ${oversizedFiles.map(f => f.originalname).join(', ')}. Maximum size is 10MB.`));
    }
  }
  next();
};

/**
 * Custom middleware for workspace file quota check
 */
const checkWorkspaceQuota = catchAsync(async (req, res, next) => {
  // TODO: Implement workspace file quota checking
  // For now, skip quota checking
  next();
});

/**
 * Routes
 */

// @route   POST /api/files/upload
// @desc    Upload files to workspace
// @access  Private
router.post(
  '/upload',
  uploadLimiter,
  validate(uploadValidationSchema, 'body'),
  validateFileSize,
  checkWorkspaceQuota,
  fileController.uploadFiles
);

// @route   GET /api/files
// @desc    Get files in workspace with filtering
// @access  Private
router.get(
  '/',
  fileOperationsLimiter,
  validate(fileQuerySchema, 'query'),
  fileController.getFiles
);

// @route   GET /api/files/stats
// @desc    Get file storage statistics
// @access  Private
router.get(
  '/stats',
  fileOperationsLimiter,
  fileController.getStorageStats
);

// @route   GET /api/files/:id
// @desc    Get single file details
// @access  Private
router.get(
  '/:id',
  fileOperationsLimiter,
  canViewFile,
  enforceWorkspaceIsolation,
  fileController.getFile
);

// @route   GET /api/files/:id/download
// @desc    Download file (get presigned URL)
// @access  Private
router.get(
  '/:id/download',
  downloadLimiter,
  canViewFile,
  canDownloadFile,
  enforceWorkspaceIsolation,
  fileController.downloadFile
);

// @route   PATCH /api/files/:id
// @desc    Update file metadata
// @access  Private
router.patch(
  '/:id',
  fileOperationsLimiter,
  canViewFile,
  enforceWorkspaceIsolation,
  validate(updateFileSchema, 'body'),
  fileController.updateFile
);

// @route   DELETE /api/files/:id
// @desc    Delete file
// @access  Private
router.delete(
  '/:id',
  fileOperationsLimiter,
  canViewFile,
  canDeleteFile,
  enforceWorkspaceIsolation,
  fileController.deleteFile
);

/**
 * Bulk Operations (placeholder for future implementation)
 */

// @route   POST /api/files/bulk/delete
// @desc    Bulk delete files
// @access  Private
router.post('/bulk/delete', fileOperationsLimiter, (req, res) => {
  res.status(501).json({
    status: 'error',
    message: 'Bulk file operations will be implemented in future version'
  });
});

// @route   PATCH /api/files/bulk/move
// @desc    Bulk move files between tasks/categories
// @access  Private
router.patch('/bulk/move', fileOperationsLimiter, (req, res) => {
  res.status(501).json({
    status: 'error',
    message: 'Bulk file operations will be implemented in future version'
  });
});

// @route   POST /api/files/bulk/download
// @desc    Bulk download files (zip archive)
// @access  Private
router.post('/bulk/download', downloadLimiter, (req, res) => {
  res.status(501).json({
    status: 'error',
    message: 'Bulk download will be implemented in future version'
  });
});

/**
 * Admin/Management Routes
 */

// @route   GET /api/files/admin/cleanup
// @desc    Get files marked for cleanup
// @access  Private (Admin only)
router.get('/admin/cleanup', fileOperationsLimiter, (req, res) => {
  // TODO: Implement admin cleanup functionality
  res.status(501).json({
    status: 'error',
    message: 'Admin cleanup functionality will be implemented in future version'
  });
});

// @route   POST /api/files/admin/optimize
// @desc    Optimize file storage (compress, cleanup, etc.)
// @access  Private (Admin only)
router.post('/admin/optimize', fileOperationsLimiter, (req, res) => {
  // TODO: Implement storage optimization
  res.status(501).json({
    status: 'error',
    message: 'Storage optimization will be implemented in future version'
  });
});

/**
 * Development/Testing Routes (only available in development)
 */
if (process.env.NODE_ENV === 'development') {
  // @route   GET /api/files/dev/test-upload
  // @desc    Test file upload configuration (development only)
  // @access  Private
  router.get('/dev/test-upload', (req, res) => {
    res.json({
      status: 'success',
      message: 'File upload configuration test',
      data: {
        maxFileSize: '10MB',
        allowedTypes: [
          'Images: jpg, jpeg, png, gif, webp, svg',
          'Documents: pdf, doc, docx, xls, xlsx, ppt, pptx',
          'Text: txt, csv',
          'Archives: zip, rar, 7z'
        ],
        s3Config: {
          bucket: process.env.S3_BUCKET_NAME,
          region: process.env.AWS_REGION,
          configured: !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY)
        },
        workspace: {
          id: req.workspace.id,
          name: req.workspace.name
        }
      }
    });
  });

  // @route   POST /api/files/dev/validate
  // @desc    Test validation schemas (development only)
  // @access  Private
  router.post('/dev/validate', validate(uploadValidationSchema), (req, res) => {
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
    upload: {
      'POST /upload': 'Upload files to workspace (max 5 files, 10MB each)'
    },
    management: {
      'GET /': 'Get files with filtering and pagination',
      'GET /stats': 'Get file storage statistics',
      'GET /:id': 'Get single file details',
      'PATCH /:id': 'Update file metadata',
      'DELETE /:id': 'Delete file (soft delete)'
    },
    access: {
      'GET /:id/download': 'Get download URL for file'
    },
    bulk: {
      'POST /bulk/delete': 'Bulk delete files (coming soon)',
      'PATCH /bulk/move': 'Bulk move files (coming soon)',
      'POST /bulk/download': 'Bulk download as zip (coming soon)'
    },
    admin: {
      'GET /admin/cleanup': 'Get files for cleanup (coming soon)',
      'POST /admin/optimize': 'Optimize storage (coming soon)'
    },
    rateLimits: {
      'file uploads': '20 per 15 minutes per user/workspace',
      'file downloads': '50 per 5 minutes per user',
      'general operations': '100 per 10 minutes per user/workspace'
    },
    supportedTypes: {
      images: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'],
      documents: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'],
      text: ['txt', 'csv'],
      archives: ['zip', 'rar', '7z']
    },
    queryParameters: {
      'taskId': 'Filter files by task ID',
      'category': 'Filter by category',
      'fileType': 'Filter by file type category',
      'search': 'Search in filename, original name, or description',
      'page': 'Page number for pagination',
      'limit': 'Items per page (max 100)',
      'sortBy': 'Sort field (filename, size, createdAt, etc.)',
      'sortOrder': 'Sort direction (asc/desc)'
    }
  };

  if (process.env.NODE_ENV === 'development') {
    routes.development = {
      'GET /dev/test-upload': 'Test upload configuration',
      'POST /dev/validate': 'Test validation schemas'
    };
  }

  res.json({
    status: 'success',
    message: 'File API documentation',
    data: routes
  });
});

/**
 * Error handling for undefined routes
 */
router.use('*', (req, res) => {
  res.status(404).json({
    status: 'fail',
    message: `File endpoint ${req.originalUrl} not found`,
    suggestion: 'Check /api/files/docs for available endpoints'
  });
});

module.exports = router;