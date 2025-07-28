/**
 * File Attachment Model
 * 
 * MongoDB schema for file attachments with comprehensive features:
 * - Cloud storage integration (Cloudinary)
 * - File metadata and security
 * - Access control and permissions
 * - File versioning and history
 * - Virus scanning and validation
 * - Usage analytics and tracking
 * 
 * @author Nirpeksh Scale Up App
 * @version 1.0.0
 */

const mongoose = require('mongoose');
const crypto = require('crypto');
const { Schema } = mongoose;

/**
 * File Version Schema for version tracking
 */
const fileVersionSchema = new Schema({
  version: {
    type: Number,
    required: true,
    min: 1
  },
  
  filename: {
    type: String,
    required: true
  },
  
  size: {
    type: Number,
    required: true,
    min: 0
  },
  
  url: {
    type: String,
    required: true
  },
  
  publicId: {
    type: String,
    required: true
  },
  
  checksum: {
    type: String,
    required: true
  },
  
  uploadedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  uploadedAt: {
    type: Date,
    default: Date.now
  },
  
  changeNotes: {
    type: String,
    trim: true,
    maxlength: [500, 'Change notes cannot exceed 500 characters']
  }
}, { _id: true });

/**
 * Access Log Schema for tracking file access
 */
const accessLogSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  action: {
    type: String,
    enum: ['view', 'download', 'share', 'delete'],
    required: true
  },
  
  ipAddress: {
    type: String,
    required: true
  },
  
  userAgent: {
    type: String,
    required: true
  },
  
  timestamp: {
    type: Date,
    default: Date.now
  }
}, { _id: true });

/**
 * Main File Attachment Schema
 */
