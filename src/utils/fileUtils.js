// Format file size for display
export const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// Get file type icon
export const getFileTypeIcon = (fileName, mimeType) => {
  const extension = fileName.split('.').pop()?.toLowerCase();
  
  if (mimeType?.includes('pdf') || extension === 'pdf') {
    return '📄';
  }
  if (mimeType?.includes('word') || extension === 'docx' || extension === 'doc') {
    return '📝';
  }
  if (mimeType?.includes('zip') || extension === 'zip') {
    return '🗂️';
  }
  if (mimeType?.includes('image') || ['jpg', 'jpeg', 'png', 'gif'].includes(extension)) {
    return '🖼️';
  }
  if (mimeType?.includes('text') || extension === 'txt') {
    return '📋';
  }
  
  return '📁';
};

// Get file type color for UI
export const getFileTypeColor = (fileName, mimeType) => {
  const extension = fileName.split('.').pop()?.toLowerCase();
  
  if (mimeType?.includes('pdf') || extension === 'pdf') {
    return 'text-red-600 bg-red-50';
  }
  if (mimeType?.includes('word') || extension === 'docx' || extension === 'doc') {
    return 'text-blue-600 bg-blue-50';
  }
  if (mimeType?.includes('zip') || extension === 'zip') {
    return 'text-yellow-600 bg-yellow-50';
  }
  if (mimeType?.includes('image') || ['jpg', 'jpeg', 'png', 'gif'].includes(extension)) {
    return 'text-green-600 bg-green-50';
  }
  if (mimeType?.includes('text') || extension === 'txt') {
    return 'text-gray-600 bg-gray-50';
  }
  
  return 'text-purple-600 bg-purple-50';
};

// Validate file type
export const isValidFileType = (file) => {
  const allowedTypes = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/zip',
    'text/plain',
    'image/jpeg',
    'image/png'
  ];

  const allowedExtensions = ['pdf', 'docx', 'zip', 'txt', 'jpg', 'jpeg', 'png'];
  const extension = file.name.split('.').pop()?.toLowerCase();

  return allowedTypes.includes(file.type) || allowedExtensions.includes(extension);
};

// Get file source icon
export const getFileSourceIcon = (file) => {
  if (file.source === 'googledrive') {
    return '💾';
  }
  return '💻';
};

// Create a preview URL for images
export const createPreviewUrl = (file) => {
  if (file.type.startsWith('image/')) {
    return URL.createObjectURL(file);
  }
  return null;
};