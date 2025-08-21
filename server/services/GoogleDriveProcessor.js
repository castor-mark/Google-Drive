const googleDriveService = require('./GoogleDriveService');
const gridFSService = require('./GridFSService');
const jobQueue = require('./JobQueue');
const tokenManager = require('./TokenManager');
const File = require('../models/File');
const fs = require('fs').promises;

class GoogleDriveProcessor {
  constructor() {
    this.isProcessing = false;
    this.currentJobs = new Set();
  }

  // Start processing a Google Drive job
  async processJob(jobId, userSession = null) {
    if (this.currentJobs.has(jobId)) {
      throw new Error('Job is already being processed');
    }

    const job = jobQueue.getJob(jobId);
    if (!job) {
      throw new Error('Job not found');
    }

    if (job.status !== 'pending') {
      throw new Error(`Job is not pending (status: ${job.status})`);
    }

    // Ensure we have user session for server-side authentication
    if (!userSession || !userSession.googleTokens) {
      throw new Error('User session with Google Drive access required');
    }

    // Add to current jobs
    this.currentJobs.add(jobId);
    
    try {
      // Update job status
      jobQueue.updateJobStatus(jobId, 'processing');

      // Get files from job data
      const googleDriveFiles = job.data.googleDriveFiles || job.data.files;
      if (!googleDriveFiles || googleDriveFiles.length === 0) {
        throw new Error('No Google Drive files found in job data');
      }

      // Process files in batches using server session tokens
      const batchSize = 5; // Process 5 files at a time
      await this.processFilesBatch(jobId, googleDriveFiles, batchSize, userSession);

      // Update final job status
      const finalJob = jobQueue.getJob(jobId);
      if (finalJob.progress.failed > 0) {
        jobQueue.updateJobStatus(jobId, 'completed_with_errors');
      } else {
        jobQueue.updateJobStatus(jobId, 'completed');
      }

    } catch (error) {
      console.error(`Job ${jobId} processing failed:`, error);
      jobQueue.updateJobStatus(jobId, 'failed', error.message);
      throw error;
    } finally {
      // Remove from current jobs
      this.currentJobs.delete(jobId);
    }
  }

  // Validate access tokens for all files
  async validateAccessTokens(googleDriveFiles) {
    const tokens = new Set(googleDriveFiles.map(f => f.accessToken));
    
    for (const token of tokens) {
      const isValid = await googleDriveService.validateToken(token);
      if (!isValid) {
        throw new Error('One or more Google Drive access tokens are invalid or expired');
      }
    }
  }

