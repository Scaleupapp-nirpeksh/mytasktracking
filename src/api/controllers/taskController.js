// src/api/controllers/taskController.js

const Task = require('../models/taskModel');
const Workspace = require('../models/workspaceModel');
const catchAsync = require('../../utils/catchAsync');
const AppError = require('../../utils/appError');
const upload = require('../../utils/s3Upload');

// Middleware to handle single file upload, field name 'attachment'
exports.uploadTaskFile = upload.single('attachment');

/**
 * Adds a file attachment's metadata to a task.
 * This controller runs *after* the file has been uploaded to S3 by the middleware.
 */
exports.addAttachmentToTask = catchAsync(async (req, res, next) => {
  // 1) Check if a file was uploaded
  if (!req.file) {
    return next(new AppError('Please upload a file.', 400));
  }

  // 2) Find the task and verify ownership
  const task = await Task.findById(req.params.id);
  if (!task) {
    return next(new AppError('No task found with that ID', 404));
  }
  const workspace = await Workspace.findOne({ _id: task.workspace, owner: req.user.id });
  if (!workspace) {
    return next(new AppError('You do not have permission to modify this task.', 403));
  }

  // 3) Create the new attachment object with metadata from S3
  const newAttachment = {
    fileName: req.file.originalname,
    fileUrl: req.file.location, // URL from multer-s3
    fileKey: req.file.key,       // Key from multer-s3
  };

  // 4) Add the new attachment to the task's attachments array
  task.attachments.push(newAttachment);
  await task.save();

  res.status(200).json({
    status: 'success',
    data: {
      task,
    },
  });
});


/**
 * Middleware to set user and workspace IDs for task creation.
 * This runs before the createTask controller to simplify it.
 */
exports.setWorkspaceUserIds = (req, res, next) => {
  // Allow nested routes
  if (!req.body.workspace) req.body.workspace = req.params.workspaceId;
  if (!req.body.user) req.body.user = req.user.id;
  next();
};

/**
 * Creates a new task.
 *
 * Ensures the user owns the workspace they are trying to add a task to.
 */
exports.createTask = catchAsync(async (req, res, next) => {
  // 1) Check if the user owns the workspace
  const workspace = await Workspace.findOne({
    _id: req.body.workspace,
    owner: req.user.id,
  });

  if (!workspace) {
    return next(
      new AppError(
        'Workspace not found or you do not have permission to add a task to it.',
        404
      )
    );
  }

  // 2) Create the task
  const newTask = await Task.create(req.body);

  res.status(201).json({
    status: 'success',
    data: {
      task: newTask,
    },
  });
});

/**
 * Fetches all tasks, with filtering capabilities.
 *
 * Ensures tasks are only fetched from a workspace owned by the user.
 */
exports.getAllTasks = catchAsync(async (req, res, next) => {
  // Build the initial query to filter by the user's workspace
  let filter = {};
  if (req.params.workspaceId) {
    // Ensure the user owns this workspace before fetching tasks
    const workspace = await Workspace.findOne({
      _id: req.params.workspaceId,
      owner: req.user.id,
    });
    if (!workspace) {
      return next(new AppError('Cannot access tasks in this workspace.', 403));
    }
    filter = { workspace: req.params.workspaceId };
  } else {
    // If no workspace is specified, find all workspaces for the user and get tasks from them
    const userWorkspaces = await Workspace.find({ owner: req.user.id }).select('_id');
    const workspaceIds = userWorkspaces.map(ws => ws._id);
    filter = { workspace: { $in: workspaceIds } };
  }

  // Allow further filtering from query string (e.g., ?status=Done&priority=High)
  const queryObj = { ...req.query };
  const excludedFields = ['page', 'sort', 'limit', 'fields'];
  excludedFields.forEach(el => delete queryObj[el]);
  
  let query = Task.find({ ...filter, ...queryObj });

  // Sorting
  if (req.query.sort) {
    const sortBy = req.query.sort.split(',').join(' ');
    query = query.sort(sortBy);
  } else {
    query = query.sort('-createdAt'); // Default sort
  }

  const tasks = await query;

  res.status(200).json({
    status: 'success',
    results: tasks.length,
    data: {
      tasks,
    },
  });
});

/**
 * Fetches a single task by its ID.
 */
exports.getTask = catchAsync(async (req, res, next) => {
  const task = await Task.findById(req.params.id);

  if (!task) {
    return next(new AppError('No task found with that ID', 404));
  }

  // Security check: ensure the user owns the workspace this task belongs to
  const workspace = await Workspace.findOne({
    _id: task.workspace,
    owner: req.user.id,
  });

  if (!workspace) {
    return next(new AppError('You do not have permission to view this task.', 403));
  }

  res.status(200).json({
    status: 'success',
    data: {
      task,
    },
  });
});

/**
 * Updates a task.
 */
exports.updateTask = catchAsync(async (req, res, next) => {
  // First, find the task to ensure it exists and the user has permission
  const taskToUpdate = await Task.findById(req.params.id);
  if (!taskToUpdate) {
    return next(new AppError('No task found with that ID', 404));
  }
  const workspace = await Workspace.findOne({ _id: taskToUpdate.workspace, owner: req.user.id });
  if (!workspace) {
    return next(new AppError('You do not have permission to update this task.', 403));
  }

  // Then, perform the update
  const updatedTask = await Task.findByIdAndUpdate(req.params.id, req.body, {
    new: true, // Return the modified document
    runValidators: true, // Run schema validators on update
  });

  res.status(200).json({
    status: 'success',
    data: {
      task: updatedTask,
    },
  });
});

/**
 * Deletes a task.
 */
exports.deleteTask = catchAsync(async (req, res, next) => {
  // First, find the task to ensure it exists and the user has permission
  const taskToDelete = await Task.findById(req.params.id);
  if (!taskToDelete) {
    return next(new AppError('No task found with that ID', 404));
  }
  const workspace = await Workspace.findOne({ _id: taskToDelete.workspace, owner: req.user.id });
  if (!workspace) {
    return next(new AppError('You do not have permission to delete this task.', 403));
  }

  // Then, perform the deletion
  await Task.findByIdAndDelete(req.params.id);

  res.status(204).json({
    status: 'success',
    data: null,
  });
});
