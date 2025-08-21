const mongoose = require('mongoose');
const { GridFSBucket } = require('mongodb');
const fs = require('fs');

class GridFSService {
  constructor() {
    this.bucket = null;
    this.isInitialized = false;
  }

  // Initialize GridFS bucket
  async initialize(db = null) {
    try {
      const database = db || mongoose.connection.db;
      
      if (!database) {
        throw new Error('Database connection not available');
      }

      this.bucket = new GridFSBucket(database, {
        bucketName: 'uploads'
      });
      
      // Ensure GridFS collections exist
      try {
        console.log('Creating GridFS collections if they don\'t exist...');
        await database.createCollection('uploads.files');
        await database.createCollection('uploads.chunks');
        console.log('GridFS collections ready');
      } catch (collectionError) {
        // Collections might already exist, which is fine
        if (collectionError.message.includes('already exists')) {
          console.log('GridFS collections already exist');
        } else {
          console.log('GridFS collection creation info:', collectionError.message);
        }
      }
      
      this.isInitialized = true;
      console.log('GridFS service initialized successfully');
      return true;
    } catch (error) {
      console.error('Failed to initialize GridFS:', error);
      return false;
    }
  }

  // Ensure GridFS is initialized
  async ensureInitialized() {
    if (!this.isInitialized) {
      const success = await this.initialize();
      if (!success) {
        throw new Error('GridFS service not initialized');
      }
    }
  }

  // Upload file from local path to GridFS
  async uploadFromPath(filePath, fileName, metadata = {}) {
    try {
      console.log(`1. GridFS: Starting upload from ${filePath}`);
      await this.ensureInitialized();

      return new Promise((resolve, reject) => {
        console.log(`2. GridFS: Creating read stream for ${fileName}`);
        const readStream = fs.createReadStream(filePath);
        const uploadStream = this.bucket.openUploadStream(fileName, {
          metadata: {
            ...metadata,
            uploadedAt: new Date(),
            originalPath: filePath
          }
        });
        
        console.log('GridFS: Streams created, starting upload...');

        let uploadedBytes = 0;

        readStream.on('data', (chunk) => {
          uploadedBytes += chunk.length;
          if (uploadedBytes % 100000 === 0) {
            console.log(`GridFS: Uploaded ${uploadedBytes} bytes`);
          }
        });

        uploadStream.on('error', (error) => {
          clearTimeout(uploadTimeout);
          console.error('GridFS upload error:', error);
          reject(new Error(`Failed to upload to GridFS: ${error.message}`));
        });

        uploadStream.on('finish', () => {
          clearTimeout(uploadTimeout);
          console.log(`✅ GridFS: Upload finished successfully - ${uploadedBytes} bytes total`);
          console.log('3. Upload finished - File ID:', uploadStream.id);
          resolve({
            fileId: uploadStream.id,
            filename: fileName,
            length: uploadedBytes,
            uploadDate: uploadStream.uploadDate,
            metadata: uploadStream.metadata
          });
        });

        readStream.on('error', (error) => {
          clearTimeout(uploadTimeout);
          console.error('GridFS file read error:', error);
          reject(new Error(`Failed to read file: ${error.message}`));
        });

        // Add timeout for GridFS upload
        const uploadTimeout = setTimeout(() => {
          console.log('GridFS upload timeout - cleaning up...');
          readStream.destroy();
          uploadStream.destroy();
          reject(new Error('GridFS upload timeout'));
        }, 30000); // 30 seconds

        readStream.on('open', () => {
          console.log('GridFS: Read stream opened');
        });

        readStream.on('close', () => {
          console.log('GridFS: Read stream closed');
        });

        uploadStream.on('progress', () => {
          console.log('GridFS: Upload stream progress event');
        });

        uploadStream.on('close', () => {
          console.log('GridFS: Upload stream closed');
          clearTimeout(uploadTimeout);
        });

        console.log('GridFS: Piping read stream to upload stream...');
        readStream.pipe(uploadStream);
      });

    } catch (error) {
      console.error('Upload from path error:', error);
      throw error;
    }
  }

  // Upload file from buffer to GridFS
  async uploadFromBuffer(buffer, fileName, metadata = {}) {
    try {
      await this.ensureInitialized();

      return new Promise((resolve, reject) => {
        console.log('1. Creating GridFS upload stream for:', fileName);
        console.log('2. Buffer size:', buffer.length, 'bytes');
        
        const uploadStream = this.bucket.openUploadStream(fileName, {
          metadata: {
            ...metadata,
            uploadedAt: new Date(),
            source: 'buffer'
          }
        });

        // Add timeout to prevent infinite hangs
        const uploadTimeout = setTimeout(() => {
          console.log('❌ GridFS buffer upload timeout - cleaning up...');
          uploadStream.destroy();
          reject(new Error('GridFS buffer upload timeout (30s)'));
        }, 30000); // 30 seconds

        console.log('3. Adding event listeners...');
        
        uploadStream.on('error', (error) => {
          clearTimeout(uploadTimeout);
          console.error('❌ GridFS buffer upload error:', error);
          reject(new Error(`Failed to upload buffer to GridFS: ${error.message}`));
        });

        uploadStream.on('finish', () => {
          clearTimeout(uploadTimeout);
          console.log('✅ GridFS buffer upload completed successfully');
          console.log('4. Upload finished - File ID:', uploadStream.id);
          resolve({
            fileId: uploadStream.id,
            filename: fileName,
            length: buffer.length,
            uploadDate: uploadStream.uploadDate,
            metadata: uploadStream.metadata
          });
        });

        uploadStream.on('close', () => {
          console.log('5. GridFS upload stream closed');
        });

        uploadStream.on('progress', () => {
          console.log('📈 GridFS upload progress event');
        });

        console.log('6. Writing buffer and ending stream...');
        uploadStream.end(buffer);
        console.log('7. Buffer written, waiting for finish event...');
      });

    } catch (error) {
      console.error('Upload from buffer error:', error);
      throw error;
    }
  }

