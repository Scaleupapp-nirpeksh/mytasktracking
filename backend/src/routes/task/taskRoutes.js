/**
 * Enhanced Task Routes with Manager Meeting Features
 * 
 * Express routes for comprehensive task management operations:
 * - Task CRUD operations with middleware integration
 * - Subtask and personal notes management (single user)
 * - Manager meeting preparation and tracking
 * - Blocker management and resolution
 * - Meeting history and discussion tracking
 * - Time tracking and analytics
 * - File attachment handling
 * 
 * @author Nirpeksh Scale Up App
 * @version 2.0.0 - Enhanced for Manager Meetings
 */

const express = require('express');
const rateLimit = require('express-rate-limit');

// Import controllers
const taskController = require('../../controllers/task/taskController');

// Import middleware
const { authenticate, workspaceContext, requireWorkspace } = require('../../middleware/auth/authenticate');
const { 
  canViewTask, 
  canEditTask, 
  canDeleteTask, 
  enforceWorkspaceIsolation,
  requireOwnershipOrAdmin 
} = require('../../middleware/auth/authorize');
const {
  validateCreateTask,
  validateUpdateTask,
  validateSubtask,
  validateComment,
  validateManagerFeedback,
  validateTimeLog,
  validateTaskQuery,
  validateTaskDates,
  validateRecurrence,
  validateTaskAssignment
} = require('../../middleware/validation/taskValidation');

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

// General task operations rate limiting
const taskOperationsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 operations per window
  message: {
    status: 'error',
    message: 'Too many task operations, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `task-ops-${req.user.id}-${req.workspace.id}`
});

// Task creation rate limiting (more restrictive)
const taskCreationLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 20, // 20 tasks per 5 minutes
  message: {
    status: 'error',
    message: 'Too many tasks created, please slow down'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `task-create-${req.user.id}-${req.workspace.id}`
});

// Comment and interaction rate limiting
const interactionLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30, // 30 interactions per minute
  message: {
    status: 'error',
    message: 'Too many interactions, please slow down'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `task-interact-${req.user.id}`
});

/**
 * Validation Helpers for New Features
 */

// Personal note validation middleware
const validatePersonalNote = (req, res, next) => {
  const { content, noteType, isImportant } = req.body;
  
  if (!content || content.trim().length === 0) {
    return res.status(400).json({
      status: 'fail',
      message: 'Note content is required'
    });
  }
  
  if (content.length > 2000) {
    return res.status(400).json({
      status: 'fail',
      message: 'Note content cannot exceed 2000 characters'
    });
  }
  
  if (noteType && !['general', 'progress', 'blocker', 'idea', 'meeting_prep'].includes(noteType)) {
    return res.status(400).json({
      status: 'fail',
      message: 'Invalid note type. Must be: general, progress, blocker, idea, or meeting_prep'
    });
  }
  
  if (isImportant !== undefined && typeof isImportant !== 'boolean') {
    return res.status(400).json({
      status: 'fail',
      message: 'isImportant must be a boolean value'
    });
  }
  
  next();
};

// Personal note update validation middleware
const validatePersonalNoteUpdate = (req, res, next) => {
  const { content, noteType, isImportant } = req.body;
  
  if (content !== undefined) {
    if (content.trim().length === 0) {
      return res.status(400).json({
        status: 'fail',
        message: 'Note content cannot be empty'
      });
    }
    
    if (content.length > 2000) {
      return res.status(400).json({
        status: 'fail',
        message: 'Note content cannot exceed 2000 characters'
      });
    }
  }
  
  if (noteType && !['general', 'progress', 'blocker', 'idea', 'meeting_prep'].includes(noteType)) {
    return res.status(400).json({
      status: 'fail',
      message: 'Invalid note type. Must be: general, progress, blocker, idea, or meeting_prep'
    });
  }
  
  if (isImportant !== undefined && typeof isImportant !== 'boolean') {
    return res.status(400).json({
      status: 'fail',
      message: 'isImportant must be a boolean value'
    });
  }
  
  next();
};

// Blocker validation middleware
const validateBlocker = (req, res, next) => {
  const { description, severity } = req.body;
  
  if (!description || description.trim().length === 0) {
    return res.status(400).json({
      status: 'fail',
      message: 'Blocker description is required'
    });
  }
  
  if (description.length > 300) {
    return res.status(400).json({
      status: 'fail',
      message: 'Blocker description cannot exceed 300 characters'
    });
  }
  
  if (severity && !['low', 'medium', 'high', 'critical'].includes(severity)) {
    return res.status(400).json({
      status: 'fail',
      message: 'Invalid severity level. Must be: low, medium, high, or critical'
    });
  }
  
  next();
};

