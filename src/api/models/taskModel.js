// src/api/models/taskModel.js

const mongoose = require('mongoose');

/**
 * Sub-task Schema Definition
 */
const subTaskSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
  },
  isCompleted: {
    type: Boolean,
    default: false,
  },
});

/**
 * Attachment Schema Definition
 */
const attachmentSchema = new mongoose.Schema({
  fileName: { type: String, required: true },
  fileUrl: { type: String, required: true },
  fileKey: { type: String, required: true },
  uploadedAt: { type: Date, default: Date.now },
});

/**
 * Recurring Rule Schema Definition
 */
const recurringSchema = new mongoose.Schema({
  frequency: {
    type: String,
    enum: ['daily', 'weekly', 'monthly'],
    required: true,
  },
  interval: {
    type: Number,
    default: 1,
    min: 1,
  },
  nextDueDate: {
    type: Date,
    required: true,
  },
  endDate: Date,
}, { _id: false }); // _id is not needed for this sub-document

/**
 * Task Schema Definition
 */
const taskSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'A task must have a title.'],
    trim: true,
  },
  description: {
    type: String,
    trim: true,
  },
  status: {
    type: String,
    required: true,
    enum: ['To Do', 'In Progress', 'Blocked', 'For Review', 'Done'],
    default: 'To Do',
  },
  priority: {
    type: String,
    required: true,
    enum: ['Low', 'Medium', 'High', 'Critical'],
    default: 'Medium',
  },
  dueDate: {
    type: Date,
  },
  isKeyTask: {
    type: Boolean,
    default: false,
  },
  tags: [String],
  subTasks: [subTaskSchema],
  attachments: [attachmentSchema],
  links: [String],
  workspace: {
    type: mongoose.Schema.ObjectId,
    ref: 'Workspace',
    required: [true, 'A task must belong to a workspace.'],
  },
  user: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: [true, 'A task must be assigned to a user.'],
  },
  googleEventId: {
    type: String,
    select: false,
  },
  // --- Recurring Task Fields ---
  isRecurringTemplate: {
    type: Boolean,
    default: false,
  },
  recurring: {
    type: recurringSchema,
    required: false, // This field will only exist on recurring templates
  },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// --- Indexes ---
taskSchema.index({ workspace: 1, status: 1 });
taskSchema.index({ workspace: 1, dueDate: 1 });
taskSchema.index({ title: 'text', description: 'text' });
// Index for the cron job to efficiently find templates
taskSchema.index({ isRecurringTemplate: 1, 'recurring.nextDueDate': 1 });


// --- Model Creation ---
const Task = mongoose.model('Task', taskSchema);

module.exports = Task;