  // Process files in batches
  async processFilesBatch(jobId, googleDriveFiles, batchSize, userSession) {
    for (let i = 0; i < googleDriveFiles.length; i += batchSize) {
      const batch = googleDriveFiles.slice(i, i + batchSize);
      
      // Process batch in parallel
      const batchPromises = batch.map((fileMetadata, batchIndex) => 
        this.processSingleFile(jobId, fileMetadata, i + batchIndex, userSession)
      );
      
      await Promise.allSettled(batchPromises);

      // Add small delay between batches to avoid rate limits
      if (i + batchSize < googleDriveFiles.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  // Process a single Google Drive file
  async processSingleFile(jobId, fileMetadata, index, userSession) {
    const job = jobQueue.getJob(jobId);
    if (!job) return;

    let tempFilePath = null;
    
    try {
      // Update progress - start processing this file
      jobQueue.updateJobProgress(jobId, {
        current: index + 1,
        fileName: fileMetadata.name,
        status: 'downloading'
      });

      console.log(`Processing file ${index + 1}: ${fileMetadata.name}`);
      console.log('File metadata:', {
        id: fileMetadata.id,
        name: fileMetadata.name,
        size: fileMetadata.size
      });

      // Get valid access token from user session (refresh if needed)
      let validAccessToken;
      try {
        // Check if session token needs refreshing
        const sessionTokens = userSession.googleTokens;
        const now = new Date();
        const tokenAge = now - new Date(sessionTokens.createdAt);
        const tokenExpired = tokenAge > (sessionTokens.expiresIn * 1000);

        if (tokenExpired && sessionTokens.refreshToken) {
          console.log('Session token expired, refreshing...');
          validAccessToken = await tokenManager.getValidAccessToken(
            sessionTokens.refreshToken,
            sessionTokens.accessToken
          );
          // Update session with new token
          userSession.googleTokens.accessToken = validAccessToken;
          userSession.googleTokens.createdAt = new Date();
        } else {
          validAccessToken = sessionTokens.accessToken;
        }
        
        console.log('Got valid access token from user session');
      } catch (tokenError) {
        console.error('Failed to get valid access token from session:', tokenError);
        throw new Error('Authentication failed. Please log in again.');
      }

      // Download file from Google Drive
      const downloadResult = await googleDriveService.downloadFile(
        fileMetadata.id,
        validAccessToken
      );
      
      tempFilePath = downloadResult.tempFilePath;

      // Upload to GridFS using buffer approach (more reliable)
      console.log('Starting GridFS upload using buffer method...');
      const fileBuffer = await require('fs').promises.readFile(tempFilePath);
      console.log(`Read file into buffer: ${fileBuffer.length} bytes`);
      
      const gridfsResult = await gridFSService.uploadFromBuffer(
        fileBuffer,
        fileMetadata.name,
        {
          originalName: fileMetadata.name,
          mimeType: fileMetadata.mimeType,
          size: fileMetadata.size,
          source: 'googledrive',
          googleDriveId: fileMetadata.id,
          jobId: jobId
        }
      );
      console.log('GridFS upload completed:', gridfsResult.fileId);

      // Create file document in database
      const fileDoc = new File({
        originalName: fileMetadata.name,
        mimetype: fileMetadata.mimeType || downloadResult.mimeType,
        size: fileMetadata.size || downloadResult.size,
        gridfsId: gridfsResult.fileId,
        uploadSource: 'googledrive',
        googleDrive: {
          id: fileMetadata.id,
          url: fileMetadata.url,
          mimeType: fileMetadata.mimeType,
          originalDownloadUrl: fileMetadata.url
        },
        processing: {
          jobId: jobId,
          status: 'completed',
          processedAt: new Date()
        },
        metadata: {
          description: job.metadata.description || '',
          category: job.metadata.category || 'googledrive',
        },
        uploadedBy: job.metadata.uploadedBy || 'anonymous'
      });

      const savedFile = await fileDoc.save();

      // Add to successful results
      jobQueue.addJobResult(jobId, {
        fileId: savedFile._id,
        originalName: savedFile.originalName,
        size: savedFile.size,
        gridfsId: savedFile.gridfsId,
        googleDriveId: fileMetadata.id
      }, true);

      // Update progress - completed
      jobQueue.updateJobProgress(jobId, {
        fileName: fileMetadata.name,
        status: 'completed'
      });

      console.log(`Successfully processed: ${fileMetadata.name}`);

    } catch (error) {
      console.error(`Error processing ${fileMetadata.name}:`, error);
      
      // Add to failed results
      jobQueue.addJobResult(jobId, {
        fileName: fileMetadata.name,
        googleDriveId: fileMetadata.id,
        error: error.message
      }, false);

      // Update progress - error
      jobQueue.updateJobProgress(jobId, {
        fileName: fileMetadata.name,
        status: 'error',
        error: error.message
      });

    } finally {
      // Clean up temp file
      if (tempFilePath) {
        try {
          await googleDriveService.cleanupTempFile(tempFilePath);
        } catch (cleanupError) {
          console.error('Cleanup error:', cleanupError);
        }
      }
    }
  }

  // Process job in background (fire and forget)
  processJobAsync(jobId, userSession) {
    // Don't await - let it run in background
    this.processJob(jobId, userSession).catch(error => {
      console.error(`Background job ${jobId} failed:`, error);
    });
  }

  // Get processing stats
  getStats() {
    return {
      currentlyProcessing: this.currentJobs.size,
      activeJobs: Array.from(this.currentJobs),
      queueStats: jobQueue.getStats()
    };
  }

  // Stop processing (for graceful shutdown)
  async stop() {
    console.log('Stopping Google Drive processor...');
    
    // Wait for current jobs to finish (with timeout)
    const timeout = 30000; // 30 seconds
    const startTime = Date.now();
    
    while (this.currentJobs.size > 0 && (Date.now() - startTime) < timeout) {
      console.log(`Waiting for ${this.currentJobs.size} jobs to complete...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    if (this.currentJobs.size > 0) {
      console.warn(`${this.currentJobs.size} jobs still running after timeout`);
    }
    
    console.log('Google Drive processor stopped');
  }
}

// Export singleton
module.exports = new GoogleDriveProcessor();