// Meeting preparation validation middleware
const validateMeetingPrep = (req, res, next) => {
  const { preparationNotes } = req.body;
  
  if (!preparationNotes || preparationNotes.trim().length === 0) {
    return res.status(400).json({
      status: 'fail',
      message: 'Preparation notes are required'
    });
  }
  
  if (preparationNotes.length > 2000) {
    return res.status(400).json({
      status: 'fail',
      message: 'Preparation notes cannot exceed 2000 characters'
    });
  }
  
  next();
};

// Meeting history validation middleware
const validateMeetingHistory = (req, res, next) => {
  const { meetingId, meetingData } = req.body;
  
  if (!meetingId) {
    return res.status(400).json({
      status: 'fail',
      message: 'Meeting ID is required'
    });
  }
  
  // Validate meetingId is a valid ObjectId
  if (!meetingId.match(/^[0-9a-fA-F]{24}$/)) {
    return res.status(400).json({
      status: 'fail',
      message: 'Invalid meeting ID format'
    });
  }
  
  if (!meetingData || typeof meetingData !== 'object') {
    return res.status(400).json({
      status: 'fail',
      message: 'Meeting data object is required'
    });
  }
  
  next();
};

/**
 * CORE TASK ROUTES
 */

// @route   GET /api/tasks
// @desc    Get all tasks in workspace with filtering and pagination
// @access  Private
router.get(
  '/',
  taskOperationsLimiter,
  validateTaskQuery,
  taskController.getTasks
);

// @route   GET /api/tasks/key-tasks
// @desc    Get key tasks for manager meetings
// @access  Private
router.get(
  '/key-tasks',
  taskOperationsLimiter,
  taskController.getKeyTasks
);

// @route   GET /api/tasks/analytics
// @desc    Get task analytics and insights
// @access  Private
router.get(
  '/analytics',
  taskOperationsLimiter,
  taskController.getTaskAnalytics
);

/**
 * MANAGER MEETING PREPARATION ROUTES
 */

// @route   GET /api/tasks/meeting-preparation
// @desc    Get comprehensive meeting preparation data
// @access  Private
router.get(
  '/meeting-preparation',
  taskOperationsLimiter,
  taskController.getMeetingPreparationData
);

// @route   GET /api/tasks/ready-for-discussion
// @desc    Get tasks ready for manager discussion
// @access  Private
router.get(
  '/ready-for-discussion',
  taskOperationsLimiter,
  taskController.getTasksReadyForDiscussion
);

/**
 * TASK CRUD OPERATIONS
 */

// @route   POST /api/tasks
// @desc    Create new task
// @access  Private
router.post(
  '/',
  taskCreationLimiter,
  validateCreateTask,
  validateTaskDates,
  validateRecurrence,
  validateTaskAssignment,
  taskController.createTask
);

// @route   GET /api/tasks/:id
// @desc    Get single task by ID with meeting context
// @access  Private
router.get(
  '/:id',
  taskOperationsLimiter,
  canViewTask,
  enforceWorkspaceIsolation,
  taskController.getTask
);

// @route   PATCH /api/tasks/:id
// @desc    Update task
// @access  Private
router.patch(
  '/:id',
  taskOperationsLimiter,
  canViewTask,
  canEditTask,
  enforceWorkspaceIsolation,
  validateUpdateTask,
  validateTaskDates,
  validateTaskAssignment,
  taskController.updateTask
);

// @route   DELETE /api/tasks/:id
// @desc    Delete (archive) task
// @access  Private
router.delete(
  '/:id',
  taskOperationsLimiter,
  canViewTask,
  canDeleteTask,
  enforceWorkspaceIsolation,
  taskController.deleteTask
);

/**
 * SUBTASK MANAGEMENT ROUTES
 */

// @route   POST /api/tasks/:id/subtasks
// @desc    Add subtask to task
// @access  Private
router.post(
  '/:id/subtasks',
  interactionLimiter,
  canViewTask,
  canEditTask,
  enforceWorkspaceIsolation,
  validateSubtask,
  taskController.addSubtask
);

// @route   PATCH /api/tasks/:id/subtasks/:subtaskId
// @desc    Toggle subtask completion
// @access  Private
router.patch(
  '/:id/subtasks/:subtaskId',
  interactionLimiter,
  canViewTask,
  canEditTask,
  enforceWorkspaceIsolation,
  taskController.toggleSubtask
);

