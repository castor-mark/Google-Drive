import React from 'react';
import { FaGoogleDrive, FaCheckCircle, FaExclamationTriangle, FaSpinner } from 'react-icons/fa';

const DownloadProgress = ({ progress }) => {
  if (!progress) return null;

  const { current, total, fileName, status, error } = progress;
  const percentage = Math.round((current / total) * 100);

  const getStatusIcon = () => {
    switch (status) {
      case 'downloading':
        return <FaSpinner className="animate-spin text-blue-500" />;
      case 'completed':
        return <FaCheckCircle className="text-green-500" />;
      case 'error':
        return <FaExclamationTriangle className="text-red-500" />;
      default:
        return <FaSpinner className="animate-spin text-blue-500" />;
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'processing':
        return `Processing Google Drive files...`;
      case 'downloading':
        return `Processing Google Drive files...`;
      case 'completed':
        return `Files processed successfully`;
      case 'error':
        return `Processing failed: ${error}`;
      default:
        return 'Processing...';
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'processing':
      case 'downloading':
        return 'border-blue-200 bg-blue-50';
      case 'completed':
        return 'border-green-200 bg-green-50';
      case 'error':
        return 'border-red-200 bg-red-50';
      default:
        return 'border-gray-200 bg-gray-50';
    }
  };

  return (
    <div className={`mt-4 p-4 rounded-lg border ${getStatusColor()}`}>
      <div className="flex items-center space-x-3">
        <FaGoogleDrive className="text-blue-600 text-lg" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-2">
              {getStatusIcon()}
              <span className="text-sm font-medium text-gray-900">
                {getStatusText()}
              </span>
            </div>
            <span className="text-sm text-gray-500">
              {current} of {total}
            </span>
          </div>
          
          <div className="mb-2">
            <div className="flex justify-between text-xs text-gray-600 mb-1">
              <span className="truncate max-w-[200px]">{fileName}</span>
              <span>{percentage}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all duration-300 ${
                  status === 'error' 
                    ? 'bg-red-500' 
                    : status === 'completed'
                    ? 'bg-green-500'
                    : 'bg-blue-500'
                }`}
                style={{ width: `${percentage}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DownloadProgress;