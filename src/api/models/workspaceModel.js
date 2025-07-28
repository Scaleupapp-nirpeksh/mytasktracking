// src/api/models/workspaceModel.js

const mongoose = require('mongoose');

/**
 * Workspace Schema Definition
 *
 * This schema defines the structure for Workspace documents. Workspaces are the
 * top-level containers that segregate tasks into distinct contexts (e.g.,
 * Personal, Business, Company). Each workspace is owned by a single user.
 */
const workspaceSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'A workspace must have a name.'],
    trim: true,
  },
  // The type of the workspace, restricted to the three allowed values.
  type: {
    type: String,
    required: true,
    enum: {
      values: ['Personal', 'Business', 'Company'],
      message: 'Workspace type must be either Personal, Business, or Company.',
    },
  },
  // A reference to the User who owns this workspace. This creates a parent-child
  // relationship between User and Workspace documents.
  owner: {
    type: mongoose.Schema.ObjectId,
    ref: 'User', // This refers to the 'User' model we created.
    required: [true, 'A workspace must belong to a user.'],
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
}, {
  // Mongoose options to ensure virtual properties are included in JSON/object outputs.
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// --- Mongoose Middleware (Hooks) ---

/**
 * Pre-find hook to automatically populate the 'owner' field.
 *
 * This middleware runs for any 'find' query and automatically replaces the
 * owner's ObjectId with the actual user document (or selected fields).
 * We are choosing not to populate it here to have more control in the controllers,
 * but this is a common and useful pattern.
 *
 * Example:
 * workspaceSchema.pre(/^find/, function(next) {
 * this.populate({
 * path: 'owner',
 * select: 'name email' // Only include name and email of the owner
 * });
 * next();
 * });
 */


// --- Model Creation ---
const Workspace = mongoose.model('Workspace', workspaceSchema);

module.exports = Workspace;
