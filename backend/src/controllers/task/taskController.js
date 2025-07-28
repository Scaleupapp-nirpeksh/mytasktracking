/**
 * Task Controller
 * 
 * HTTP request handlers for task management operations:
 * - CRUD operations for tasks
 * - Subtask and comment management
 * - File attachment handling
 * - Manager meeting features
 * - Time tracking and analytics
 * 
 * @author Nirpeksh Scale Up App
 * @version 1.0.0
 */

const Task = require('../../models/task/Task');
const Workspace = require('../../models/workspace/Workspace');
const { catchAsync } = require('../../middleware/error');
const { NotFoundError, ValidationError, AuthorizationError } = require('../../middleware/error');
const { logBusiness, logger } = require('../../utils/logger/logger');

/**
 * Helper function to build task query filters
 */
const buildTaskFilters = (query, workspaceId, userId = null) => {
  const filters = { 
    workspace: workspaceId,
    isArchived: false 
  };

  // Status filter
  if (query.status) {
    if (Array.isArray(query.status)) {
      filters.status = { $in: query.status };
    } else {
      filters.status = query.status;
    }
  }

  // Priority filter
  if (query.priority) {
    if (Array.isArray(query.priority)) {
      filters.priority = { $in: query.priority };
    } else {
      filters.priority = query.priority;
    }
  }

  // Assigned user filter
  if (query.assignedTo) {
    filters.assignedTo = query.assignedTo;
  }

  // Category filter
  if (query.category) {
    filters.category = new RegExp(query.category, 'i');
  }

  // Tags filter
  if (query.tags) {
    const tags = Array.isArray(query.tags) ? query.tags : [query.tags];
    filters.tags = { $in: tags };
  }

  // Key task filter
  if (query.isKeyTask !== undefined) {
    filters.isKeyTask = query.isKeyTask === 'true' || query.isKeyTask === true;
  }

  // Date range filters
  if (query.dueDateFrom || query.dueDateTo) {
    filters.dueDate = {};
    if (query.dueDateFrom) {
      filters.dueDate.$gte = new Date(query.dueDateFrom);
    }
    if (query.dueDateTo) {
      filters.dueDate.$lte = new Date(query.dueDateTo);
    }
  }

  if (query.createdFrom || query.createdTo) {
    filters.createdAt = {};
    if (query.createdFrom) {
      filters.createdAt.$gte = new Date(query.createdFrom);
    }
    if (query.createdTo) {
      filters.createdAt.$lte = new Date(query.createdTo);
    }
  }

  // User-specific filter (my tasks)
  if (query.myTasks === 'true' && userId) {
    filters.$or = [
      { createdBy: userId },
      { assignedTo: userId }
    ];
  }

  return filters;
};

/**
 * Helper function to build sort options
 */
const buildSortOptions = (sortBy = 'lastActivityAt', sortOrder = 'desc') => {
  const sortDirection = sortOrder === 'asc' || sortOrder === '1' ? 1 : -1;
  
  const sortMap = {
    title: { title: sortDirection },
    priority: { priority: sortDirection, dueDate: 1 },
    status: { status: sortDirection, lastActivityAt: -1 },
    dueDate: { dueDate: sortDirection },
    createdAt: { createdAt: sortDirection },
    updatedAt: { updatedAt: sortDirection },
    lastActivityAt: { lastActivityAt: sortDirection }
  };

  return sortMap[sortBy] || sortMap.lastActivityAt;
};

/**
 * @desc    Get all tasks in workspace
 * @route   GET /api/tasks
 * @access  Private
 */
