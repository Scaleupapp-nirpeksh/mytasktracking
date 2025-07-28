/**
 * File Controller
 * 
 * HTTP request handlers for file management operations:
 * - File upload to AWS S3 with validation
 * - File download with presigned URLs
 * - File viewing and metadata management
 * - Access control and permissions
 * - File versioning and lifecycle management
 * 
 * @author Nirpeksh Scale Up App
 * @version 1.0.0
 */

const AWS = require('aws-sdk');
const multer = require('multer');
const crypto = require('crypto');
const path = require('path');
const sharp = require('sharp');
const FileAttachment = require('../../models/file/FileAttachment');
const Task = require('../../models/task/Task');
const { catchAsync } = require('../../middleware/error');
const { NotFoundError, ValidationError, AuthorizationError, FileUploadError } = require('../../middleware/error');
const { logBusiness, logger } = require('../../utils/logger/logger');

/**
 * Configure AWS S3
 */
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
  signatureVersion: 'v4'
});

const BUCKET_NAME = process.env.S3_BUCKET_NAME;

/**
 * File upload configuration
 */
const ALLOWED_MIME_TYPES = [
  // Images
  'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
  // Documents
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  // Text files
  'text/plain', 'text/csv',
  // Archives
  'application/zip', 'application/x-rar-compressed', 'application/x-7z-compressed'
];

const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024; // 10MB

/**
 * Configure multer for file upload
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 5 // Maximum 5 files per request
  },
  fileFilter: (req, file, cb) => {
    // Check MIME type
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      return cb(new FileUploadError(`File type ${file.mimetype} not allowed`), false);
    }
    
    // Check file extension
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.pdf', 
                              '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', 
                              '.csv', '.zip', '.rar', '.7z'];
    
    if (!allowedExtensions.includes(ext)) {
      return cb(new FileUploadError(`File extension ${ext} not allowed`), false);
    }
    
    cb(null, true);
  }
});

/**
 * Generate unique S3 key for file
 */
const generateS3Key = (workspaceId, filename, userId) => {
  const timestamp = Date.now();
  const randomString = crypto.randomBytes(8).toString('hex');
  const ext = path.extname(filename);
  const baseName = path.basename(filename, ext);
  const sanitizedBaseName = baseName.replace(/[^a-zA-Z0-9-_]/g, '_');
  
  return `workspaces/${workspaceId}/files/${userId}/${timestamp}_${randomString}_${sanitizedBaseName}${ext}`;
};

/**
 * Generate file checksum
 */
const generateChecksum = (buffer) => {
  return crypto.createHash('sha256').update(buffer).digest('hex');
};

/**
 * Process image file (resize and optimize)
 */
const processImage = async (buffer, mimetype) => {
  try {
    if (!mimetype.startsWith('image/') || mimetype === 'image/svg+xml') {
      return { buffer, metadata: null };
    }

    const image = sharp(buffer);
    const metadata = await image.metadata();
    
    // Resize if image is too large (max 2048px on longest side)
    const maxDimension = 2048;
    let processedImage = image;
    
    if (metadata.width > maxDimension || metadata.height > maxDimension) {
      processedImage = image.resize(maxDimension, maxDimension, {
        fit: 'inside',
        withoutEnlargement: true
      });
    }
    
    // Optimize image
    processedImage = processedImage.jpeg({ quality: 85, mozjpeg: true });
    
    const processedBuffer = await processedImage.toBuffer();
    
    return {
      buffer: processedBuffer,
      metadata: {
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
        hasAlpha: metadata.hasAlpha,
        colorSpace: metadata.space,
        orientation: metadata.orientation
      }
    };
  } catch (error) {
    logger.warn('Image processing failed, using original:', error.message);
    return { buffer, metadata: null };
  }
};

/**
 * Upload file to S3
 */
