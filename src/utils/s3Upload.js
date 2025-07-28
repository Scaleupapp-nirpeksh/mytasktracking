// src/utils/s3Upload.js
const { S3Client } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');
const multer = require('multer');
const AppError = require('./appError');

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new AppError('Invalid file type. Please upload a valid document or image.', 400), false);
  }
};

// Custom storage engine
const customS3Storage = multer.memoryStorage();

const upload = multer({
  storage: customS3Storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 1024 * 1024 * 15, // 15MB
  },
});

// Custom upload function
const uploadToS3 = async (file, userId, taskId) => {
  const uniqueKey = `user-${userId}/task-${taskId}/${Date.now().toString()}-${file.originalname}`;
  
  const uploadParams = {
    Bucket: process.env.AWS_S3_BUCKET_NAME,
    Key: uniqueKey,
    Body: file.buffer,
    ContentType: file.mimetype,
  };

  const upload = new Upload({
    client: s3,
    params: uploadParams,
  });

  return await upload.done();
};

module.exports = { upload, uploadToS3 };