const getTasks = catchAsync(async (req, res) => {
  const workspaceId = req.workspace.id;
  const userId = req.user.id;
  const query = req.query;

  // Build filters and pagination
  const filters = buildTaskFilters(query, workspaceId, userId);
  const sort = buildSortOptions(query.sortBy, query.sortOrder);
  const page = parseInt(query.page) || 1;
  const limit = Math.min(parseInt(query.limit) || 25, 100); // Max 100 items per page
  const skip = (page - 1) * limit;

  // Execute query with population
  const tasks = await Task.find(filters)
    .populate('createdBy assignedTo', 'firstName lastName email avatar')
    .populate('workspace', 'name type color')
    .sort(sort)
    .skip(skip)
    .limit(limit)
    .lean(); // Use lean for better performance

  // Get total count for pagination
  const totalTasks = await Task.countDocuments(filters);
  const totalPages = Math.ceil(totalTasks / limit);

  // Calculate statistics
  const stats = await Task.aggregate([
    { $match: filters },
    {
      $group: {
        _id: null,
        totalTasks: { $sum: 1 },
        completedTasks: { $sum: { $cond: [{ $eq: ['$status', 'done'] }, 1, 0] } },
        overdueTasks: { 
          $sum: { 
            $cond: [
              { 
                $and: [
                  { $lt: ['$dueDate', new Date()] },
                  { $nin: ['$status', ['done', 'cancelled']] }
                ]
              }, 
              1, 
              0
            ] 
          } 
        },
        urgentTasks: { $sum: { $cond: [{ $eq: ['$priority', 'urgent'] }, 1, 0] } }
      }
    }
  ]);

  logBusiness('tasks_retrieved', userId, workspaceId, {
    taskCount: tasks.length,
    filters: Object.keys(filters),
    page,
    limit
  });

  res.status(200).json({
    status: 'success',
    results: tasks.length,
    pagination: {
      page,
      limit,
      totalPages,
      totalTasks,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1
    },
    stats: stats[0] || {
      totalTasks: 0,
      completedTasks: 0,
      overdueTasks: 0,
      urgentTasks: 0
    },
    data: {
      tasks
    }
  });
});

/**
 * @desc    Get key tasks for manager meetings
 * @route   GET /api/tasks/key-tasks
 * @access  Private
 */
const getKeyTasks = catchAsync(async (req, res) => {
  const workspaceId = req.workspace.id;
  const userId = req.user.id;

  const keyTasks = await Task.findKeyTasks(workspaceId, userId);

  // Group tasks by status for better presentation
  const groupedTasks = keyTasks.reduce((acc, task) => {
    if (!acc[task.status]) acc[task.status] = [];
    acc[task.status].push(task);
    return acc;
  }, {});

  logBusiness('key_tasks_retrieved', userId, workspaceId, {
    keyTaskCount: keyTasks.length,
    statusGroups: Object.keys(groupedTasks)
  });

  res.status(200).json({
    status: 'success',
    results: keyTasks.length,
    data: {
      keyTasks,
      groupedByStatus: groupedTasks,
      summary: {
        total: keyTasks.length,
        inProgress: groupedTasks.in_progress?.length || 0,
        blocked: groupedTasks.blocked?.length || 0,
        review: groupedTasks.review?.length || 0,
        completed: groupedTasks.done?.length || 0
      }
    }
  });
});

/**
 * @desc    Get single task by ID
 * @route   GET /api/tasks/:id
 * @access  Private
 */
const getTask = catchAsync(async (req, res) => {
  const task = req.task; // Set by canViewTask middleware

  // Populate all necessary fields
  await task.populate([
    { path: 'createdBy assignedTo', select: 'firstName lastName email avatar' },
    { path: 'workspace', select: 'name type color' },
    { path: 'parentTask', select: 'title status priority' },
    { path: 'comments.author', select: 'firstName lastName avatar' },
    { path: 'timeLogs.user', select: 'firstName lastName' },
    { path: 'attachments.uploadedBy', select: 'firstName lastName' }
  ]);

  // Get subtasks (child tasks)
  const subtasks = await Task.find({ parentTask: task.id })
    .populate('createdBy assignedTo', 'firstName lastName email avatar')
    .sort({ createdAt: 1 });

  // Get dependencies
  const dependencies = await Task.find({ 
    _id: { $in: task.dependencies.map(dep => dep.task) }
  }).select('title status priority dueDate');

  logBusiness('task_viewed', req.user.id, req.workspace.id, {
    taskId: task.id,
    taskTitle: task.title,
    isKeyTask: task.isKeyTask
  });

  res.status(200).json({
    status: 'success',
    data: {
      task,
      subtasks,
      dependencies,
      analytics: {
        totalTimeSpent: task.totalTimeSpent,
        hasActiveTimer: task.hasActiveTimer,
        isOverdue: task.isOverdue,
        daysUntilDue: task.daysUntilDue,
        subtaskProgress: task.subtaskProgress
      }
    }
  });
});

