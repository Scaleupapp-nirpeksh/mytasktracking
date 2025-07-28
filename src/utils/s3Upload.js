// src/utils/s3Upload.js

const { S3Client } = require('@aws-sdk/client-s3');
const multer = require('multer');
const multerS3 = require('multer-s3');
const AppError = require('./appError');

// 1. Configure the S3 Client
// This creates an S3 client instance using credentials from environment variables.
const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// 2. Define the file filter
// This function checks the file's mimetype to ensure it's an allowed format.
const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
    'text/plain',
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true); // Accept the file
  } else {
    cb(new AppError('Invalid file type. Please upload a valid document or image.', 400), false); // Reject the file
  }
};

// 3. Configure Multer-S3 Storage Engine
// This sets up multer to upload files directly to your S3 bucket.
const upload = multer({
  storage: multerS3({
    s3: s3,
    bucket: process.env.AWS_S3_BUCKET_NAME,
    contentType: multerS3.AUTO_CONTENT_TYPE, // Automatically set the content-type
    key: function (req, file, cb) {
      // Generate a unique key for the file to prevent overwrites.
      // Format: user-<userId>/task-<taskId>/<timestamp>-<originalFilename>
      const uniqueKey = `user-${req.user.id}/task-${req.params.id}/${Date.now().toString()}-${file.originalname}`;
      cb(null, uniqueKey);
    },
  }),
  fileFilter: fileFilter,
  limits: {
    fileSize: 1024 * 1024 * 15, // 15MB file size limit
  },
});

module.exports = upload;
