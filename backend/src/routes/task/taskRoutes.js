/**
 * Task Routes
 * 
 * Express routes for task management operations:
 * - Task CRUD operations with middleware integration
 * - Subtask and comment management
 * - Time tracking and analytics
 * - Manager meeting features
 * - File attachment handling
 * 
 * @author Nirpeksh Scale Up App
 * @version 1.0.0
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
 * Routes
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
// @desc    Get single task by ID
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
 * Subtask Routes
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
 * Comment Routes
 */

// @route   POST /api/tasks/:id/comments
// @desc    Add comment to task
// @access  Private
router.post(
  '/:id/comments',
  interactionLimiter,
  canViewTask,
  enforceWorkspaceIsolation,
  validateComment,
  taskController.addComment
);

/**
 * Manager Meeting Routes
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
 * Time Tracking Routes
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
 * Bulk Operations Routes
 */

// @route   PATCH /api/tasks/bulk/status
// @desc    Bulk update task status
// @access  Private
router.patch('/bulk/status', taskOperationsLimiter, (req, res, next) => {
  // TODO: Implement bulk status update
  res.status(501).json({
    status: 'error',
    message: 'Bulk operations will be implemented in future version'
  });
});

// @route   PATCH /api/tasks/bulk/assign
// @desc    Bulk assign tasks
// @access  Private
router.patch('/bulk/assign', taskOperationsLimiter, (req, res, next) => {
  // TODO: Implement bulk assignment
  res.status(501).json({
    status: 'error',
    message: 'Bulk operations will be implemented in future version'
  });
});

// @route   DELETE /api/tasks/bulk/delete
// @desc    Bulk delete tasks
// @access  Private
router.delete('/bulk/delete', taskOperationsLimiter, (req, res, next) => {
  // TODO: Implement bulk delete
  res.status(501).json({
    status: 'error',
    message: 'Bulk operations will be implemented in future version'
  });
});

/**
 * Development/Testing Routes (only available in development)
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
}

/**
 * Route documentation endpoint
 */
router.get('/docs', (req, res) => {
  const routes = {
    tasks: {
      'GET /': 'Get all tasks with filtering and pagination',
      'POST /': 'Create new task',
      'GET /key-tasks': 'Get key tasks for manager meetings',
      'GET /analytics': 'Get task analytics and insights',
      'GET /:id': 'Get single task by ID',
      'PATCH /:id': 'Update task',
      'DELETE /:id': 'Delete (archive) task'
    },
    subtasks: {
      'POST /:id/subtasks': 'Add subtask to task',
      'PATCH /:id/subtasks/:subtaskId': 'Toggle subtask completion'
    },
    comments: {
      'POST /:id/comments': 'Add comment to task'
    },
    managerFeatures: {
      'POST /:id/manager-feedback': 'Add manager feedback to task',
      'PATCH /:id/key-task': 'Toggle key task status'
    },
    timeTracking: {
      'POST /:id/time/start': 'Start time tracking for task',
      'POST /:id/time/stop': 'Stop time tracking for task'
    },
    bulk: {
      'PATCH /bulk/status': 'Bulk update task status (coming soon)',
      'PATCH /bulk/assign': 'Bulk assign tasks (coming soon)',
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
      'assignedTo': 'Filter by assigned user ID',
      'category': 'Filter by category name',
      'tags': 'Filter by tags (string or array)',
      'isKeyTask': 'Filter key tasks (boolean)',
      'myTasks': 'Filter user\'s tasks (boolean)',
      'dueDateFrom/To': 'Filter by due date range',
      'createdFrom/To': 'Filter by creation date range',
      'page': 'Page number for pagination',
      'limit': 'Items per page (max 100)',
      'sortBy': 'Sort field (title, priority, status, dueDate, etc.)',
      'sortOrder': 'Sort direction (asc/desc)'
    }
  };

  if (process.env.NODE_ENV === 'development') {
    routes.development = {
      'GET /dev/test-permissions/:id': 'Test permission system',
      'GET /dev/filters': 'Test query filter validation'
    };
  }

  res.json({
    status: 'success',
    message: 'Task API documentation',
    data: routes
  });
});

/**
 * Error handling for undefined routes
 */
router.use('*', (req, res) => {
  res.status(404).json({
    status: 'fail',
    message: `Task endpoint ${req.originalUrl} not found`,
    suggestion: 'Check /api/tasks/docs for available endpoints'
  });
});

module.exports = router;