/**
 * @desc    Create new task
 * @route   POST /api/tasks
 * @access  Private
 */
const createTask = catchAsync(async (req, res) => {
  const workspaceId = req.workspace.id;
  const userId = req.user.id;
  
  // Generate task number if workspace has numbering enabled
  let taskNumber = null;
  if (req.workspace.settings.taskNumbering.enabled) {
    const prefix = req.workspace.settings.taskNumbering.prefix;
    const counter = req.workspace.settings.taskNumbering.counter;
    taskNumber = `${prefix}-${counter.toString().padStart(4, '0')}`;
    
    // Increment counter
    await Workspace.findByIdAndUpdate(workspaceId, {
      $inc: { 'settings.taskNumbering.counter': 1 }
    });
  }

  // Create task data
  const taskData = {
    ...req.body,
    workspace: workspaceId,
    createdBy: userId,
    taskNumber
  };

  // Set assignedTo to creator if not specified
  if (!taskData.assignedTo) {
    taskData.assignedTo = userId;
    taskData.assignedAt = new Date();
    taskData.assignedBy = userId;
  }

  const task = new Task(taskData);
  await task.save();

  // Update workspace stats
  await req.workspace.updateStats({
    totalTasks: req.workspace.stats.totalTasks + 1
  });

  // Populate created task
  await task.populate([
    { path: 'createdBy assignedTo', select: 'firstName lastName email avatar' },
    { path: 'workspace', select: 'name type color' }
  ]);

  logBusiness('task_created', userId, workspaceId, {
    taskId: task.id,
    taskTitle: task.title,
    taskNumber: task.taskNumber,
    priority: task.priority,
    isKeyTask: task.isKeyTask
  });

  res.status(201).json({
    status: 'success',
    message: 'Task created successfully',
    data: {
      task
    }
  });
});

/**
 * @desc    Update task
 * @route   PATCH /api/tasks/:id
 * @access  Private
 */
const updateTask = catchAsync(async (req, res) => {
  const task = req.task; // Set by canViewTask and canEditTask middleware
  const userId = req.user.id;
  const updates = req.body;

  // Track what fields are being updated
  const updatedFields = Object.keys(updates);

  // Handle status changes
  if (updates.status && updates.status !== task.status) {
    if (updates.status === 'done' && !task.completedAt) {
      updates.completedAt = new Date();
      updates.completedBy = userId;
      updates.progress = 100;
    } else if (updates.status !== 'done' && task.completedAt) {
      updates.completedAt = null;
      updates.completedBy = null;
    }
  }

  // Handle assignment changes
  if (updates.assignedTo && updates.assignedTo !== task.assignedTo?.toString()) {
    updates.assignedAt = new Date();
    updates.assignedBy = userId;
  }

  // Apply updates
  Object.assign(task, updates);
  await task.save();

  // Update workspace stats if status changed
  if (updatedFields.includes('status')) {
    const completedCount = await Task.countDocuments({
      workspace: task.workspace,
      status: 'done',
      isArchived: false
    });
    
    await req.workspace.updateStats({
      completedTasks: completedCount
    });
  }

  // Populate updated task
  await task.populate([
    { path: 'createdBy assignedTo', select: 'firstName lastName email avatar' },
    { path: 'workspace', select: 'name type color' }
  ]);

  logBusiness('task_updated', userId, req.workspace.id, {
    taskId: task.id,
    taskTitle: task.title,
    updatedFields,
    newStatus: task.status
  });

  res.status(200).json({
    status: 'success',
    message: 'Task updated successfully',
    data: {
      task
    }
  });
});

