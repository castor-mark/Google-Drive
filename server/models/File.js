const mongoose = require('mongoose');

const fileSchema = new mongoose.Schema({
  originalName: {
    type: String,
    required: true,
    trim: true
  },
  filename: {
    type: String,
    required: true,
    unique: true
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
    required: true
  },
  uploadSource: {
    type: String,
    default: 'local'
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
  return `/uploads/${this.filename}`;
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

// Index for better query performance
fileSchema.index({ uploadDate: -1 });

module.exports = mongoose.model('File', fileSchema);