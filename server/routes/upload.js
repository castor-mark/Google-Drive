const express = require('express');
const router = express.Router();
const File = require('../models/File');
const { upload, handleMulterError, validateUpload } = require('../middleware/upload');

// POST /api/upload - Handle file uploads
router.post('/', 
  upload.array('files'), // Allow unlimited files with field name 'files'
  handleMulterError,
  validateUpload,
  async (req, res) => {
    try {
      const uploadedFiles = [];
      const errors = [];

      // Process each uploaded file
      for (const file of req.files) {
        try {
          // Extract metadata from request body if provided
          const metadata = {
            description: req.body.description || '',
            tags: req.body.tags ? req.body.tags.split(',').map(tag => tag.trim()) : [],
            category: req.body.category || 'general'
          };

          // Create file document
          const fileDoc = new File({
            originalName: file.originalname,
            filename: file.filename,
            mimetype: file.mimetype,
            size: file.size,
            path: file.path,
            uploadSource: req.body.source || 'local',
            googleDriveId: req.body.googleDriveId || null,
            metadata: metadata,
            uploadedBy: req.body.uploadedBy || 'anonymous'
          });

          // Save to database
          const savedFile = await fileDoc.save();
          
          uploadedFiles.push({
            id: savedFile._id,
            originalName: savedFile.originalName,
            filename: savedFile.filename,
            size: savedFile.size,
            formattedSize: savedFile.formattedSize,
            mimetype: savedFile.mimetype,
            url: savedFile.url,
            uploadDate: savedFile.uploadDate,
            metadata: savedFile.metadata
          });

        } catch (dbError) {
          console.error('Database error for file:', file.originalname, dbError);
          errors.push({
            filename: file.originalname,
            error: 'Failed to save file information to database'
          });
        }
      }

      // Prepare response
      const response = {
        success: true,
        message: `Successfully uploaded ${uploadedFiles.length} file(s)`,
        files: uploadedFiles,
        summary: {
          total: req.files.length,
          successful: uploadedFiles.length,
          failed: errors.length
        }
      };

      if (errors.length > 0) {
        response.errors = errors;
        response.message += ` with ${errors.length} error(s)`;
      }

      res.status(200).json(response);

    } catch (error) {
      console.error('Upload processing error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to process file upload',
        details: error.message
      });
    }
  }
);


module.exports = router;