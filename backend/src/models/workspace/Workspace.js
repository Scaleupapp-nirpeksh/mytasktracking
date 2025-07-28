/**
 * Workspace Model
 * 
 * MongoDB schema for workspaces that provide data segregation:
 * - Personal, Business, and Company workspace types
 * - Role-based access control
 * - Workspace settings and preferences
 * - Member management and permissions
 * - Task categorization and organization
 * 
 * @author Nirpeksh Scale Up App
 * @version 1.0.0
 */

const mongoose = require('mongoose');
const slugify = require('slugify');
const { Schema } = mongoose;

/**
 * Workspace Schema Definition
 */
const workspaceSchema = new Schema({
  // Basic Information
  name: {
    type: String,
    required: [true, 'Workspace name is required'],
    trim: true,
    maxlength: [100, 'Workspace name cannot exceed 100 characters'],
    minlength: [2, 'Workspace name must be at least 2 characters']
  },
  
  slug: {
    type: String,
    unique: true,
    lowercase: true,
    index: true
  },
  
  description: {
    type: String,
    maxlength: [500, 'Description cannot exceed 500 characters'],
    trim: true
  },
  
  type: {
    type: String,
    enum: {
      values: ['personal', 'business', 'company'],
      message: 'Workspace type must be either personal, business, or company'
    },
    required: [true, 'Workspace type is required'],
    index: true
  },
  
  // Visual Identity
  color: {
    type: String,
    match: [/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, 'Please provide a valid hex color'],
    default: '#3B82F6' // Blue color
  },
  
  icon: {
    type: String,
    maxlength: [50, 'Icon name cannot exceed 50 characters'],
    default: 'folder'
  },
  
  avatar: {
    type: String, // URL to workspace image/logo
    default: null
  },
  
  // Ownership and Access
  owner: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Workspace must have an owner'],
    index: true
  },
  
  members: [{
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    role: {
      type: String,
      enum: ['owner', 'admin', 'member', 'viewer'],
      default: 'member'
    },
    permissions: {
      canCreateTasks: { type: Boolean, default: true },
      canEditTasks: { type: Boolean, default: true },
      canDeleteTasks: { type: Boolean, default: false },
      canManageMembers: { type: Boolean, default: false },
      canManageSettings: { type: Boolean, default: false },
      canViewReports: { type: Boolean, default: true },
      canExportData: { type: Boolean, default: false }
    },
    joinedAt: {
      type: Date,
      default: Date.now
    },
    invitedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    status: {
      type: String,
      enum: ['active', 'pending', 'suspended'],
      default: 'active'
    }
  }],
  
  // Settings and Preferences
  settings: {
    isPrivate: {
      type: Boolean,
      default: function() {
        return this.type === 'personal';
      }
    },
    
    allowInvites: {
      type: Boolean,
      default: function() {
        return this.type !== 'personal';
      }
    },
    
    requireApproval: {
      type: Boolean,
      default: false
    },
    
    defaultTaskPriority: {
      type: String,
      enum: ['low', 'medium', 'high', 'urgent'],
      default: 'medium'
    },
    
    taskNumbering: {
      enabled: { type: Boolean, default: true },
      prefix: { 
        type: String, 
        maxlength: [5, 'Task prefix cannot exceed 5 characters'],
        default: function() {
          return this.type === 'company' ? 'TASK' : 
                 this.type === 'business' ? 'BIZ' : 'PER';
        }
      },
      counter: { type: Number, default: 1 }
    },
    
    notifications: {
      taskCreated: { type: Boolean, default: true },
      taskAssigned: { type: Boolean, default: true },
      taskCompleted: { type: Boolean, default: true },
      taskOverdue: { type: Boolean, default: true },
      dailyDigest: { type: Boolean, default: false },
      weeklyReport: { type: Boolean, default: false }
    },
    
    workingHours: {
      enabled: { type: Boolean, default: false },
      timezone: { type: String, default: 'UTC' },
      schedule: {
        monday: { enabled: Boolean, start: String, end: String },
        tuesday: { enabled: Boolean, start: String, end: String },
        wednesday: { enabled: Boolean, start: String, end: String },
        thursday: { enabled: Boolean, start: String, end: String },
        friday: { enabled: Boolean, start: String, end: String },
        saturday: { enabled: Boolean, start: String, end: String },
        sunday: { enabled: Boolean, start: String, end: String }
      }
    }
  },
  
  // Task Organization
  categories: [{
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: [50, 'Category name cannot exceed 50 characters']
    },
    color: {
      type: String,
      match: [/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, 'Please provide a valid hex color'],
      default: '#6B7280' // Gray color
    },
    description: {
      type: String,
      maxlength: [200, 'Category description cannot exceed 200 characters']
    },
    isDefault: {
      type: Boolean,
      default: false
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  tags: [{
    name: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: [30, 'Tag name cannot exceed 30 characters']
    },
    color: {
      type: String,
      match: [/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, 'Please provide a valid hex color'],
      default: '#EF4444' // Red color
    },
    usageCount: {
      type: Number,
      default: 0,
      min: 0
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Statistics and Metrics
  stats: {
    totalTasks: { type: Number, default: 0, min: 0 },
    completedTasks: { type: Number, default: 0, min: 0 },
    overdueTasks: { type: Number, default: 0, min: 0 },
    totalMembers: { type: Number, default: 1, min: 1 },
    lastActivity: { type: Date, default: Date.now }
  },
  
  // Status and Lifecycle
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  
  isArchived: {
    type: Boolean,
    default: false,
    index: true
  },
  
  archivedAt: {
    type: Date,
    default: null
  },
  
  archivedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  
  // Audit Trail
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

/**
 * Virtual Properties
 */

// Completion rate
workspaceSchema.virtual('completionRate').get(function() {
  if (this.stats.totalTasks === 0) return 0;
  return Math.round((this.stats.completedTasks / this.stats.totalTasks) * 100);
});

// Active member count
workspaceSchema.virtual('activeMemberCount').get(function() {
  return this.members.filter(member => member.status === 'active').length;
});

// Is user workspace owner
workspaceSchema.virtual('isOwner').get(function() {
  return function(userId) {
    return this.owner.toString() === userId.toString();
  };
});

/**
 * Indexes for Performance
 */
workspaceSchema.index({ owner: 1, type: 1 });
workspaceSchema.index({ 'members.user': 1 });
workspaceSchema.index({ slug: 1 });
workspaceSchema.index({ isActive: 1, isArchived: 1 });
workspaceSchema.index({ type: 1, isActive: 1 });

/**
 * Pre-save Middleware
 */

// Generate slug before saving
workspaceSchema.pre('save', function(next) {
  if (this.isModified('name')) {
    this.slug = slugify(this.name, {
      lower: true,
      strict: true,
      remove: /[*+~.()'"!:@]/g
    });
  }
  
  this.updatedAt = new Date();
  next();
});

// Update member count
workspaceSchema.pre('save', function(next) {
  this.stats.totalMembers = this.members.filter(member => member.status === 'active').length;
  next();
});

/**
 * Instance Methods
 */

// Add member to workspace
workspaceSchema.methods.addMember = function(userId, role = 'member', invitedBy = null) {
  // Check if user is already a member
  const existingMember = this.members.find(member => 
    member.user.toString() === userId.toString()
  );
  
  if (existingMember) {
    throw new Error('User is already a member of this workspace');
  }
  
  // Set permissions based on role
  const permissions = this.getPermissionsByRole(role);
  
  this.members.push({
    user: userId,
    role,
    permissions,
    invitedBy,
    status: 'active'
  });
  
  return this.save();
};

// Remove member from workspace
workspaceSchema.methods.removeMember = function(userId) {
  this.members = this.members.filter(member => 
    member.user.toString() !== userId.toString()
  );
  
  return this.save();
};

// Update member role
workspaceSchema.methods.updateMemberRole = function(userId, newRole) {
  const member = this.members.find(member => 
    member.user.toString() === userId.toString()
  );
  
  if (!member) {
    throw new Error('User is not a member of this workspace');
  }
  
  member.role = newRole;
  member.permissions = this.getPermissionsByRole(newRole);
  
  return this.save();
};

// Get permissions by role
workspaceSchema.methods.getPermissionsByRole = function(role) {
  const permissionTemplates = {
    owner: {
      canCreateTasks: true,
      canEditTasks: true,
      canDeleteTasks: true,
      canManageMembers: true,
      canManageSettings: true,
      canViewReports: true,
      canExportData: true
    },
    admin: {
      canCreateTasks: true,
      canEditTasks: true,
      canDeleteTasks: true,
      canManageMembers: true,
      canManageSettings: false,
      canViewReports: true,
      canExportData: true
    },
    member: {
      canCreateTasks: true,
      canEditTasks: true,
      canDeleteTasks: false,
      canManageMembers: false,
      canManageSettings: false,
      canViewReports: true,
      canExportData: false
    },
    viewer: {
      canCreateTasks: false,
      canEditTasks: false,
      canDeleteTasks: false,
      canManageMembers: false,
      canManageSettings: false,
      canViewReports: true,
      canExportData: false
    }
  };
  
  return permissionTemplates[role] || permissionTemplates.viewer;
};

// Check if user has permission
workspaceSchema.methods.hasPermission = function(userId, permission) {
  const member = this.members.find(member => 
    member.user.toString() === userId.toString() && member.status === 'active'
  );
  
  if (!member) return false;
  
  return member.permissions[permission] === true;
};

// Add category
workspaceSchema.methods.addCategory = function(name, color = '#6B7280', description = '') {
  // Check if category already exists
  const existingCategory = this.categories.find(cat => 
    cat.name.toLowerCase() === name.toLowerCase()
  );
  
  if (existingCategory) {
    throw new Error('Category already exists');
  }
  
  this.categories.push({
    name: name.trim(),
    color,
    description: description.trim()
  });
  
  return this.save();
};

// Add tag
workspaceSchema.methods.addTag = function(name, color = '#EF4444') {
  const tagName = name.toLowerCase().trim();
  
  // Check if tag already exists
  const existingTag = this.tags.find(tag => tag.name === tagName);
  
  if (existingTag) {
    existingTag.usageCount += 1;
  } else {
    this.tags.push({
      name: tagName,
      color,
      usageCount: 1
    });
  }
  
  return this.save();
};

// Update task stats
workspaceSchema.methods.updateStats = function(statsUpdate) {
  Object.assign(this.stats, statsUpdate);
  this.stats.lastActivity = new Date();
  return this.save({ validateBeforeSave: false });
};

// Archive workspace
workspaceSchema.methods.archive = function(archivedBy) {
  this.isArchived = true;
  this.archivedAt = new Date();
  this.archivedBy = archivedBy;
  return this.save();
};

// Restore workspace
workspaceSchema.methods.restore = function() {
  this.isArchived = false;
  this.archivedAt = null;
  this.archivedBy = null;
  return this.save();
};

/**
 * Static Methods
 */

// Find workspaces by user
workspaceSchema.statics.findByUser = function(userId) {
  return this.find({
    $or: [
      { owner: userId },
      { 'members.user': userId, 'members.status': 'active' }
    ],
    isActive: true,
    isArchived: false
  }).populate('owner', 'firstName lastName email');
};

// Find workspace by type for user
workspaceSchema.statics.findByUserAndType = function(userId, type) {
  return this.findOne({
    $or: [
      { owner: userId },
      { 'members.user': userId, 'members.status': 'active' }
    ],
    type,
    isActive: true,
    isArchived: false
  }).populate('owner', 'firstName lastName email');
};

// Create the model
const Workspace = mongoose.model('Workspace', workspaceSchema);

module.exports = Workspace;