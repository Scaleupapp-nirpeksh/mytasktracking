// src/api/models/taskModel.js

const mongoose = require('mongoose');

/**
 * Sub-task Schema Definition
 *
 * This is a child schema to be embedded within the main Task schema.
 * It represents a small, checkable item within a larger task.
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
 *
 * This is a child schema for storing metadata about file attachments
 * that are uploaded to S3.
 */
const attachmentSchema = new mongoose.Schema({
  fileName: { type: String, required: true },
  fileUrl: { type: String, required: true }, // URL from S3
  fileKey: { type: String, required: true }, // Key for deletion from S3
  uploadedAt: { type: Date, default: Date.now },
});

/**
 * Task Schema Definition
 *
 * This schema defines the structure for Task documents, which are the core
 * items in the application. Each task belongs to a single workspace and user.
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
  // A flag to mark a task as significant for high-level reviews.
  isKeyTask: {
    type: Boolean,
    default: false,
  },
  // Array of strings for flexible categorization.
  tags: [String],
  // Embedded array of sub-task documents.
  subTasks: [subTaskSchema],
  // Embedded array of attachment documents.
  attachments: [attachmentSchema],
  // Array of simple string URLs.
  links: [String],
  // Reference to the Workspace this task belongs to.
  workspace: {
    type: mongoose.Schema.ObjectId,
    ref: 'Workspace',
    required: [true, 'A task must belong to a workspace.'],
  },
  // Reference to the User who created the task.
  user: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: [true, 'A task must be assigned to a user.'],
  },
}, {
  timestamps: true, // Automatically adds createdAt and updatedAt fields.
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// --- Indexes ---
// Create indexes to improve query performance for common lookups.
taskSchema.index({ workspace: 1, status: 1 });
taskSchema.index({ workspace: 1, dueDate: 1 });

// Create a text index on the 'title' and 'description' fields for searching.
taskSchema.index({ title: 'text', description: 'text' });


// --- Model Creation ---
const Task = mongoose.model('Task', taskSchema);

module.exports = Task;
