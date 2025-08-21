const mongoose = require('mongoose');

const fileSchema = new mongoose.Schema({
  originalName: {
    type: String,
    required: true,
    trim: true
  },
  filename: {
    type: String,
    required: function() {
      return this.uploadSource === 'local';
    },
    sparse: true // Allow null for non-local files
  },
  mimetype: {
    type: String,
    required: true
  },
  size: {
    type: Number,
    required: true
  },
  path: {
    type: String,
    required: function() {
      return this.uploadSource === 'local';
    }
  },
  // GridFS file ID for large files
  gridfsId: {
    type: mongoose.Schema.Types.ObjectId,
    required: function() {
      return this.uploadSource === 'googledrive';
    }
  },
  uploadSource: {
    type: String,
    enum: ['local', 'googledrive'],
    default: 'local'
  },
  // Google Drive specific fields
  googleDrive: {
    id: {
      type: String,
      required: function() {
        return this.uploadSource === 'googledrive';
      }
    },
    url: String,
    mimeType: String,
    originalDownloadUrl: String
  },
  // Processing information
  processing: {
    jobId: String,
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending'
    },
    error: String,
    processedAt: Date
  },
  metadata: {
    description: String,
    tags: [String],
    category: String
  },
  uploadedBy: {
    type: String,
    default: 'anonymous'
  },
  uploadDate: {
    type: Date,
    default: Date.now
  },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for file URL
fileSchema.virtual('url').get(function() {
  if (this.uploadSource === 'local' && this.filename) {
    return `/uploads/${this.filename}`;
  } else if (this.uploadSource === 'googledrive' && this.gridfsId) {
    return `/api/files/download/${this._id}`;
  }
  return null;
});

// Virtual for formatted file size
fileSchema.virtual('formattedSize').get(function() {
  const bytes = this.size;
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
});

// Indexes for better query performance
fileSchema.index({ uploadDate: -1 });
fileSchema.index({ uploadSource: 1 });
fileSchema.index({ 'googleDrive.id': 1 }, { sparse: true });
fileSchema.index({ 'processing.jobId': 1 }, { sparse: true });
fileSchema.index({ 'processing.status': 1 });

module.exports = mongoose.model('File', fileSchema);