const fileAttachmentSchema = new Schema({
  // Basic File Information
  filename: {
    type: String,
    required: [true, 'Filename is required'],
    trim: true,
    maxlength: [255, 'Filename cannot exceed 255 characters']
  },
  
  originalName: {
    type: String,
    required: [true, 'Original filename is required'],
    trim: true,
    maxlength: [255, 'Original filename cannot exceed 255 characters']
  },
  
  displayName: {
    type: String,
    trim: true,
    maxlength: [255, 'Display name cannot exceed 255 characters']
  },
  
  description: {
    type: String,
    trim: true,
    maxlength: [1000, 'Description cannot exceed 1000 characters']
  },
  
  // File Properties
  mimeType: {
    type: String,
    required: [true, 'MIME type is required'],
    lowercase: true,
    index: true
  },
  
  fileExtension: {
    type: String,
    lowercase: true,
    index: true
  },
  
  size: {
    type: Number,
    required: [true, 'File size is required'],
    min: [0, 'File size cannot be negative'],
    max: [104857600, 'File size cannot exceed 100MB'] // 100MB limit
  },
  
  checksum: {
    type: String,
    required: [true, 'File checksum is required'],
    unique: true,
    index: true
  },
  
  // Cloud Storage Information
  url: {
    type: String,
    required: [true, 'File URL is required']
  },
  
  secureUrl: {
    type: String,
    required: [true, 'Secure URL is required']
  },
  
  publicId: {
    type: String,
    required: [true, 'Public ID is required'],
    unique: true,
    index: true
  },
  
  resourceType: {
    type: String,
    enum: ['image', 'video', 'raw', 'auto'],
    default: 'auto'
  },
  
  cloudProvider: {
    type: String,
    enum: ['cloudinary', 's3', 'local'],
    default: 'cloudinary'
  },
  
  // Image-specific Properties (if applicable)
  imageMetadata: {
    width: { type: Number, min: 0 },
    height: { type: Number, min: 0 },
    format: { type: String, lowercase: true },
    hasAlpha: { type: Boolean, default: false },
    colorSpace: { type: String },
    orientation: { type: Number, min: 1, max: 8 }
  },
  
  // Relationships and Context
  workspace: {
    type: Schema.Types.ObjectId,
    ref: 'Workspace',
    required: [true, 'File must belong to a workspace'],
    index: true
  },
  
  task: {
    type: Schema.Types.ObjectId,
    ref: 'Task',
    default: null,
    index: true
  },
  
  uploadedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'File must have an uploader'],
    index: true
  },
  
  // Access Control
  visibility: {
    type: String,
    enum: ['private', 'workspace', 'public'],
    default: 'workspace',
    index: true
  },
  
  permissions: {
    canView: [{
      type: Schema.Types.ObjectId,
      ref: 'User'
    }],
    
    canDownload: [{
      type: Schema.Types.ObjectId,
      ref: 'User'
    }],
    
    canEdit: [{
      type: Schema.Types.ObjectId,
      ref: 'User'
    }],
    
    canDelete: [{
      type: Schema.Types.ObjectId,
      ref: 'User'
    }]
  },
  
  // Security and Validation
  isSecure: {
    type: Boolean,
    default: true
  },
  
  encryptionKey: {
    type: String,
    default: null,
    select: false // Never include in queries
  },
  
  virusScanStatus: {
    type: String,
    enum: ['pending', 'clean', 'infected', 'error'],
    default: 'pending',
    index: true
  },
  
  virusScanDate: {
    type: Date,
    default: null
  },
  
  contentValidated: {
    type: Boolean,
    default: false
  },
  
  validationErrors: [{
    type: { type: String, required: true },
    message: { type: String, required: true },
    timestamp: { type: Date, default: Date.now }
  }],
  
  // Versioning
  version: {
    type: Number,
    default: 1,
    min: 1
  },
  
  isLatestVersion: {
    type: Boolean,
    default: true,
    index: true
  },
  
  parentFile: {
    type: Schema.Types.ObjectId,
    ref: 'FileAttachment',
    default: null
  },
  
  versions: [fileVersionSchema],
  
  // Usage and Analytics
  downloadCount: {
    type: Number,
    default: 0,
    min: 0
  },
  
  viewCount: {
    type: Number,
    default: 0,
    min: 0
  },
  
  shareCount: {
    type: Number,
    default: 0,
    min: 0
  },
  
  lastAccessedAt: {
    type: Date,
    default: null
  },
  
  lastAccessedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  
  // Access Logs (limited to recent entries)
  accessLogs: [accessLogSchema],
  
  // Tags and Organization
  tags: [{
    type: String,
    trim: true,
    lowercase: true,
    maxlength: [30, 'Tag cannot exceed 30 characters']
  }],
  
  category: {
    type: String,
    trim: true,
    maxlength: [50, 'Category cannot exceed 50 characters'],
    index: true
  },
  
  // Expiration and Lifecycle
  expiresAt: {
    type: Date,
    default: null,
    index: true
  },
  
  autoDelete: {
    type: Boolean,
    default: false
  },
  
  retentionPeriod: {
    type: Number, // Days
    min: 1,
    default: null
  },
  
  // Status and Metadata
  status: {
    type: String,
    enum: ['uploading', 'processing', 'active', 'archived', 'deleted'],
    default: 'uploading',
    index: true
  },
  
  isDeleted: {
    type: Boolean,
    default: false,
    index: true
  },
  
  deletedAt: {
    type: Date,
    default: null
  },
  
  deletedBy: {
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
  toJSON: { 
    virtuals: true,
    transform: function(doc, ret) {
      delete ret.encryptionKey;
      return ret;
    }
  },
  toObject: { virtuals: true }
});

/**
 * Virtual Properties
 */

// Human readable file size
fileAttachmentSchema.virtual('humanReadableSize').get(function() {
  const bytes = this.size;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  if (bytes === 0) return '0 Bytes';
  const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
  return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
});

// File type category
fileAttachmentSchema.virtual('fileTypeCategory').get(function() {
  const mimeType = this.mimeType.toLowerCase();
  
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.includes('pdf')) return 'pdf';
  if (mimeType.includes('word') || mimeType.includes('doc')) return 'document';
  if (mimeType.includes('sheet') || mimeType.includes('excel')) return 'spreadsheet';
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return 'presentation';
  if (mimeType.includes('zip') || mimeType.includes('archive')) return 'archive';
  if (mimeType.includes('text')) return 'text';
  
  return 'other';
});

