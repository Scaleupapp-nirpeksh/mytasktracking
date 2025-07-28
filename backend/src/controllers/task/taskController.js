/**
 * Enhanced Task Controller with Manager Meeting Features
 * 
 * HTTP request handlers for task management operations:
 * - CRUD operations for tasks
 * - Subtask and personal notes management
 * - File attachment handling
 * - Manager meeting features and preparation
 * - Time tracking and analytics
 * - Meeting history and discussion tracking
 * 
 * @author Nirpeksh Scale Up App
 * @version 2.0.0 - Enhanced for Manager Meetings
 */

const Task = require('../../models/task/Task');
const ManagerMeeting = require('../../models/task/ManagerMeeting');
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
    createdBy: userId, // Single user - always filter by current user
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
    .populate('createdBy', 'firstName lastName email avatar')
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
        urgentTasks: { $sum: { $cond: [{ $eq: ['$priority', 'urgent'] }, 1, 0] } },
        keyTasks: { $sum: { $cond: ['$isKeyTask', 1, 0] } }
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
      urgentTasks: 0,
      keyTasks: 0
    },
    data: {
      tasks
    }
  });
});

/**
 * @desc    Get key tasks for manager meetings (FIXED)
 * @route   GET /api/tasks/key-tasks
 * @access  Private
 */
