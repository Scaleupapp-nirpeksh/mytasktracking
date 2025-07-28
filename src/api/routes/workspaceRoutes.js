// src/api/routes/workspaceRoutes.js

const express = require('express');
const workspaceController = require('../controllers/workspaceController');
const authMiddleware = require('../middlewares/authMiddleware');
const taskRouter = require('./taskRoutes'); // <-- IMPORT THE TASK ROUTER

const router = express.Router();

// --- Protection Middleware ---
// Protect all workspace routes
router.use(authMiddleware.protect);


// --- Nested Route for Tasks ---
// This tells the workspace router to use the taskRouter for any path
// that looks like '/:workspaceId/tasks'. This is how we enable nested routes.
router.use('/:workspaceId/tasks', taskRouter);


// --- Main Workspace Routes ---

/**
 * @route   GET /api/v1/workspaces
 * @desc    Get all workspaces for the logged-in user
 * @access  Private
 */
router
  .route('/')
  .get(workspaceController.getAllWorkspaces);

/**
 * @route   GET /api/v1/workspaces/:id
 * @desc    Get a single workspace by ID
 * @access  Private
 */
router
  .route('/:id')
  .get(workspaceController.getWorkspace);

module.exports = router;