  // Download file from GridFS
  async downloadFile(fileId, outputPath = null) {
    try {
      this.ensureInitialized();
      
      const objectId = new mongoose.Types.ObjectId(fileId);

      if (outputPath) {
        // Download to file
        return new Promise((resolve, reject) => {
          const downloadStream = this.bucket.openDownloadStream(objectId);
          const writeStream = fs.createWriteStream(outputPath);

          downloadStream.on('error', (error) => {
            console.error('GridFS download error:', error);
            reject(new Error(`Failed to download from GridFS: ${error.message}`));
          });

          writeStream.on('error', (error) => {
            console.error('File write error:', error);
            reject(new Error(`Failed to write file: ${error.message}`));
          });

          writeStream.on('finish', () => {
            resolve({
              filePath: outputPath,
              success: true
            });
          });

          downloadStream.pipe(writeStream);
        });
      } else {
        // Return stream
        return this.bucket.openDownloadStream(objectId);
      }

    } catch (error) {
      console.error('Download file error:', error);
      throw error;
    }
  }

  // Get file info from GridFS
  async getFileInfo(fileId) {
    try {
      this.ensureInitialized();
      
      const objectId = new mongoose.Types.ObjectId(fileId);
      const db = this.bucket.s.db;
      
      const fileInfo = await db.collection('uploads.files').findOne({ _id: objectId });
      
      if (!fileInfo) {
        throw new Error('File not found in GridFS');
      }

      return {
        id: fileInfo._id,
        filename: fileInfo.filename,
        length: fileInfo.length,
        chunkSize: fileInfo.chunkSize,
        uploadDate: fileInfo.uploadDate,
        metadata: fileInfo.metadata
      };

    } catch (error) {
      console.error('Get file info error:', error);
      throw error;
    }
  }

  // Delete file from GridFS
  async deleteFile(fileId) {
    try {
      this.ensureInitialized();
      
      const objectId = new mongoose.Types.ObjectId(fileId);
      await this.bucket.delete(objectId);
      
      console.log(`File ${fileId} deleted from GridFS`);
      return true;

    } catch (error) {
      console.error('Delete file error:', error);
      throw error;
    }
  }

  // List files in GridFS (with pagination)
  async listFiles(options = {}) {
    try {
      this.ensureInitialized();
      
      const { limit = 50, skip = 0, sort = { uploadDate: -1 } } = options;
      const db = this.bucket.s.db;
      
      const files = await db.collection('uploads.files')
        .find({})
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .toArray();

      const total = await db.collection('uploads.files').countDocuments({});

      return {
        files: files.map(file => ({
          id: file._id,
          filename: file.filename,
          length: file.length,
          uploadDate: file.uploadDate,
          metadata: file.metadata
        })),
        pagination: {
          total,
          skip,
          limit,
          hasMore: skip + limit < total
        }
      };

    } catch (error) {
      console.error('List files error:', error);
      throw error;
    }
  }

  // Get storage statistics
  async getStats() {
    try {
      this.ensureInitialized();
      
      const db = this.bucket.s.db;
      
      const stats = await db.collection('uploads.files').aggregate([
        {
          $group: {
            _id: null,
            totalFiles: { $sum: 1 },
            totalSize: { $sum: '$length' },
            averageSize: { $avg: '$length' }
          }
        }
      ]).toArray();

      const result = stats[0] || {
        totalFiles: 0,
        totalSize: 0,
        averageSize: 0
      };

      return {
        totalFiles: result.totalFiles,
        totalSize: result.totalSize,
        averageSize: Math.round(result.averageSize || 0),
        formattedTotalSize: this.formatBytes(result.totalSize)
      };

    } catch (error) {
      console.error('Get stats error:', error);
      throw error;
    }
  }

  // Utility: Format bytes to human readable
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // Cleanup old files (optional maintenance)
  async cleanupOldFiles(olderThanDays = 30) {
    try {
      this.ensureInitialized();
      
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
      
      const db = this.bucket.s.db;
      const oldFiles = await db.collection('uploads.files')
        .find({ uploadDate: { $lt: cutoffDate } })
        .toArray();

      let deletedCount = 0;
      for (const file of oldFiles) {
        try {
          await this.bucket.delete(file._id);
          deletedCount++;
        } catch (error) {
          console.error(`Failed to delete file ${file._id}:`, error);
        }
      }

      console.log(`Cleaned up ${deletedCount} old files from GridFS`);
      return deletedCount;

    } catch (error) {
      console.error('Cleanup error:', error);
      throw error;
    }
  }
}

// Export singleton
module.exports = new GridFSService();