// Is file expired
fileAttachmentSchema.virtual('isExpired').get(function() {
  return this.expiresAt && new Date() > this.expiresAt;
});

// Days until expiration
fileAttachmentSchema.virtual('daysUntilExpiration').get(function() {
  if (!this.expiresAt) return null;
  const diff = this.expiresAt.getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
});

/**
 * Indexes for Performance
 */
fileAttachmentSchema.index({ workspace: 1, status: 1 });
fileAttachmentSchema.index({ task: 1, status: 1 });
fileAttachmentSchema.index({ uploadedBy: 1, createdAt: -1 });
fileAttachmentSchema.index({ mimeType: 1, status: 1 });
fileAttachmentSchema.index({ checksum: 1 });
fileAttachmentSchema.index({ publicId: 1 });
fileAttachmentSchema.index({ expiresAt: 1 });
fileAttachmentSchema.index({ virusScanStatus: 1 });

// Compound indexes
fileAttachmentSchema.index({ workspace: 1, fileTypeCategory: 1, status: 1 });
fileAttachmentSchema.index({ workspace: 1, uploadedBy: 1, createdAt: -1 });

/**
 * Pre-save Middleware
 */

// Generate checksum and extract file extension
fileAttachmentSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  
  // Extract file extension from filename
  if (this.isModified('filename')) {
    const lastDotIndex = this.filename.lastIndexOf('.');
    if (lastDotIndex > 0) {
      this.fileExtension = this.filename.substring(lastDotIndex + 1).toLowerCase();
    }
  }
  
  // Set display name if not provided
  if (!this.displayName) {
    this.displayName = this.originalName;
  }
  
  // Limit access logs to last 100 entries
  if (this.accessLogs.length > 100) {
    this.accessLogs = this.accessLogs.slice(-100);
  }
  
  next();
});

/**
 * Instance Methods
 */

// Generate file checksum
fileAttachmentSchema.methods.generateChecksum = function(fileBuffer) {
  return crypto.createHash('sha256').update(fileBuffer).digest('hex');
};

// Check if user has permission
fileAttachmentSchema.methods.hasPermission = function(userId, permission) {
  // Owner always has all permissions
  if (this.uploadedBy.toString() === userId.toString()) {
    return true;
  }
  
  // Check specific permissions
  const permissionArray = this.permissions[permission];
  if (permissionArray && permissionArray.includes(userId)) {
    return true;
  }
  
  // Check workspace-level permissions based on visibility
  if (this.visibility === 'public') {
    return ['canView', 'canDownload'].includes(permission);
  }
  
  return false;
};

// Add permission for user
fileAttachmentSchema.methods.addPermission = function(userId, permission) {
  if (!this.permissions[permission].includes(userId)) {
    this.permissions[permission].push(userId);
  }
  return this.save();
};

// Remove permission for user
fileAttachmentSchema.methods.removePermission = function(userId, permission) {
  this.permissions[permission] = this.permissions[permission].filter(
    id => id.toString() !== userId.toString()
  );
  return this.save();
};

// Log access
fileAttachmentSchema.methods.logAccess = function(userId, action, ipAddress, userAgent) {
  this.accessLogs.push({
    user: userId,
    action,
    ipAddress,
    userAgent
  });
  
  this.lastAccessedAt = new Date();
  this.lastAccessedBy = userId;
  
  // Update counters
  switch (action) {
    case 'view':
      this.viewCount += 1;
      break;
    case 'download':
      this.downloadCount += 1;
      break;
    case 'share':
      this.shareCount += 1;
      break;
  }
  
  return this.save({ validateBeforeSave: false });
};

