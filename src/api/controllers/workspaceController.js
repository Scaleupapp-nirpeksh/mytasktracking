// src/api/controllers/workspaceController.js

const Workspace = require('../models/workspaceModel');
const catchAsync = require('../../utils/catchAsync');
const AppError = require('../../utils/appError');

/**
 * Fetches all workspaces belonging to the currently authenticated user.
 *
 * This controller retrieves the user ID from the request object (which is
 * attached by the 'protect' middleware) and queries the database for all
 * workspaces owned by that user.
 */
exports.getAllWorkspaces = catchAsync(async (req, res, next) => {
  // The 'protect' middleware has already attached the user object to the request.
  const userId = req.user.id;

  const workspaces = await Workspace.find({ owner: userId });

  // Send the response
  res.status(200).json({
    status: 'success',
    results: workspaces.length,
    data: {
      workspaces,
    },
  });
});

/**
 * Fetches a single workspace by its ID.
 *
 * Ensures that the requested workspace belongs to the authenticated user
 * to prevent users from accessing each other's data.
 */
exports.getWorkspace = catchAsync(async (req, res, next) => {
  const workspace = await Workspace.findOne({
    _id: req.params.id,
    owner: req.user.id,
  });

  if (!workspace) {
    return next(new AppError('No workspace found with that ID for this user.', 404));
  }

  res.status(200).json({
    status: 'success',
    data: {
      workspace,
    },
  });
});
