// src/api/routes/taskRoutes.js

const express = require('express');
const taskController = require('../controllers/taskController');
const authMiddleware = require('../middlewares/authMiddleware');

// The 'mergeParams: true' option is essential for nested routes.
const router = express.Router({ mergeParams: true });

// --- Protection Middleware ---
// Apply the 'protect' middleware to all routes in this file.
router.use(authMiddleware.protect);

/**
 * @route   POST /api/v1/tasks/parse
 * @desc    Parse a natural language string to get task details
 * @access  Private
 */
router.route('/parse').post(taskController.parseTask);

// --- Main Task Routes ---

/**
 * @route   GET /api/v1/tasks
 * @route   GET /api/v1/workspaces/:workspaceId/tasks
 * @desc    Get all tasks or create a new task
 * @access  Private
 */
router
  .route('/')
  .get(taskController.getAllTasks)
  .post(taskController.setWorkspaceUserIds, taskController.createTask);

/**
 * @route   POST /api/v1/tasks/:id/attachments
 * @desc    Upload a file and attach it to a task
 * @access  Private
 */
router
  .route('/:id/attachments')
  .post(taskController.uploadTaskFile, taskController.addAttachmentToTask);

/**
 * @route   GET /api/v1/tasks/:id
 * @desc    Get, update, or delete a single task by its ID
 * @access  Private
 */
router
  .route('/:id')
  .get(taskController.getTask)
  .patch(taskController.updateTask)
  .delete(taskController.deleteTask);

module.exports = router;
