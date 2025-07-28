// src/api/models/meetingModel.js

const mongoose = require('mongoose');

/**
 * Task Snapshot Schema Definition
 *
 * This is a child schema to be embedded within the main Meeting schema.
 * It stores a denormalized copy of a task's key details at a specific
 * point in time. This is crucial for historical accuracy, as the original
 * task may be updated or deleted later.
 */
const taskSnapshotSchema = new mongoose.Schema({
  originalTaskId: {
    type: mongoose.Schema.ObjectId,
    ref: 'Task',
  },
  title: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    required: true,
  },
  description: String,
});

/**
 * Meeting Schema Definition
 *
 * This schema defines the structure for Meeting documents. Each meeting
 * is a record of a review session, containing notes and a snapshot of
 * key tasks for historical reference.
 */
const meetingSchema = new mongoose.mongoose.Schema({
  meetingDate: {
    type: Date,
    default: Date.now,
  },
  notes: {
    type: String,
    trim: true,
  },
  // An array of task snapshots taken at the start of the meeting.
  taskSnapshots: [taskSnapshotSchema],
  // Reference to the Workspace this meeting belongs to.
  workspace: {
    type: mongoose.Schema.ObjectId,
    ref: 'Workspace',
    required: [true, 'A meeting must belong to a workspace.'],
  },
  // Reference to the User who initiated the meeting.
  user: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: [true, 'A meeting must belong to a user.'],
  },
}, {
  timestamps: true, // Automatically adds createdAt and updatedAt fields.
});

// --- Indexes ---
meetingSchema.index({ workspace: 1, user: 1 });


// --- Model Creation ---
const Meeting = mongoose.model('Meeting', meetingSchema);

module.exports = Meeting;