// Create new version
fileAttachmentSchema.methods.createVersion = function(versionData, changeNotes = '') {
  // Mark current versions as not latest
  this.versions.forEach(version => {
    version.isLatestVersion = false;
  });
  
  // Add new version
  const newVersion = {
    version: this.version + 1,
    filename: versionData.filename,
    size: versionData.size,
    url: versionData.url,
    publicId: versionData.publicId,
    checksum: versionData.checksum,
    uploadedBy: versionData.uploadedBy,
    changeNotes
  };
  
  this.versions.push(newVersion);
  
  // Update current file properties
  this.version += 1;
  this.filename = versionData.filename;
  this.size = versionData.size;
  this.url = versionData.url;
  this.publicId = versionData.publicId;
  this.checksum = versionData.checksum;
  
  return this.save();
};

// Soft delete
fileAttachmentSchema.methods.softDelete = function(deletedBy) {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.deletedBy = deletedBy;
  this.status = 'deleted';
  
  return this.save();
};

// Restore from soft delete
fileAttachmentSchema.methods.restore = function() {
  this.isDeleted = false;
  this.deletedAt = null;
  this.deletedBy = null;
  this.status = 'active';
  
  return this.save();
};

// Set expiration
fileAttachmentSchema.methods.setExpiration = function(days) {
  const expirationDate = new Date();
  expirationDate.setDate(expirationDate.getDate() + days);
  
  this.expiresAt = expirationDate;
  this.retentionPeriod = days;
  
  return this.save();
};

// Update virus scan status
fileAttachmentSchema.methods.updateVirusScanStatus = function(status, errors = []) {
  this.virusScanStatus = status;
  this.virusScanDate = new Date();
  
  if (errors.length > 0) {
    this.validationErrors = this.validationErrors.concat(errors);
  }
  
  if (status === 'clean') {
    this.contentValidated = true;
    this.status = 'active';
  } else if (status === 'infected') {
    this.status = 'archived';
  }
  
  return this.save();
};

/**
 * Static Methods
 */

// Find files by workspace
fileAttachmentSchema.statics.findByWorkspace = function(workspaceId, filters = {}) {
  return this.find({
    workspace: workspaceId,
    isDeleted: false,
    status: { $ne: 'deleted' },
    ...filters
  }).populate('uploadedBy', 'firstName lastName email')
    .sort({ createdAt: -1 });
};

// Find files by task
fileAttachmentSchema.statics.findByTask = function(taskId) {
  return this.find({
    task: taskId,
    isDeleted: false,
    status: 'active'
  }).populate('uploadedBy', 'firstName lastName email')
    .sort({ createdAt: -1 });
};

// Find expired files
fileAttachmentSchema.statics.findExpired = function() {
  return this.find({
    expiresAt: { $lt: new Date() },
    autoDelete: true,
    isDeleted: false
  });
};

// Find files needing virus scan
fileAttachmentSchema.statics.findPendingScan = function() {
  return this.find({
    virusScanStatus: 'pending',
    isDeleted: false
  }).sort({ createdAt: 1 });
};

// Find duplicate files by checksum
fileAttachmentSchema.statics.findDuplicates = function(checksum, excludeId = null) {
  const query = { checksum, isDeleted: false };
  if (excludeId) {
    query._id = { $ne: excludeId };
  }
  return this.find(query);
};

// Get storage statistics
fileAttachmentSchema.statics.getStorageStats = function(workspaceId = null) {
  const pipeline = [
    { $match: { isDeleted: false, status: 'active' } }
  ];
  
  if (workspaceId) {
    pipeline[0].$match.workspace = workspaceId;
  }
  
  pipeline.push(
    {
      $group: {
        _id: null,
        totalFiles: { $sum: 1 },
        totalSize: { $sum: '$size' },
        averageSize: { $avg: '$size' },
        fileTypes: { $addToSet: '$fileExtension' }
      }
    }
  );
  
  return this.aggregate(pipeline);
};

// Create the model
const FileAttachment = mongoose.model('FileAttachment', fileAttachmentSchema);

module.exports = FileAttachment;