const uploadToS3 = async (buffer, s3Key, mimetype, isPublic = false) => {
  const uploadParams = {
    Bucket: BUCKET_NAME,
    Key: s3Key,
    Body: buffer,
    ContentType: mimetype,
    ServerSideEncryption: 'AES256',
    Metadata: {
      uploadedAt: new Date().toISOString()
    }
  };

  if (isPublic) {
    uploadParams.ACL = 'public-read';
  }

  try {
    const result = await s3.upload(uploadParams).promise();
    return {
      s3Key: result.Key,
      eTag: result.ETag.replace(/"/g, ''), // Remove quotes from ETag
      location: result.Location,
      versionId: result.VersionId
    };
  } catch (error) {
    logger.error('S3 upload failed:', error);
    throw new FileUploadError(`Failed to upload file to storage: ${error.message}`);
  }
};

/**
 * Generate presigned URL for file access
 */
const generatePresignedUrl = (s3Key, expiresInMinutes = 60) => {
  try {
    const params = {
      Bucket: BUCKET_NAME,
      Key: s3Key,
      Expires: expiresInMinutes * 60 // Convert to seconds
    };

    return s3.getSignedUrl('getObject', params);
  } catch (error) {
    logger.error('Failed to generate presigned URL:', error);
    throw new Error('Failed to generate file access URL');
  }
};

/**
 * @desc    Upload file(s)
 * @route   POST /api/files/upload
 * @access  Private
 */
const uploadFiles = catchAsync(async (req, res) => {
  const userId = req.user.id;
  const workspaceId = req.workspace.id;
  const { taskId, description, tags, category, isPublic = false } = req.body;

  if (!req.files || req.files.length === 0) {
    throw new ValidationError('No files provided');
  }

  // Check workspace permissions
  if (!req.workspace.hasPermission(userId, 'canCreateTasks')) {
    throw new AuthorizationError('You do not have permission to upload files');
  }

  // Validate task if provided
  let task = null;
  if (taskId) {
    task = await Task.findById(taskId);
    if (!task || task.workspace.toString() !== workspaceId) {
      throw new NotFoundError('Task not found or does not belong to this workspace');
    }
  }

  const uploadedFiles = [];
  const uploadErrors = [];

  // Process each file
  for (const file of req.files) {
    try {
      // Generate checksum
      const checksum = generateChecksum(file.buffer);
      
      // Check for duplicates
      const existingFile = await FileAttachment.findOne({
        checksum,
        workspace: workspaceId,
        isDeleted: false
      });

      if (existingFile) {
        uploadErrors.push({
          filename: file.originalname,
          error: 'File already exists'
        });
        continue;
      }

      // Process image if applicable
      const { buffer: processedBuffer, metadata: imageMetadata } = await processImage(
        file.buffer, 
        file.mimetype
      );

      // Generate S3 key
      const s3Key = generateS3Key(workspaceId, file.originalname, userId);

      // Upload to S3
      const s3Result = await uploadToS3(
        processedBuffer, 
        s3Key, 
        file.mimetype, 
        isPublic === 'true' || isPublic === true
      );

      // Create file record
      const fileData = {
        filename: file.originalname,
        originalName: file.originalname,
        description: description || '',
        mimeType: file.mimetype,
        size: processedBuffer.length,
        checksum,
        s3Key: s3Result.s3Key,
        s3Bucket: BUCKET_NAME,
        s3Region: process.env.AWS_REGION,
        s3ETag: s3Result.eTag,
        s3VersionId: s3Result.versionId,
        isPublic: isPublic === 'true' || isPublic === true,
        workspace: workspaceId,
        task: task ? task._id : null,
        uploadedBy: userId,
        visibility: 'workspace',
        imageMetadata,
        tags: tags ? tags.split(',').map(tag => tag.trim().toLowerCase()) : [],
        category: category || null,
        status: 'active',
        virusScanStatus: 'skip' // Skip virus scan for now
      };

      const fileAttachment = new FileAttachment(fileData);
      await fileAttachment.save();

      // Add to task if specified
      if (task) {
        task.attachments.push({
          filename: file.originalname,
          originalName: file.originalname,
          mimeType: file.mimetype,
          size: processedBuffer.length,
          s3Key: s3Result.s3Key,
          s3Bucket: BUCKET_NAME,
          url: fileAttachment.isPublic ? fileAttachment.s3Url : null,
          isPublic: fileAttachment.isPublic,
          uploadedAt: new Date()
        });
        await task.save();
      }

      // Generate presigned URL for immediate access
      if (!fileAttachment.isPublic) {
        const presignedUrl = generatePresignedUrl(s3Result.s3Key, 60);
        await fileAttachment.setPresignedUrl(presignedUrl, 60);
      }

      await fileAttachment.populate('uploadedBy', 'firstName lastName email');

      uploadedFiles.push(fileAttachment);

      logBusiness('file_uploaded', userId, workspaceId, {
        fileId: fileAttachment.id,
        filename: file.originalname,
        size: processedBuffer.length,
        taskId: task ? task.id : null
      });

    } catch (error) {
      logger.error('File upload error:', error);
      uploadErrors.push({
        filename: file.originalname,
        error: error.message
      });
    }
  }

  res.status(201).json({
    status: 'success',
    message: `${uploadedFiles.length} file(s) uploaded successfully`,
    data: {
      uploadedFiles,
      errors: uploadErrors.length > 0 ? uploadErrors : undefined
    }
  });
});

/**
 * @desc    Get files by workspace
 * @route   GET /api/files
 * @access  Private
 */
const getFiles = catchAsync(async (req, res) => {
  const workspaceId = req.workspace.id;
  const userId = req.user.id;
  const { 
    taskId, 
    category, 
    fileType, 
    page = 1, 
    limit = 25,
    search 
  } = req.query;

  // Build filters
  const filters = {
    workspace: workspaceId,
    isDeleted: false,
    status: 'active'
  };

  if (taskId) filters.task = taskId;
  if (category) filters.category = category;
  if (fileType) filters.fileTypeCategory = fileType;
  if (search) {
    filters.$or = [
      { filename: new RegExp(search, 'i') },
      { originalName: new RegExp(search, 'i') },
      { description: new RegExp(search, 'i') }
    ];
  }

  // Pagination
  const skip = (parseInt(page) - 1) * parseInt(limit);

  // Get files
  const files = await FileAttachment.find(filters)
    .populate('uploadedBy', 'firstName lastName email avatar')
    .populate('task', 'title status')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  // Get total count
  const totalFiles = await FileAttachment.countDocuments(filters);

  // Generate presigned URLs for private files
  for (const file of files) {
    if (!file.isPublic && !file.hasValidPresignedUrl) {
      const presignedUrl = generatePresignedUrl(file.s3Key, 30);
      await file.setPresignedUrl(presignedUrl, 30);
    }
  }

  logBusiness('files_retrieved', userId, workspaceId, {
    count: files.length,
    filters: Object.keys(filters)
  });

  res.status(200).json({
    status: 'success',
    results: files.length,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(totalFiles / parseInt(limit)),
      totalFiles,
      hasNextPage: skip + files.length < totalFiles,
      hasPrevPage: parseInt(page) > 1
    },
    data: {
      files
    }
  });
});