/**
 * @desc    Delete task
 * @route   DELETE /api/tasks/:id
 * @access  Private
 */
const deleteTask = catchAsync(async (req, res) => {
  const task = req.task; // Set by canViewTask and canDeleteTask middleware
  const userId = req.user.id;

  // Archive task instead of hard delete
  await task.archive(userId);

  // Update workspace stats
  await req.workspace.updateStats({
    totalTasks: req.workspace.stats.totalTasks - 1
  });

  logBusiness('task_deleted', userId, req.workspace.id, {
    taskId: task.id,
    taskTitle: task.title,
    taskNumber: task.taskNumber
  });

  res.status(200).json({
    status: 'success',
    message: 'Task deleted successfully'
  });
});

/**
 * @desc    Add subtask to task
 * @route   POST /api/tasks/:id/subtasks
 * @access  Private
 */
const addSubtask = catchAsync(async (req, res) => {
  const task = req.task; // Set by middleware
  const { title, order } = req.body;
  const userId = req.user.id;

  await task.addSubtask(title, order);

  logBusiness('subtask_added', userId, req.workspace.id, {
    taskId: task.id,
    subtaskTitle: title
  });

  res.status(201).json({
    status: 'success',
    message: 'Subtask added successfully',
    data: {
      subtasks: task.subtasks,
      progress: task.subtaskProgress
    }
  });
});

/**
 * @desc    Toggle subtask completion
 * @route   PATCH /api/tasks/:id/subtasks/:subtaskId
 * @access  Private
 */
const toggleSubtask = catchAsync(async (req, res) => {
  const task = req.task;
  const { subtaskId } = req.params;
  const userId = req.user.id;

  const subtask = task.subtasks.id(subtaskId);
  if (!subtask) {
    throw new NotFoundError('Subtask not found');
  }

  await task.toggleSubtask(subtaskId, userId);

  logBusiness('subtask_toggled', userId, req.workspace.id, {
    taskId: task.id,
    subtaskId,
    isCompleted: subtask.isCompleted
  });

  res.status(200).json({
    status: 'success',
    message: 'Subtask updated successfully',
    data: {
      subtask: task.subtasks.id(subtaskId),
      progress: task.subtaskProgress
    }
  });
});

/**
 * @desc    Add comment to task
 * @route   POST /api/tasks/:id/comments
 * @access  Private
 */
const addComment = catchAsync(async (req, res) => {
  const task = req.task;
  const { content } = req.body;
  const userId = req.user.id;

  await task.addComment(content, userId);
  
  // Populate the new comment
  const newComment = task.comments[task.comments.length - 1];
  await task.populate('comments.author', 'firstName lastName avatar');

  logBusiness('task_comment_added', userId, req.workspace.id, {
    taskId: task.id,
    commentLength: content.length
  });

  res.status(201).json({
    status: 'success',
    message: 'Comment added successfully',
    data: {
      comment: newComment
    }
  });
});

/**
 * @desc    Add manager feedback to task
 * @route   POST /api/tasks/:id/manager-feedback
 * @access  Private
 */
const addManagerFeedback = catchAsync(async (req, res) => {
  const task = req.task;
  const { priorityFeedback, actionItems = [], blockers = [] } = req.body;
  const userId = req.user.id;

  await task.addManagerFeedback(priorityFeedback, actionItems, blockers);

  logBusiness('manager_feedback_added', userId, req.workspace.id, {
    taskId: task.id,
    actionItemsCount: actionItems.length,
    blockersCount: blockers.length
  });

  res.status(200).json({
    status: 'success',
    message: 'Manager feedback added successfully',
    data: {
      managerNotes: task.managerNotes
    }
  });
});

