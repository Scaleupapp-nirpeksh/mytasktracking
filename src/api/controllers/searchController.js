// src/api/controllers/searchController.js

const Task = require('../models/taskModel');
const Workspace = require('../models/workspaceModel');
const catchAsync = require('../../utils/catchAsync');
const AppError = require('../../utils/appError');

/**
 * Performs a global search for tasks across all of a user's workspaces.
 *
 * This function searches for a given query string within the 'title' and
 * 'description' fields of all tasks owned by the authenticated user.
 * It requires a text index on the Task model to function efficiently.
 */
exports.globalSearch = catchAsync(async (req, res, next) => {
  const { q } = req.query;

  if (!q) {
    return next(new AppError('Please provide a search query.', 400));
  }

  // 1) Find all workspaces owned by the user to scope the search
  const userWorkspaces = await Workspace.find({ owner: req.user.id }).select('_id');
  const workspaceIds = userWorkspaces.map(ws => ws._id);

  if (workspaceIds.length === 0) {
    return res.status(200).json({
      status: 'success',
      results: 0,
      data: {
        tasks: [],
      },
    });
  }

  // 2) Perform a text search on tasks within the user's workspaces
  const tasks = await Task.find({
    workspace: { $in: workspaceIds }, // Scope search to user's workspaces
    $text: { $search: q }, // Perform the text search
  })
  .populate('workspace', 'name type') // Populate workspace info for context
  .limit(20); // Limit results to a reasonable number

  res.status(200).json({
    status: 'success',
    results: tasks.length,
    data: {
      tasks,
    },
  });
});
