import React from 'react';
import { FaTrash, FaCheck, FaGoogleDrive, FaDesktop } from 'react-icons/fa';
import { formatFileSize, getFileTypeIcon, getFileTypeColor } from '../utils/fileUtils';

const FileUploadList = ({ 
  files, 
  uploadProgress, 
  onRemoveFile, 
  isUploading 
}) => {
  if (files.length === 0) return null;

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
          
          return (
            <div
              key={`${file.name}-${index}`}
              className="bg-white border border-gray-200 rounded-lg p-4 animate-slide-up"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3 flex-1 min-w-0">
                  {/* File Icon */}
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg ${fileTypeColor}`}>
                    {getFileTypeIcon(file.name, file.type)}
                  </div>
                  
                  {/* File Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {file.name}
                      </p>
                      {/* Source Indicator */}
                      <div className="flex items-center space-x-1">
                        {file.source === 'googledrive' ? (
                          <FaGoogleDrive className="text-xs text-blue-500" title="From Google Drive" />
                        ) : (
                          <FaDesktop className="text-xs text-gray-500" title="From Computer" />
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-gray-500">
                      {formatFileSize(file.size)}
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
                      onClick={() => onRemoveFile(file)}
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