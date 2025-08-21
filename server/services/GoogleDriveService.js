const { google } = require('googleapis');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

class ServerGoogleDriveService {
  constructor() {
    this.drive = null;
  }

  // Initialize Google Drive client with access token
  initializeWithToken(accessToken) {
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    this.drive = google.drive({ version: 'v3', auth: oauth2Client });
    return this.drive;
  }

  // Download a file from Google Drive
  async downloadFile(fileId, accessToken, tempDir = 'temp') {
    try {
      console.log(`Starting download for file ID: ${fileId}`);
      console.log(`Access token length: ${accessToken ? accessToken.length : 'undefined'}`);
      
      // Initialize drive client with token
      this.initializeWithToken(accessToken);

      // Get file metadata first
      console.log('Getting file metadata...');
      const fileMetadata = await Promise.race([
        this.drive.files.get({
          fileId: fileId,
          fields: 'name, size, mimeType'
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Metadata request timeout')), 10000)
        )
      ]);
      
      console.log('File metadata retrieved:', fileMetadata.data);

      // Create temp directory if it doesn't exist
      const tempDirPath = path.join(__dirname, '..', tempDir);
      await fs.mkdir(tempDirPath, { recursive: true });

      // Generate unique filename
      const fileName = fileMetadata.data.name;
      const timestamp = Date.now();
      const random = Math.random().toString(36).substr(2, 9);
      const uniqueFileName = `${fileId}_${timestamp}_${random}_${fileName}`;
      const tempFilePath = path.join(tempDirPath, uniqueFileName);

      // Download file content
      console.log('Starting file content download...');
      const response = await Promise.race([
        this.drive.files.get({
          fileId: fileId,
          alt: 'media'
        }, { responseType: 'stream' }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Download request timeout')), 30000)
        )
      ]);
      
      console.log('File download stream received');

      // Write to temporary file
      console.log(`Creating write stream to: ${tempFilePath}`);
      const writeStream = fsSync.createWriteStream(tempFilePath);
      
      return new Promise((resolve, reject) => {
        let downloadedBytes = 0;
        const totalBytes = parseInt(fileMetadata.data.size) || 0;
        console.log(`Expected file size: ${totalBytes} bytes`);

        // Set up timeout for the entire download process
        const downloadTimeout = setTimeout(() => {
          console.log('Download timeout reached');
          writeStream.destroy();
          fs.unlink(tempFilePath).catch(() => {});
          reject(new Error('Download timeout'));
        }, 60000); // 60 seconds

        response.data.on('data', (chunk) => {
          downloadedBytes += chunk.length;
          if (downloadedBytes % 100000 === 0) { // Log every 100KB
            console.log(`Downloaded: ${downloadedBytes}/${totalBytes} bytes (${Math.round((downloadedBytes/totalBytes)*100)}%)`);
          }
        });

        response.data.on('end', () => {
          clearTimeout(downloadTimeout);
          console.log(`Download completed: ${downloadedBytes} bytes`);
          resolve({
            tempFilePath,
            fileName,
            size: downloadedBytes,
            mimeType: fileMetadata.data.mimeType,
            metadata: fileMetadata.data
          });
        });

        response.data.on('error', (error) => {
          clearTimeout(downloadTimeout);
          console.log('Download stream error:', error);
          // Clean up temp file on error
          fs.unlink(tempFilePath).catch(() => {});
          reject(new Error(`Download failed: ${error.message}`));
        });

        writeStream.on('error', (error) => {
          clearTimeout(downloadTimeout);
          console.log('Write stream error:', error);
          // Clean up temp file on error
          fs.unlink(tempFilePath).catch(() => {});
          reject(new Error(`Write failed: ${error.message}`));
        });

        writeStream.on('finish', () => {
          console.log('Write stream finished');
        });

        console.log('Starting to pipe download stream to file...');
        response.data.pipe(writeStream);
      });

    } catch (error) {
      console.error(`Error downloading file ${fileId}:`, error);
      
      if (error.response?.status === 401) {
        throw new Error('Google Drive access token expired');
      } else if (error.response?.status === 403) {
        throw new Error('Insufficient permissions to download file');
      } else if (error.response?.status === 404) {
        throw new Error('File not found in Google Drive');
      }
      
      throw new Error(`Download failed: ${error.message}`);
    }
  }

  // Clean up temporary file
  async cleanupTempFile(tempFilePath) {
    try {
      await fs.unlink(tempFilePath);
      console.log('Cleaned up temp file:', tempFilePath);
    } catch (error) {
      console.error('Error cleaning up temp file:', error);
    }
  }

  // Get file info without downloading
  async getFileInfo(fileId, accessToken) {
    try {
      this.initializeWithToken(accessToken);
      
      const response = await this.drive.files.get({
        fileId: fileId,
        fields: 'id, name, size, mimeType, createdTime, modifiedTime, parents'
      });

      return response.data;
    } catch (error) {
      console.error(`Error getting file info ${fileId}:`, error);
      throw new Error(`Failed to get file info: ${error.message}`);
    }
  }

  // Download multiple files in batches
  async downloadFilesBatch(fileMetadataArray, batchSize = 5, onProgress = null) {
    const results = [];
    const errors = [];
    
    // Process files in batches
    for (let i = 0; i < fileMetadataArray.length; i += batchSize) {
      const batch = fileMetadataArray.slice(i, i + batchSize);
      
      // Process batch in parallel
      const batchPromises = batch.map(async (fileMetadata, batchIndex) => {
        const globalIndex = i + batchIndex;
        
        try {
          if (onProgress) {
            onProgress({
              current: globalIndex + 1,
              total: fileMetadataArray.length,
              fileName: fileMetadata.name,
              status: 'downloading'
            });
          }

          const result = await this.downloadFile(
            fileMetadata.id, 
            fileMetadata.accessToken
          );

          if (onProgress) {
            onProgress({
              current: globalIndex + 1,
              total: fileMetadataArray.length,
              fileName: fileMetadata.name,
              status: 'completed'
            });
          }

          return {
            success: true,
            fileMetadata,
            downloadResult: result
          };

        } catch (error) {
          console.error(`Error in batch processing for ${fileMetadata.name}:`, error);
          
          if (onProgress) {
            onProgress({
              current: globalIndex + 1,
              total: fileMetadataArray.length,
              fileName: fileMetadata.name,
              status: 'error',
              error: error.message
            });
          }

          return {
            success: false,
            fileMetadata,
            error: error.message
          };
        }
      });

      // Wait for batch to complete
      const batchResults = await Promise.allSettled(batchPromises);
      
      // Process results
      batchResults.forEach((result, batchIndex) => {
        if (result.status === 'fulfilled') {
          if (result.value.success) {
            results.push(result.value);
          } else {
            errors.push({
              fileMetadata: result.value.fileMetadata,
              error: result.value.error
            });
          }
        } else {
          const globalIndex = i + batchIndex;
          const fileMetadata = batch[batchIndex];
          errors.push({
            fileMetadata,
            error: result.reason?.message || 'Unknown error'
          });
        }
      });

      // Add small delay between batches to avoid rate limits
      if (i + batchSize < fileMetadataArray.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return {
      successful: results,
      failed: errors,
      summary: {
        total: fileMetadataArray.length,
        successful: results.length,
        failed: errors.length
      }
    };
  }

  // Check if access token is still valid
  async validateToken(accessToken) {
    try {
      this.initializeWithToken(accessToken);
      
      // Try to get user info to validate token
      const oauth2 = google.oauth2({ version: 'v2', auth: this.drive._options.auth });
      await oauth2.userinfo.get();
      
      return true;
    } catch (error) {
      console.error('Token validation failed:', error);
      return false;
    }
  }
}

module.exports = new ServerGoogleDriveService();