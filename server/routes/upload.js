const express = require('express');
const router = express.Router();
const File = require('../models/File');
const { upload, handleMulterError, validateUpload } = require('../middleware/upload');

// Google Drive services
const jobQueue = require('../services/JobQueue');
const googleDriveProcessor = require('../services/GoogleDriveProcessor');
const gridFSService = require('../services/GridFSService');

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


// POST /api/upload/google-drive - Handle Google Drive files
router.post('/google-drive', async (req, res) => {
  try {
    // Check if user is authenticated with Google Drive access
    if (!req.session.authenticated || !req.session.googleTokens) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required. Please log in to access Google Drive.'
      });
    }

    const { googleDriveFiles, description, category, uploadedBy } = req.body;
    
    console.log('Received Google Drive upload request from user:', req.session.user.email);
    console.log('Files count:', googleDriveFiles ? googleDriveFiles.length : 0);
    console.log('First file sample:', googleDriveFiles ? googleDriveFiles[0] : 'none');
    
    // Validation
    if (!googleDriveFiles || !Array.isArray(googleDriveFiles) || googleDriveFiles.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No Google Drive files provided'
      });
    }

    // Validate file metadata (no longer need accessToken since we use session)
    for (const file of googleDriveFiles) {
      if (!file.id || !file.name) {
        return res.status(400).json({
          success: false,
          error: 'Invalid file metadata: id and name are required'
        });
      }
    }

    // Create job for background processing
    const jobId = jobQueue.createJob({
      type: 'google_drive_download',
      googleDriveFiles,
      description: description || '',
      category: category || 'googledrive',
      uploadedBy: req.session.user.email || uploadedBy || 'anonymous'
    });

    // Start processing in background with user session
    googleDriveProcessor.processJobAsync(jobId, req.session);

    res.status(202).json({
      success: true,
      message: 'Google Drive processing started',
      jobId,
      totalFiles: googleDriveFiles.length,
      status: 'processing'
    });

  } catch (error) {
    console.error('Google Drive upload error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start Google Drive processing',
      details: error.message
    });
  }
});

// GET /api/upload/progress/:jobId - Get job progress
router.get('/progress/:jobId', (req, res) => {
  try {
    const { jobId } = req.params;
    const progress = jobQueue.getJobProgress(jobId);
    
    if (!progress) {
      return res.status(404).json({
        success: false,
        error: 'Job not found'
      });
    }

    res.json({
      success: true,
      ...progress
    });

  } catch (error) {
    console.error('Progress check error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get job progress',
      details: error.message
    });
  }
});

// GET /api/upload/jobs - List all jobs (admin endpoint)
router.get('/jobs', (req, res) => {
  try {
    const { status, limit = 20, offset = 0 } = req.query;
    
    const result = jobQueue.listJobs({
      status,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      success: true,
      ...result
    });

  } catch (error) {
    console.error('Jobs list error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get jobs list',
      details: error.message
    });
  }
});

// GET /api/upload/stats - Get processing statistics
router.get('/stats', (req, res) => {
  try {
    const stats = googleDriveProcessor.getStats();
    
    res.json({
      success: true,
      ...stats
    });

  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get statistics',
      details: error.message
    });
  }
});

// GET /api/upload/download/:fileId - Download file from GridFS
router.get('/download/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    
    // Get file info from database
    const file = await File.findById(fileId);
    if (!file) {
      return res.status(404).json({
        success: false,
        error: 'File not found'
      });
    }

    if (file.uploadSource === 'local') {
      // Redirect to static file
      return res.redirect(file.url);
    }

    if (!file.gridfsId) {
      return res.status(404).json({
        success: false,
        error: 'File not available for download'
      });
    }

    // Get file from GridFS
    const downloadStream = await gridFSService.downloadFile(file.gridfsId);
    
    // Set response headers
    res.set({
      'Content-Type': file.mimetype,
      'Content-Disposition': `attachment; filename="${file.originalName}"`
    });

    // Stream file to response
    downloadStream.pipe(res);

  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to download file',
      details: error.message
    });
  }
});

module.exports = router;