/**
 * @desc    Toggle key task status
 * @route   PATCH /api/tasks/:id/key-task
 * @access  Private
 */
const toggleKeyTask = catchAsync(async (req, res) => {
  const task = req.task;
  const { isKeyTask } = req.body;
  const userId = req.user.id;

  await task.markAsKeyTask(isKeyTask);

  logBusiness('key_task_toggled', userId, req.workspace.id, {
    taskId: task.id,
    isKeyTask: task.isKeyTask
  });

  res.status(200).json({
    status: 'success',
    message: `Task ${task.isKeyTask ? 'marked as' : 'removed from'} key task`,
    data: {
      task: {
        id: task.id,
        title: task.title,
        isKeyTask: task.isKeyTask
      }
    }
  });
});

/**
 * @desc    Start time tracking for task
 * @route   POST /api/tasks/:id/time/start
 * @access  Private
 */
const startTimer = catchAsync(async (req, res) => {
  const task = req.task;
  const { description = '' } = req.body;
  const userId = req.user.id;

  await task.startTimer(userId, description);

  logBusiness('timer_started', userId, req.workspace.id, {
    taskId: task.id
  });

  res.status(200).json({
    status: 'success',
    message: 'Timer started successfully',
    data: {
      hasActiveTimer: task.hasActiveTimer,
      totalTimeSpent: task.totalTimeSpent
    }
  });
});

/**
 * @desc    Stop time tracking for task
 * @route   POST /api/tasks/:id/time/stop
 * @access  Private
 */
const stopTimer = catchAsync(async (req, res) => {
  const task = req.task;
  const userId = req.user.id;

  await task.stopTimer(userId);

  logBusiness('timer_stopped', userId, req.workspace.id, {
    taskId: task.id,
    totalTimeSpent: task.totalTimeSpent
  });

  res.status(200).json({
    status: 'success',
    message: 'Timer stopped successfully',
    data: {
      hasActiveTimer: task.hasActiveTimer,
      totalTimeSpent: task.totalTimeSpent,
      actualDuration: task.actualDuration
    }
  });
});

/**
 * @desc    Get task analytics and insights
 * @route   GET /api/tasks/analytics
 * @access  Private
 */
const getTaskAnalytics = catchAsync(async (req, res) => {
  const workspaceId = req.workspace.id;
  const userId = req.user.id;
  const { timeRange = '30' } = req.query; // days

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - parseInt(timeRange));

  // Task completion trends
  const completionTrends = await Task.aggregate([
    {
      $match: {
        workspace: workspaceId,
        completedAt: { $gte: startDate },
        isArchived: false
      }
    },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$completedAt' } },
        count: { $sum: 1 }
      }
    },
    { $sort: { '_id': 1 } }
  ]);

  // Priority distribution
  const priorityDistribution = await Task.aggregate([
    {
      $match: {
        workspace: workspaceId,
        isArchived: false,
        status: { $ne: 'cancelled' }
      }
    },
    {
      $group: {
        _id: '$priority',
        count: { $sum: 1 }
      }
    }
  ]);

  // Status distribution
  const statusDistribution = await Task.aggregate([
    {
      $match: {
        workspace: workspaceId,
        isArchived: false
      }
    },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 }
      }
    }
  ]);

  res.status(200).json({
    status: 'success',
    data: {
      analytics: {
        completionTrends,
        priorityDistribution,
        statusDistribution,
        timeRange: `${timeRange} days`
      }
    }
  });
});

module.exports = {
  getTasks,
  getKeyTasks,
  getTask,
  createTask,
  updateTask,
  deleteTask,
  addSubtask,
  toggleSubtask,
  addComment,
  addManagerFeedback,
  toggleKeyTask,
  startTimer,
  stopTimer,
  getTaskAnalytics
};