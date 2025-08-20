const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure uploads directory exists
const uploadDir = process.env.UPLOAD_PATH || './uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Generate unique filename with timestamp and random string
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext);
    
    // Sanitize filename
    const sanitizedName = name.replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `${sanitizedName}_${uniqueSuffix}${ext}`;
    
    cb(null, filename);
  }
});

// File filter function
const fileFilter = (req, file, cb) => {
  // Allowed file types
  const allowedTypes = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/zip',
    'text/plain',
    'image/jpeg',
    'image/png',
    'image/jpg'
  ];

  // Allowed extensions as backup check
  const allowedExtensions = ['.pdf', '.docx', '.zip', '.txt', '.jpg', '.jpeg', '.png'];
  const fileExtension = path.extname(file.originalname).toLowerCase();

  if (allowedTypes.includes(file.mimetype) || allowedExtensions.includes(fileExtension)) {
    cb(null, true);
  } else {
    cb(new Error(`File type not supported: ${file.mimetype}. Allowed types: PDF, DOCX, ZIP, TXT, JPG, PNG`), false);
  }
};

// Configure multer
const upload = multer({
  storage: storage,
  fileFilter: fileFilter
});

// Error handling middleware for multer
const handleMulterError = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    return res.status(400).json({
      error: `Upload error: ${error.message}`
    });
  }
  
  if (error.message.includes('File type not supported')) {
    return res.status(400).json({
      error: error.message
    });
  }
  
  next(error);
};

// Validation middleware
const validateUpload = (req, res, next) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({
      error: 'No files provided for upload.'
    });
  }

  // Check for ZIP file restrictions
  const zipFiles = req.files.filter(file => 
    file.mimetype === 'application/zip' || 
    path.extname(file.originalname).toLowerCase() === '.zip'
  );

  if (zipFiles.length > 0 && req.files.length > 1) {
    return res.status(400).json({
      error: 'You can only upload one ZIP file at a time.'
    });
  }

  next();
};

module.exports = {
  upload,
  handleMulterError,
  validateUpload
};