class JobQueue {
  constructor() {
    this.jobs = new Map();
    this.isProcessing = false;
    this.cleanupInterval = null;
    
    // Start cleanup process
    this.startCleanup();
  }

  // Create a new job
  createJob(jobData) {
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const job = {
      id: jobId,
      type: jobData.type || 'google_drive_download',
      status: 'pending',
      progress: {
        total: jobData.files ? jobData.files.length : 0,
        completed: 0,
        failed: 0,
        current: 0
      },
      data: jobData,
      results: {
        successful: [],
        failed: []
      },
      metadata: {
        description: jobData.description,
        category: jobData.category,
        uploadedBy: jobData.uploadedBy
      },
      timestamps: {
        created: new Date(),
        started: null,
        completed: null
      },
      currentFile: null,
      error: null,
      logs: []
    };

    this.jobs.set(jobId, job);
    this.addLog(jobId, `Job created with ${job.progress.total} files`);
    
    return jobId;
  }

  // Get job by ID
  getJob(jobId) {
    return this.jobs.get(jobId);
  }

  // Update job progress
  updateJobProgress(jobId, progressData) {
    const job = this.jobs.get(jobId);
    if (!job) return false;

    // Update progress
    if (progressData.current !== undefined) {
      job.progress.current = progressData.current;
    }
    if (progressData.completed !== undefined) {
      job.progress.completed = progressData.completed;
    }
    if (progressData.failed !== undefined) {
      job.progress.failed = progressData.failed;
    }
    if (progressData.fileName) {
      job.currentFile = progressData.fileName;
    }
    if (progressData.status) {
      // Log status changes
      if (progressData.status === 'downloading') {
        this.addLog(jobId, `Downloading: ${progressData.fileName}`);
      } else if (progressData.status === 'completed') {
        this.addLog(jobId, `Completed: ${progressData.fileName}`);
      } else if (progressData.status === 'error') {
        this.addLog(jobId, `Error: ${progressData.fileName} - ${progressData.error}`);
      }
    }

    return true;
  }

  // Update job status
  updateJobStatus(jobId, status, error = null) {
    const job = this.jobs.get(jobId);
    if (!job) return false;

    job.status = status;
    
    if (status === 'processing' && !job.timestamps.started) {
      job.timestamps.started = new Date();
      this.addLog(jobId, 'Job processing started');
    } else if (['completed', 'failed', 'completed_with_errors'].includes(status)) {
      job.timestamps.completed = new Date();
      job.currentFile = null;
      
      const duration = job.timestamps.completed - job.timestamps.started;
      this.addLog(jobId, `Job ${status} in ${Math.round(duration / 1000)}s`);
    }

    if (error) {
      job.error = error;
      this.addLog(jobId, `Error: ${error}`);
    }

    return true;
  }

  // Add result to job
  addJobResult(jobId, result, isSuccess = true) {
    const job = this.jobs.get(jobId);
    if (!job) return false;

    if (isSuccess) {
      job.results.successful.push(result);
      job.progress.completed++;
    } else {
      job.results.failed.push(result);
      job.progress.failed++;
    }

    return true;
  }

  // Add log entry to job
  addLog(jobId, message, level = 'info') {
    const job = this.jobs.get(jobId);
    if (!job) return false;

    job.logs.push({
      timestamp: new Date(),
      level,
      message
    });

    // Keep only last 100 logs to prevent memory issues
    if (job.logs.length > 100) {
      job.logs = job.logs.slice(-100);
    }

    console.log(`[Job ${jobId}] ${message}`);
    return true;
  }

  // Get job progress for client
  getJobProgress(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) return null;

    const progressPercentage = job.progress.total > 0 
      ? Math.round((job.progress.completed / job.progress.total) * 100) 
      : 0;

    return {
      jobId: job.id,
      status: job.status,
      progress: {
        ...job.progress,
        percentage: progressPercentage
      },
      currentFile: job.currentFile,
      timestamps: job.timestamps,
      error: job.error,
      summary: {
        total: job.progress.total,
        completed: job.progress.completed,
        failed: job.progress.failed,
        remaining: job.progress.total - job.progress.completed - job.progress.failed
      }
    };
  }

  // Get detailed job info (for admin/debug)
  getJobDetails(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) return null;

    return {
      ...job,
      progress: {
        ...job.progress,
        percentage: job.progress.total > 0 
          ? Math.round((job.progress.completed / job.progress.total) * 100) 
          : 0
      }
    };
  }

  // List all jobs (with optional filtering)
  listJobs(options = {}) {
    const { status, limit = 50, offset = 0 } = options;
    
    let jobsList = Array.from(this.jobs.values());

    // Filter by status if provided
    if (status) {
      jobsList = jobsList.filter(job => job.status === status);
    }

    // Sort by creation time (newest first)
    jobsList.sort((a, b) => b.timestamps.created - a.timestamps.created);

    // Apply pagination
    const paginatedJobs = jobsList.slice(offset, offset + limit);

    return {
      jobs: paginatedJobs.map(job => this.getJobProgress(job.id)),
      pagination: {
        total: jobsList.length,
        offset,
        limit,
        hasMore: offset + limit < jobsList.length
      }
    };
  }

  // Remove job from queue
  removeJob(jobId) {
    const removed = this.jobs.delete(jobId);
    if (removed) {
      console.log(`Job ${jobId} removed from queue`);
    }
    return removed;
  }

  // Start automatic cleanup of old jobs
  startCleanup() {
    // Clean up every hour
    this.cleanupInterval = setInterval(() => {
      this.cleanupOldJobs();
    }, 60 * 60 * 1000);

    console.log('Job queue cleanup started');
  }

  // Stop automatic cleanup
  stopCleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      console.log('Job queue cleanup stopped');
    }
  }

  // Clean up old completed jobs
  cleanupOldJobs(maxAgeHours = 24) {
    const cutoffTime = new Date(Date.now() - (maxAgeHours * 60 * 60 * 1000));
    let cleanedCount = 0;

    for (const [jobId, job] of this.jobs) {
      // Remove completed jobs older than maxAgeHours
      if (job.timestamps.completed && job.timestamps.completed < cutoffTime) {
        this.jobs.delete(jobId);
        cleanedCount++;
      }
      // Also remove very old pending jobs (likely stale)
      else if (!job.timestamps.started && job.timestamps.created < cutoffTime) {
        this.jobs.delete(jobId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`Cleaned up ${cleanedCount} old jobs`);
    }

    return cleanedCount;
  }

  // Get queue statistics
  getStats() {
    const jobs = Array.from(this.jobs.values());
    
    const stats = {
      total: jobs.length,
      byStatus: {
        pending: 0,
        processing: 0,
        completed: 0,
        failed: 0,
        completed_with_errors: 0
      },
      totalFilesProcessed: 0,
      totalFilesInQueue: 0
    };

    jobs.forEach(job => {
      stats.byStatus[job.status] = (stats.byStatus[job.status] || 0) + 1;
      stats.totalFilesProcessed += job.progress.completed + job.progress.failed;
      stats.totalFilesInQueue += job.progress.total;
    });

    return stats;
  }

  // Shutdown cleanup
  shutdown() {
    this.stopCleanup();
    console.log('Job queue shut down');
  }
}

// Export singleton instance
module.exports = new JobQueue();