/**
 * @desc    Get single file
 * @route   GET /api/files/:id
 * @access  Private
 */
const getFile = catchAsync(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  const file = await FileAttachment.findById(id)
    .populate('uploadedBy', 'firstName lastName email avatar')
    .populate('task', 'title status workspace')
    .populate('workspace', 'name type');

  if (!file || file.isDeleted) {
    throw new NotFoundError('File not found');
  }

  // Check access permissions
  if (!file.hasPermission(userId, 'canView')) {
    throw new AuthorizationError('You do not have permission to access this file');
  }

  // Generate presigned URL if needed
  if (!file.isPublic && !file.hasValidPresignedUrl) {
    const presignedUrl = generatePresignedUrl(file.s3Key, 60);
    await file.setPresignedUrl(presignedUrl, 60);
  }

  // Log access
  await file.logAccess(userId, 'view', req.ip, req.get('User-Agent'));

  logBusiness('file_accessed', userId, file.workspace.id, {
    fileId: file.id,
    filename: file.filename
  });

  res.status(200).json({
    status: 'success',
    data: {
      file
    }
  });
});

/**
 * @desc    Download file
 * @route   GET /api/files/:id/download
 * @access  Private
 */
const downloadFile = catchAsync(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  const file = await FileAttachment.findById(id);

  if (!file || file.isDeleted) {
    throw new NotFoundError('File not found');
  }

  // Check download permissions
  if (!file.hasPermission(userId, 'canDownload')) {
    throw new AuthorizationError('You do not have permission to download this file');
  }

  // Generate download URL
  let downloadUrl;
  if (file.isPublic) {
    downloadUrl = file.s3Url;
  } else {
    downloadUrl = generatePresignedUrl(file.s3Key, 10); // 10 minute expiry for downloads
  }

  // Log download
  await file.logAccess(userId, 'download', req.ip, req.get('User-Agent'));

  logBusiness('file_downloaded', userId, file.workspace, {
    fileId: file.id,
    filename: file.filename
  });

  res.status(200).json({
    status: 'success',
    data: {
      downloadUrl,
      filename: file.filename,
      size: file.size,
      expiresIn: file.isPublic ? null : '10 minutes'
    }
  });
});

