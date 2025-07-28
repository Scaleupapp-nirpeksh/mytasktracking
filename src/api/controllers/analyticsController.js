// src/api/controllers/analyticsController.js

const Task = require('../models/taskModel');
const Workspace = require('../models/workspaceModel');
const catchAsync = require('../../utils/catchAsync');
const AppError = require('../../utils/appError');

/**
 * Generates a weekly report for a specific workspace.
 *
 * This function calculates key metrics over the last 7 days, including
 * tasks created vs. completed, a breakdown of completed tasks by priority,
 * and a list of overdue tasks carried over.
 */
exports.getWeeklyReport = catchAsync(async (req, res, next) => {
  const { workspaceId } = req.params;

  // 1) Verify user owns the workspace
  const workspace = await Workspace.findOne({
    _id: workspaceId,
    owner: req.user.id,
  });

  if (!workspace) {
    return next(new AppError('Workspace not found or you do not have permission.', 404));
  }

  // 2) Define date range for the last 7 days
  const today = new Date();
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(today.getDate() - 7);

  // 3) Calculate metrics
  const tasksCreatedLastWeek = await Task.countDocuments({
    workspace: workspaceId,
    createdAt: { $gte: sevenDaysAgo },
  });

  const tasksCompletedLastWeek = await Task.countDocuments({
    workspace: workspaceId,
    status: 'Done',
    updatedAt: { $gte: sevenDaysAgo }, // Assuming updatedAt reflects completion time
  });

  const overdueTasks = await Task.countDocuments({
    workspace: workspaceId,
    status: { $ne: 'Done' },
    dueDate: { $lt: today },
  });

  // Aggregation for priority breakdown of completed tasks
  const priorityBreakdown = await Task.aggregate([
    {
      $match: {
        workspace: workspace._id,
        status: 'Done',
        updatedAt: { $gte: sevenDaysAgo },
      },
    },
    {
      $group: {
        _id: '$priority',
        count: { $sum: 1 },
      },
    },
  ]);

  // 4) Format the report
  const report = {
    workspaceName: workspace.name,
    dateRange: {
      from: sevenDaysAgo.toISOString(),
      to: today.toISOString(),
    },
    summary: {
      tasksCreated: tasksCreatedLastWeek,
      tasksCompleted: tasksCompletedLastWeek,
      overdueTasksCarriedOver: overdueTasks,
    },
    completedTasksByPriority: priorityBreakdown.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {}),
  };

  res.status(200).json({
    status: 'success',
    data: {
      report,
    },
  });
});
