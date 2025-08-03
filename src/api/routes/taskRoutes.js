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
 * @route   GET /api/v1/tasks/:id
 * @desc    Get, update, or delete a single task by its ID
 * @access  Private
 */
router
  .route('/:id')
  .get(taskController.getTask)
  .patch(taskController.updateTask)
  .delete(taskController.deleteTask);

// --- Task Status Routes ---

/**
 * @route   PATCH /api/v1/tasks/:id/complete
 * @desc    Mark a task as completed
 * @access  Private
 */
router.route('/:id/complete').patch(taskController.markTaskCompleted);

/**
 * @route   PATCH /api/v1/tasks/:id/pending
 * @desc    Mark a task as pending/incomplete
 * @access  Private
 */
router.route('/:id/pending').patch(taskController.markTaskPending);

// --- Attachment Routes ---

/**
 * @route   GET /api/v1/tasks/:id/attachments
 * @desc    Get all attachments for a task
 * @access  Private
 */
router.route('/:id/attachments').get(taskController.getTaskAttachments);

/**
 * @route   POST /api/v1/tasks/:id/attachments
 * @desc    Upload a file and attach it to a task
 * @access  Private
 */
router
  .route('/:id/attachments')
  .post(taskController.uploadTaskFile, taskController.addAttachmentToTask);

/**
 * @route   DELETE /api/v1/tasks/:id/attachments/:attachmentId
 * @desc    Remove an attachment from a task
 * @access  Private
 */
router
  .route('/:id/attachments/:attachmentId')
  .delete(taskController.removeAttachmentFromTask);

// --- Notes Routes ---

/**
 * @route   GET /api/v1/tasks/:id/notes
 * @desc    Get all notes for a task (with pagination)
 * @access  Private
 */
router.route('/:id/notes').get(taskController.getTaskNotes);

/**
 * @route   POST /api/v1/tasks/:id/notes
 * @desc    Add a note to a task
 * @access  Private
 */
router.route('/:id/notes').post(taskController.addNoteToTask);

/**
 * @route   PATCH /api/v1/tasks/:id/notes/:noteId
 * @desc    Update a specific note in a task
 * @access  Private
 */
router.route('/:id/notes/:noteId').patch(taskController.updateNoteInTask);

/**
 * @route   DELETE /api/v1/tasks/:id/notes/:noteId
 * @desc    Delete a specific note from a task
 * @access  Private
 */
router.route('/:id/notes/:noteId').delete(taskController.deleteNoteFromTask);

// --- History Routes ---

/**
 * @route   GET /api/v1/tasks/:id/history
 * @desc    Get task history/activity log (with pagination and filtering)
 * @access  Private
 */
router.route('/:id/history').get(taskController.getTaskHistory);

/**
 * @route   POST /api/v1/tasks/:id/history
 * @desc    Add a manual history entry (for special events)
 * @access  Private
 */
router.route('/:id/history').post(taskController.addHistoryEntry);

/**
 * @route   GET /api/v1/tasks/:id/activity
 * @desc    Get task activity summary (recent notes, history, and stats)
 * @access  Private
 */
router.route('/:id/activity').get(taskController.getTaskActivitySummary);

module.exports = router;