const getKeyTasks = catchAsync(async (req, res) => {
  const workspaceId = req.workspace.id;
  const userId = req.user.id;

  // FIXED: Use the correct static method
  const keyTasks = await Task.findKeyTasksWithHistory(workspaceId, userId);

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
 * @desc    Get tasks ready for manager discussion
 * @route   GET /api/tasks/ready-for-discussion
 * @access  Private
 */
const getTasksReadyForDiscussion = catchAsync(async (req, res) => {
  const workspaceId = req.workspace.id;
  const userId = req.user.id;
  const { daysSince = 7 } = req.query;

  const tasksReady = await Task.findTasksReadyForDiscussion(
    workspaceId, 
    userId, 
    parseInt(daysSince)
  );

  // Separate by urgency
  const urgentTasks = tasksReady.filter(task => 
    task.priority === 'urgent' || 
    task.hasUnresolvedBlockers || 
    task.isOverdue
  );

  const regularTasks = tasksReady.filter(task => !urgentTasks.includes(task));

  logBusiness('tasks_ready_for_discussion', userId, workspaceId, {
    totalReady: tasksReady.length,
    urgentCount: urgentTasks.length,
    daysSince
  });

  res.status(200).json({
    status: 'success',
    results: tasksReady.length,
    data: {
      urgentTasks,
      regularTasks,
      summary: {
        total: tasksReady.length,
        urgent: urgentTasks.length,
        regular: regularTasks.length,
        daysSinceLastDiscussion: parseInt(daysSince)
      }
    }
  });
});

/**
 * @desc    Get meeting preparation data
 * @route   GET /api/tasks/meeting-preparation
 * @access  Private
 */
const getMeetingPreparationData = catchAsync(async (req, res) => {
  const workspaceId = req.workspace.id;
  const userId = req.user.id;

  // Get key tasks with meeting history
  const keyTasks = await Task.findKeyTasksWithHistory(workspaceId, userId);
  
  // Get tasks ready for discussion
  const tasksReady = await Task.findTasksReadyForDiscussion(workspaceId, userId, 7);
  
  // Get last meeting info
  const lastMeeting = await ManagerMeeting.findLatestMeeting(userId, workspaceId);
  
  // Get pending action items across all tasks
  const tasksWithPendingActions = await Task.find({
    workspace: workspaceId,
    createdBy: userId,
    'managerNotes.currentActionItems.isCompleted': false,
    isArchived: false
  }).select('title managerNotes.currentActionItems priority status');

  // Combine preparation data
  const preparationData = {
    keyTasks: keyTasks.slice(0, 10), // Top 10 key tasks
    tasksReadyForDiscussion: tasksReady.slice(0, 15), // Top 15 ready tasks
    tasksWithBlockers: keyTasks.filter(task => task.hasUnresolvedBlockers),
    overdueTasks: keyTasks.filter(task => task.isOverdue),
    tasksWithPendingActions,
    lastMeeting: lastMeeting ? {
      id: lastMeeting._id,
      date: lastMeeting.meetingDate,
      tasksDiscussed: lastMeeting.tasksDiscussed.length,
      actionItems: lastMeeting.actionItems.length,
      rating: lastMeeting.meetingRating
    } : null
  };

  logBusiness('meeting_preparation_data_retrieved', userId, workspaceId, {
    keyTasksCount: preparationData.keyTasks.length,
    readyTasksCount: preparationData.tasksReadyForDiscussion.length,
    blockersCount: preparationData.tasksWithBlockers.length
  });

  res.status(200).json({
    status: 'success',
    data: preparationData
  });
});

/**
 * @desc    Get single task by ID with meeting context
 * @route   GET /api/tasks/:id
 * @access  Private
 */
const getTask = catchAsync(async (req, res) => {
  const task = req.task; // Set by canViewTask middleware

  // Populate all necessary fields
  await task.populate([
    { path: 'createdBy', select: 'firstName lastName email avatar' },
    { path: 'workspace', select: 'name type color' },
    { path: 'parentTask', select: 'title status priority' }
  ]);

  // Get subtasks (child tasks)
  const subtasks = await Task.find({ parentTask: task.id })
    .populate('createdBy', 'firstName lastName email avatar')
    .sort({ createdAt: 1 });

  // Get dependencies
  const dependencies = await Task.find({ 
    _id: { $in: task.dependencies.map(dep => dep.task) }
  }).select('title status priority dueDate');

  // Get meeting history for this task
  const meetingHistory = await ManagerMeeting.find({
    'tasksDiscussed.task': task.id,
    user: req.user.id,
    isArchived: false
  }).select('meetingDate tasksDiscussed actionItems meetingRating')
    .sort({ meetingDate: -1 })
    .limit(5);

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
      meetingHistory,
      analytics: {
        totalTimeSpent: task.totalTimeSpent,
        hasActiveTimer: task.hasActiveTimer,
        isOverdue: task.isOverdue,
        daysUntilDue: task.daysUntilDue,
        subtaskProgress: task.subtaskProgress,
        meetingDiscussionFrequency: task.meetingDiscussionFrequency,
        hasUnresolvedBlockers: task.hasUnresolvedBlockers,
        pendingActionItemsCount: task.pendingActionItemsCount
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

  // Create task data (single user - no assignment needed)
  const taskData = {
    ...req.body,
    workspace: workspaceId,
    createdBy: userId,
    taskNumber
  };

  const task = new Task(taskData);
  await task.save();

  // Update workspace stats
  await req.workspace.updateStats({
    totalTasks: req.workspace.stats.totalTasks + 1
  });

  // Populate created task
  await task.populate([
    { path: 'createdBy', select: 'firstName lastName email avatar' },
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
      updates.progress = 100;
    } else if (updates.status !== 'done' && task.completedAt) {
      updates.completedAt = null;
    }
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
    { path: 'createdBy', select: 'firstName lastName email avatar' },
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
  await task.archive();

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
  const { title, order, notes } = req.body;
  const userId = req.user.id;

  await task.addSubtask(title, order, notes);

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

  await task.toggleSubtask(subtaskId);

  logBusiness('subtask_toggled', userId, req.workspace.id, {
    taskId: task.id,
    subtaskId,
    isCompleted: task.subtasks.id(subtaskId).isCompleted
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
 * @desc    Add personal note to task (Single User)
 * @route   POST /api/tasks/:id/notes
 * @access  Private
 */
const addPersonalNote = catchAsync(async (req, res) => {
  const task = req.task;
  const { content, noteType = 'general', isImportant = false } = req.body;
  const userId = req.user.id;

  await task.addPersonalNote(content, noteType, isImportant);
  
  // Get the new note
  const newNote = task.personalNotes[task.personalNotes.length - 1];

  logBusiness('personal_note_added', userId, req.workspace.id, {
    taskId: task.id,
    noteType,
    isImportant,
    contentLength: content.length
  });

  res.status(201).json({
    status: 'success',
    message: 'Personal note added successfully',
    data: {
      note: newNote
    }
  });
});

/**
 * @desc    Update personal note
 * @route   PATCH /api/tasks/:id/notes/:noteId
 * @access  Private
 */
const updatePersonalNote = catchAsync(async (req, res) => {
  const task = req.task;
  const { noteId } = req.params;
  const { content, noteType, isImportant } = req.body;
  const userId = req.user.id;

  const note = task.personalNotes.id(noteId);
  if (!note) {
    throw new NotFoundError('Personal note not found');
  }

  // Update note fields
  if (content !== undefined) note.content = content;
  if (noteType !== undefined) note.noteType = noteType;
  if (isImportant !== undefined) note.isImportant = isImportant;
  
  note.isEdited = true;
  note.editedAt = new Date();

  await task.save();

  logBusiness('personal_note_updated', userId, req.workspace.id, {
    taskId: task.id,
    noteId,
    noteType: note.noteType
  });

  res.status(200).json({
    status: 'success',
    message: 'Personal note updated successfully',
    data: {
      note
    }
  });
});

/**
 * @desc    Delete personal note
 * @route   DELETE /api/tasks/:id/notes/:noteId
 * @access  Private
 */
const deletePersonalNote = catchAsync(async (req, res) => {
  const task = req.task;
  const { noteId } = req.params;
  const userId = req.user.id;

  const note = task.personalNotes.id(noteId);
  if (!note) {
    throw new NotFoundError('Personal note not found');
  }

  task.personalNotes.pull(noteId);
  await task.save();

  logBusiness('personal_note_deleted', userId, req.workspace.id, {
    taskId: task.id,
    noteId
  });

  res.status(200).json({
    status: 'success',
    message: 'Personal note deleted successfully'
  });
});

/**
 * @desc    Add meeting preparation notes
 * @route   PATCH /api/tasks/:id/meeting-prep
 * @access  Private
 */
const addMeetingPreparationNotes = catchAsync(async (req, res) => {
  const task = req.task;
  const { preparationNotes } = req.body;
  const userId = req.user.id;

  if (!preparationNotes || preparationNotes.trim().length === 0) {
    throw new ValidationError('Preparation notes are required');
  }

  await task.prepareMeetingNotes(preparationNotes);

  logBusiness('meeting_prep_notes_added', userId, req.workspace.id, {
    taskId: task.id,
    notesLength: preparationNotes.length
  });

  res.status(200).json({
    status: 'success',
    message: 'Meeting preparation notes added successfully',
    data: {
      preparationNotes: task.managerNotes.preparationNotes,
      lastPreparationDate: task.managerNotes.lastPreparationDate
    }
  });
});

/**
 * @desc    Add blocker to task
 * @route   POST /api/tasks/:id/blockers
 * @access  Private
 */
const addTaskBlocker = catchAsync(async (req, res) => {
  const task = req.task;
  const { description, severity = 'medium' } = req.body;
  const userId = req.user.id;

  if (!description || description.trim().length === 0) {
    throw new ValidationError('Blocker description is required');
  }

  await task.addBlocker(description, severity);

  const newBlocker = task.managerNotes.currentBlockers[task.managerNotes.currentBlockers.length - 1];

  logBusiness('task_blocker_added', userId, req.workspace.id, {
    taskId: task.id,
    blockerId: newBlocker._id,
    severity
  });

  res.status(201).json({
    status: 'success',
    message: 'Blocker added successfully',
    data: {
      blocker: newBlocker,
      hasUnresolvedBlockers: task.hasUnresolvedBlockers
    }
  });
});

/**
 * @desc    Resolve task blocker
 * @route   PATCH /api/tasks/:id/blockers/:blockerId
 * @access  Private
 */
const resolveTaskBlocker = catchAsync(async (req, res) => {
  const task = req.task;
  const { blockerId } = req.params;
  const userId = req.user.id;

  await task.resolveBlocker(blockerId);

  const resolvedBlocker = task.managerNotes.currentBlockers.id(blockerId);

  logBusiness('task_blocker_resolved', userId, req.workspace.id, {
    taskId: task.id,
    blockerId
  });

  res.status(200).json({
    status: 'success',
    message: 'Blocker resolved successfully',
    data: {
      blocker: resolvedBlocker,
      hasUnresolvedBlockers: task.hasUnresolvedBlockers
    }
  });
});

/**
 * @desc    Add task meeting history entry
 * @route   POST /api/tasks/:id/meeting-history
 * @access  Private
 */
const addTaskMeetingHistory = catchAsync(async (req, res) => {
  const task = req.task;
  const { meetingId, meetingData } = req.body;
  const userId = req.user.id;

  if (!meetingId) {
    throw new ValidationError('Meeting ID is required');
  }

  // Verify meeting exists and belongs to user
  const meeting = await ManagerMeeting.findOne({
    _id: meetingId,
    user: userId,
    workspace: req.workspace.id
  });

  if (!meeting) {
    throw new NotFoundError('Meeting not found or access denied');
  }

  await task.addMeetingHistory(meetingId, meetingData);

  logBusiness('task_meeting_history_added', userId, req.workspace.id, {
    taskId: task.id,
    meetingId,
    discussedAt: meetingData.discussedAt
  });

  res.status(201).json({
    status: 'success',
    message: 'Meeting history added successfully',
    data: {
      meetingHistory: task.managerNotes.meetingHistory,
      lastDiscussedAt: task.managerNotes.lastDiscussedAt,
      totalMeetingsDiscussed: task.managerNotes.totalMeetingsDiscussed
    }
  });
});

/**
 * @desc    Get task meeting history
 * @route   GET /api/tasks/:id/meeting-history
 * @access  Private
 */
const getTaskMeetingHistory = catchAsync(async (req, res) => {
  const task = req.task;
  const userId = req.user.id;

  // Get detailed meeting history
  const meetings = await ManagerMeeting.find({
    'tasksDiscussed.task': task.id,
    user: userId,
    isArchived: false
  }).populate('workspace', 'name type')
    .sort({ meetingDate: -1 });

  // Get task's internal meeting history
  const taskMeetingHistory = task.managerNotes.meetingHistory;

  logBusiness('task_meeting_history_retrieved', userId, req.workspace.id, {
    taskId: task.id,
    meetingsCount: meetings.length
  });

  res.status(200).json({
    status: 'success',
    data: {
      meetings,
      taskMeetingHistory,
      summary: {
        totalMeetingsDiscussed: task.managerNotes.totalMeetingsDiscussed,
        lastDiscussedAt: task.managerNotes.lastDiscussedAt,
        meetingFrequency: task.meetingDiscussionFrequency
      }
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
  const { description = '', sessionType = 'focused_work' } = req.body;
  const userId = req.user.id;

  await task.startTimer(description, sessionType);

  logBusiness('timer_started', userId, req.workspace.id, {
    taskId: task.id,
    sessionType
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

  await task.stopTimer();

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
        createdBy: userId,
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
        createdBy: userId,
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
        createdBy: userId,
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

  // Time tracking analytics
  const timeAnalytics = await Task.aggregate([
    {
      $match: {
        workspace: workspaceId,
        createdBy: userId,
        isArchived: false,
        'timeLogs.0': { $exists: true }
      }
    },
    {
      $project: {
        title: 1,
        totalTimeSpent: { $sum: '$timeLogs.duration' },
        estimatedDuration: 1,
        actualDuration: 1
      }
    },
    {
      $group: {
        _id: null,
        totalTimeLogged: { $sum: '$totalTimeSpent' },
        averageTimePerTask: { $avg: '$totalTimeSpent' },
        tasksWithTimeTracking: { $sum: 1 }
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
        timeAnalytics: timeAnalytics[0] || {
          totalTimeLogged: 0,
          averageTimePerTask: 0,
          tasksWithTimeTracking: 0
        },
        timeRange: `${timeRange} days`
      }
    }
  });
});

module.exports = {
  // Core CRUD operations
  getTasks,
  getTask,
  createTask,
  updateTask,
  deleteTask,
  
  // Subtask management
  addSubtask,
  toggleSubtask,
  
  // Personal notes (single user)
  addPersonalNote,
  updatePersonalNote,
  deletePersonalNote,
  
  // Manager meeting features
  getKeyTasks,
  getTasksReadyForDiscussion,
  getMeetingPreparationData,
  addMeetingPreparationNotes,
  toggleKeyTask,
  
  // Blocker management
  addTaskBlocker,
  resolveTaskBlocker,
  
  // Meeting history
  addTaskMeetingHistory,
  getTaskMeetingHistory,
  
  // Time tracking
  startTimer,
  stopTimer,
  
  // Analytics
  getTaskAnalytics
};