/**
 * PERSONAL NOTES ROUTES (Single User Feature)
 */

// @route   POST /api/tasks/:id/notes
// @desc    Add personal note to task
// @access  Private
router.post(
  '/:id/notes',
  interactionLimiter,
  canViewTask,
  enforceWorkspaceIsolation,
  validatePersonalNote,
  taskController.addPersonalNote
);

// @route   PATCH /api/tasks/:id/notes/:noteId
// @desc    Update personal note
// @access  Private
router.patch(
  '/:id/notes/:noteId',
  interactionLimiter,
  canViewTask,
  canEditTask,
  enforceWorkspaceIsolation,
  validatePersonalNoteUpdate,
  taskController.updatePersonalNote
);

// @route   DELETE /api/tasks/:id/notes/:noteId
// @desc    Delete personal note
// @access  Private
router.delete(
  '/:id/notes/:noteId',
  interactionLimiter,
  canViewTask,
  canEditTask,
  enforceWorkspaceIsolation,
  taskController.deletePersonalNote
);

/**
 * MEETING PREPARATION ROUTES
 */

// @route   PATCH /api/tasks/:id/meeting-prep
// @desc    Add meeting preparation notes to task
// @access  Private
router.patch(
  '/:id/meeting-prep',
  interactionLimiter,
  canViewTask,
  canEditTask,
  enforceWorkspaceIsolation,
  validateMeetingPrep,
  taskController.addMeetingPreparationNotes
);

/**
 * BLOCKER MANAGEMENT ROUTES
 */

// @route   POST /api/tasks/:id/blockers
// @desc    Add blocker to task
// @access  Private
router.post(
  '/:id/blockers',
  interactionLimiter,
  canViewTask,
  canEditTask,
  enforceWorkspaceIsolation,
  validateBlocker,
  taskController.addTaskBlocker
);

// @route   PATCH /api/tasks/:id/blockers/:blockerId
// @desc    Resolve task blocker
// @access  Private
router.patch(
  '/:id/blockers/:blockerId',
  interactionLimiter,
  canViewTask,
  canEditTask,
  enforceWorkspaceIsolation,
  taskController.resolveTaskBlocker
);

/**
 * MEETING HISTORY ROUTES
 */

// @route   POST /api/tasks/:id/meeting-history
// @desc    Add meeting history entry to task
// @access  Private
router.post(
  '/:id/meeting-history',
  interactionLimiter,
  canViewTask,
  canEditTask,
  enforceWorkspaceIsolation,
  validateMeetingHistory,
  taskController.addTaskMeetingHistory
);

// @route   GET /api/tasks/:id/meeting-history
// @desc    Get meeting history for task
// @access  Private
router.get(
  '/:id/meeting-history',
  taskOperationsLimiter,
  canViewTask,
  enforceWorkspaceIsolation,
  taskController.getTaskMeetingHistory
);

/**
 * LEGACY COMMENT ROUTES (Keep for backward compatibility)
 */

// @route   POST /api/tasks/:id/comments
// @desc    Add comment to task (legacy - use personal notes instead)
// @access  Private
router.post(
  '/:id/comments',
  interactionLimiter,
  canViewTask,
  enforceWorkspaceIsolation,
  validateComment,
  (req, res, next) => {
    // Add deprecation warning
    res.set('X-Deprecated', 'Use /notes endpoint instead');
    next();
  },
  taskController.addComment
);

/**
 * MANAGER MEETING FEATURES
 */

// @route   POST /api/tasks/:id/manager-feedback
// @desc    Add manager feedback to task
// @access  Private
router.post(
  '/:id/manager-feedback',
  interactionLimiter,
  canViewTask,
  canEditTask,
  enforceWorkspaceIsolation,
  validateManagerFeedback,
  taskController.addManagerFeedback
);

// @route   PATCH /api/tasks/:id/key-task
// @desc    Toggle key task status
// @access  Private
router.patch(
  '/:id/key-task',
  taskOperationsLimiter,
  canViewTask,
  canEditTask,
  enforceWorkspaceIsolation,
  taskController.toggleKeyTask
);

/**
 * TIME TRACKING ROUTES
 */

// @route   POST /api/tasks/:id/time/start
// @desc    Start time tracking for task
// @access  Private
router.post(
  '/:id/time/start',
  interactionLimiter,
  canViewTask,
  enforceWorkspaceIsolation,
  validateTimeLog,
  taskController.startTimer
);