/**
 * @desc    Update file metadata
 * @route   PATCH /api/files/:id
 * @access  Private
 */
const updateFile = catchAsync(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const { description, tags, category, visibility } = req.body;

  const file = await FileAttachment.findById(id);

  if (!file || file.isDeleted) {
    throw new NotFoundError('File not found');
  }

  // Check edit permissions
  if (!file.hasPermission(userId, 'canEdit')) {
    throw new AuthorizationError('You do not have permission to edit this file');
  }

  // Update allowed fields
  if (description !== undefined) file.description = description;
  if (tags !== undefined) file.tags = Array.isArray(tags) ? tags : tags.split(',').map(tag => tag.trim().toLowerCase());
  if (category !== undefined) file.category = category;
  if (visibility !== undefined && ['private', 'workspace', 'public'].includes(visibility)) {
    file.visibility = visibility;
  }

  await file.save();

  logBusiness('file_updated', userId, file.workspace, {
    fileId: file.id,
    updatedFields: Object.keys(req.body)
  });

  res.status(200).json({
    status: 'success',
    message: 'File updated successfully',
    data: {
      file
    }
  });
});

/**
 * @desc    Delete file
 * @route   DELETE /api/files/:id
 * @access  Private
 */
const deleteFile = catchAsync(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  const file = await FileAttachment.findById(id);

  if (!file || file.isDeleted) {
    throw new NotFoundError('File not found');
  }

  // Check delete permissions
  if (!file.hasPermission(userId, 'canDelete')) {
    throw new AuthorizationError('You do not have permission to delete this file');
  }

  // Soft delete the file record
  await file.softDelete(userId);

  // TODO: Optionally delete from S3 (implement based on retention policy)
  // For now, keep files in S3 for recovery

  logBusiness('file_deleted', userId, file.workspace, {
    fileId: file.id,
    filename: file.filename
  });

  res.status(200).json({
    status: 'success',
    message: 'File deleted successfully'
  });
});

/**
 * @desc    Get file storage statistics
 * @route   GET /api/files/stats
 * @access  Private
 */
const getStorageStats = catchAsync(async (req, res) => {
  const workspaceId = req.workspace.id;
  const userId = req.user.id;

  const stats = await FileAttachment.getStorageStats(workspaceId);

  logBusiness('storage_stats_viewed', userId, workspaceId);

  res.status(200).json({
    status: 'success',
    data: {
      stats: stats[0] || {
        totalFiles: 0,
        totalSize: 0,
        averageSize: 0,
        fileTypes: []
      }
    }
  });
});

module.exports = {
  uploadFiles: [upload.array('files', 5), uploadFiles],
  getFiles,
  getFile,
  downloadFile,
  updateFile,
  deleteFile,
  getStorageStats
};