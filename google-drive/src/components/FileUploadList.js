import React from 'react';
import { FaTrash, FaCheck, FaGoogleDrive, FaDesktop, FaExternalLinkAlt, FaEye } from 'react-icons/fa';
import { formatFileSize, getFileTypeIcon, getFileTypeColor } from '../utils/fileUtils';

const FileUploadList = ({ 
  files, 
  uploadProgress, 
  onRemoveFile, 
  isUploading 
}) => {
  if (files.length === 0) return null;

  // Handle file click to open/preview
  const handleFileClick = (file) => {
    try {
      let fileUrl;
      
      // Check if file is from Google Drive and has a direct URL
      if (file.source === 'googledrive' && file.driveUrl) {
        // For Google Drive files, open the Google Drive view URL
        fileUrl = file.driveUrl;
        window.open(fileUrl, '_blank', 'noopener,noreferrer');
        return;
      }
      
      // For local files or Google Drive files without direct URL, create blob URL
      if (file instanceof File || file instanceof Blob) {
        fileUrl = URL.createObjectURL(file);
        
        // Handle different file types
        const fileType = (file.type || file.mimeType || '').toLowerCase();
        const fileName = (file.name || '').toLowerCase();
        
        if (fileType.includes('pdf') || fileName.endsWith('.pdf')) {
          // Open PDFs directly in browser
          window.open(fileUrl, '_blank', 'noopener,noreferrer');
        } else if (fileType.includes('image') || 
                   fileName.match(/\.(jpg|jpeg|png|gif|bmp|webp)$/)) {
          // Open images directly in browser
          window.open(fileUrl, '_blank', 'noopener,noreferrer');
        } else if (fileType.includes('text') || fileName.endsWith('.txt')) {
          // Open text files directly in browser
          window.open(fileUrl, '_blank', 'noopener,noreferrer');
        } else {
          // For other file types (DOCX, ZIP, etc.), trigger download
          const link = document.createElement('a');
          link.href = fileUrl;
          link.download = file.name;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          
          // Clean up the blob URL after download
          setTimeout(() => {
            URL.revokeObjectURL(fileUrl);
          }, 1000);
          return;
        }
        
        // Clean up blob URL after a delay (for viewable files)
        setTimeout(() => {
          URL.revokeObjectURL(fileUrl);
        }, 60000); // Clean up after 1 minute
      }
    } catch (error) {
      console.error('Error opening file:', error);
      alert('Unable to open file. Please try downloading it instead.');
    }
  };

  // Check if file can be previewed (vs downloaded)
  const canPreview = (file) => {
    const fileType = (file.type || file.mimeType || '').toLowerCase();
    const fileName = (file.name || '').toLowerCase();
    
    return fileType.includes('pdf') ||
           fileType.includes('image') ||
           fileType.includes('text') ||
           fileName.match(/\.(pdf|jpg|jpeg|png|gif|bmp|webp|txt)$/);
  };

  return (
    <div className="mt-6 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-900">
          Selected Files ({files.length})
        </h3>
        {!isUploading && (
          <button
            onClick={() => files.forEach(onRemoveFile)}
            className="text-sm text-gray-500 hover:text-red-600 transition-colors"
          >
            Clear all
          </button>
        )}
      </div>
      
      <div className="space-y-2 max-h-60 overflow-y-auto">
        {files.map((file, index) => {
          const progress = uploadProgress[file.name] || 0;
          const isComplete = progress === 100;
          const fileTypeColor = getFileTypeColor(file.name, file.type);
          const previewable = canPreview(file);
          
          return (
            <div
              key={`${file.name}-${index}`}
              className="bg-white border border-gray-200 rounded-lg p-4 animate-slide-up hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3 flex-1 min-w-0">
                  {/* File Icon */}
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg ${fileTypeColor}`}>
                    {getFileTypeIcon(file.name, file.type)}
                  </div>
                  
                  {/* File Info - Clickable */}
                  <div 
                    className="flex-1 min-w-0 cursor-pointer hover:bg-gray-50 p-2 rounded transition-colors"
                    onClick={() => handleFileClick(file)}
                    title={previewable ? "Click to preview" : "Click to download"}
                  >
                    <div className="flex items-center space-x-2">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {file.name}
                      </p>
                      {/* Preview/Download Icon */}
                      <div className="flex items-center space-x-1">
                        {previewable ? (
                          <FaEye className="text-xs text-blue-500" title="Click to preview" />
                        ) : (
                          <FaExternalLinkAlt className="text-xs text-gray-500" title="Click to download" />
                        )}
                        {/* Source Indicator */}
                        {file.source === 'googledrive' ? (
                          <FaGoogleDrive className="text-xs text-blue-500" title="From Google Drive" />
                        ) : (
                          <FaDesktop className="text-xs text-gray-500" title="From Computer" />
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-gray-500">
                      {formatFileSize(file.size)}
                      {previewable && (
                        <span className="ml-2 text-blue-500">• Click to preview</span>
                      )}
                    </p>
                  </div>
                </div>

                {/* Progress/Status */}
                <div className="flex items-center space-x-3">
                  {isUploading && (
                    <div className="flex items-center space-x-2">
                      {isComplete ? (
                        <div className="flex items-center space-x-1 text-success-600">
                          <FaCheck className="text-xs" />
                          <span className="text-xs font-medium">Complete</span>
                        </div>
                      ) : (
                        <div className="flex items-center space-x-2">
                          <div className="w-20 bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-primary-600 h-2 rounded-full transition-all duration-300"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                          <span className="text-xs font-medium text-gray-600 w-8">
                            {progress}%
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Remove Button */}
                  {!isUploading && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation(); // Prevent file click when removing
                        onRemoveFile(file);
                      }}
                      className="text-gray-400 hover:text-red-500 transition-colors p-1 hover:bg-red-50 rounded"
                      title="Remove file"
                    >
                      <FaTrash className="text-xs" />
                    </button>
                  )}
                </div>
              </div>

              {/* Overall Progress Bar for Active Upload */}
              {isUploading && !isComplete && (
                <div className="mt-3">
                  <div className="w-full bg-gray-200 rounded-full h-1">
                    <div
                      className="bg-gradient-to-r from-primary-500 to-primary-600 h-1 rounded-full transition-all duration-500 animate-pulse-soft"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default FileUploadList;