// @route   POST /api/tasks/:id/time/stop
// @desc    Stop time tracking for task
// @access  Private
router.post(
  '/:id/time/stop',
  interactionLimiter,
  canViewTask,
  enforceWorkspaceIsolation,
  taskController.stopTimer
);

/**
 * BULK OPERATIONS ROUTES (Future Implementation)
 */

// @route   PATCH /api/tasks/bulk/status
// @desc    Bulk update task status
// @access  Private
router.patch('/bulk/status', taskOperationsLimiter, (req, res, next) => {
  res.status(501).json({
    status: 'error',
    message: 'Bulk operations will be implemented in future version',
    suggestion: 'Use individual task update endpoints for now'
  });
});

// @route   PATCH /api/tasks/bulk/priority
// @desc    Bulk update task priority
// @access  Private
router.patch('/bulk/priority', taskOperationsLimiter, (req, res, next) => {
  res.status(501).json({
    status: 'error',
    message: 'Bulk operations will be implemented in future version',
    suggestion: 'Use individual task update endpoints for now'
  });
});

// @route   PATCH /api/tasks/bulk/key-task
// @desc    Bulk toggle key task status
// @access  Private
router.patch('/bulk/key-task', taskOperationsLimiter, (req, res, next) => {
  res.status(501).json({
    status: 'error',
    message: 'Bulk operations will be implemented in future version',
    suggestion: 'Use individual key-task toggle endpoints for now'
  });
});

// @route   DELETE /api/tasks/bulk/delete
// @desc    Bulk delete tasks
// @access  Private
router.delete('/bulk/delete', taskOperationsLimiter, (req, res, next) => {
  res.status(501).json({
    status: 'error',
    message: 'Bulk operations will be implemented in future version',
    suggestion: 'Use individual task delete endpoints for now'
  });
});

/**
 * DEVELOPMENT/TESTING ROUTES (only available in development)
 */
if (process.env.NODE_ENV === 'development') {
  // @route   GET /api/tasks/dev/test-permissions/:id
  // @desc    Test permission system for task (development only)
  // @access  Private
  router.get('/dev/test-permissions/:id', canViewTask, (req, res) => {
    res.json({
      status: 'success',
      message: 'Permission test passed',
      data: {
        user: {
          id: req.user.id,
          role: req.userRole,
          permissions: req.userPermissions
        },
        workspace: {
          id: req.workspace.id,
          name: req.workspace.name
        },
        task: {
          id: req.task.id,
          title: req.task.title,
          createdBy: req.task.createdBy
        }
      }
    });
  });

  // @route   GET /api/tasks/dev/filters
  // @desc    Test query filters (development only)
  // @access  Private
  router.get('/dev/filters', validateTaskQuery, (req, res) => {
    res.json({
      status: 'success',
      message: 'Filter validation passed',
      data: {
        originalQuery: req.originalUrl.split('?')[1],
        validatedQuery: req.query,
        workspace: req.workspace.id
      }
    });
  });

  // @route   GET /api/tasks/dev/meeting-data
  // @desc    Test meeting preparation data (development only)
  // @access  Private
  router.get('/dev/meeting-data', taskController.getMeetingPreparationData);
}

/**
 * COMPREHENSIVE ROUTE DOCUMENTATION
 */
router.get('/docs', (req, res) => {
  const routes = {
    overview: {
      description: 'Enhanced Task Management API with Manager Meeting Features',
      version: '2.0.0',
      baseUrl: '/api/tasks',
      authentication: 'Required for all endpoints',
      workspaceContext: 'Required for all endpoints'
    },
    coreTasks: {
      'GET /': 'Get all tasks with filtering and pagination',
      'POST /': 'Create new task',
      'GET /:id': 'Get single task by ID with meeting context',
      'PATCH /:id': 'Update task',
      'DELETE /:id': 'Delete (archive) task'
    },
    managerMeetingFeatures: {
      'GET /key-tasks': 'Get key tasks for manager meetings',
      'GET /meeting-preparation': 'Get comprehensive meeting preparation data',
      'GET /ready-for-discussion': 'Get tasks ready for discussion',
      'PATCH /:id/meeting-prep': 'Add meeting preparation notes',
      'PATCH /:id/key-task': 'Toggle key task status'
    },
    subtasks: {
      'POST /:id/subtasks': 'Add subtask to task',
      'PATCH /:id/subtasks/:subtaskId': 'Toggle subtask completion'
    },
    personalNotes: {
      'POST /:id/notes': 'Add personal note to task',
      'PATCH /:id/notes/:noteId': 'Update personal note',
      'DELETE /:id/notes/:noteId': 'Delete personal note'
    },
    blockers: {
      'POST /:id/blockers': 'Add blocker to task',
      'PATCH /:id/blockers/:blockerId': 'Resolve task blocker'
    },
    meetingHistory: {
      'POST /:id/meeting-history': 'Add meeting history entry',
      'GET /:id/meeting-history': 'Get meeting history for task'
    },
    legacyFeatures: {
      'POST /:id/comments': 'Add comment to task (deprecated - use /notes)',
      'POST /:id/manager-feedback': 'Add manager feedback to task'
    },
    timeTracking: {
      'POST /:id/time/start': 'Start time tracking for task',
      'POST /:id/time/stop': 'Stop time tracking for task'
    },
    analytics: {
      'GET /analytics': 'Get task analytics and insights'
    },
    bulkOperations: {
      'PATCH /bulk/status': 'Bulk update task status (coming soon)',
      'PATCH /bulk/priority': 'Bulk update task priority (coming soon)',
      'PATCH /bulk/key-task': 'Bulk toggle key task status (coming soon)',
      'DELETE /bulk/delete': 'Bulk delete tasks (coming soon)'
    },
    rateLimits: {
      'general operations': '100 per 15 minutes per user/workspace',
      'task creation': '20 per 5 minutes per user/workspace',
      'interactions': '30 per minute per user'
    },
    queryParameters: {
      'status': 'Filter by task status (string or array)',
      'priority': 'Filter by priority (string or array)',
      'category': 'Filter by category name',
      'tags': 'Filter by tags (string or array)',
      'isKeyTask': 'Filter key tasks (boolean)',
      'dueDateFrom/To': 'Filter by due date range',
      'createdFrom/To': 'Filter by creation date range',
      'page': 'Page number for pagination (default: 1)',
      'limit': 'Items per page (max 100, default: 25)',
      'sortBy': 'Sort field (title, priority, status, dueDate, createdAt, updatedAt, lastActivityAt)',
      'sortOrder': 'Sort direction (asc/desc, default: desc)',
      'daysSince': 'Days since last discussion (for ready-for-discussion endpoint, default: 7)'
    },
    noteTypes: {
      'general': 'General notes about the task',
      'progress': 'Progress updates and status notes',
      'blocker': 'Notes about blockers or impediments',
      'idea': 'Ideas and suggestions for the task',
      'meeting_prep': 'Notes for manager meeting preparation'
    },
    blockerSeverity: {
      'low': 'Minor blocker, low impact',
      'medium': 'Moderate blocker, some impact',
      'high': 'Major blocker, significant impact',
      'critical': 'Critical blocker, blocks all progress'
    },
    taskStatuses: {
      'todo': 'Task not started',
      'in_progress': 'Task is being worked on',
      'blocked': 'Task is blocked by dependencies',
      'review': 'Task completed, pending review',
      'done': 'Task completed and approved',
      'cancelled': 'Task cancelled'
    },
    taskPriorities: {
      'low': 'Low priority task',
      'medium': 'Medium priority task (default)',
      'high': 'High priority task',
      'urgent': 'Urgent priority task'
    }
  };

  if (process.env.NODE_ENV === 'development') {
    routes.development = {
      'GET /dev/test-permissions/:id': 'Test permission system',
      'GET /dev/filters': 'Test query filter validation',
      'GET /dev/meeting-data': 'Test meeting preparation data'
    };
  }

  res.json({
    status: 'success',
    message: 'Enhanced Task API Documentation with Manager Meeting Features',
    data: routes
  });
});

/**
 * ERROR HANDLING FOR UNDEFINED ROUTES
 */
router.use('*', (req, res) => {
  res.status(404).json({
    status: 'fail',
    message: `Task endpoint ${req.originalUrl} not found`,
    suggestion: 'Check /api/tasks/docs for available endpoints',
    availableEndpoints: [
      'GET /api/tasks/docs - API documentation',
      'GET /api/tasks - List all tasks',
      'GET /api/tasks/meeting-preparation - Meeting prep data',
      'GET /api/tasks/key-tasks - Key tasks for meetings',
      'POST /api/tasks - Create new task'
    ]
  });
});

module.exports = router;