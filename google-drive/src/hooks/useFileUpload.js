import { useState, useCallback } from 'react';
import googleDriveService from '../services/GoogleDriveService';

export const useFileUpload = () => {
  const [files, setFiles] = useState([]);
  const [error, setError] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({});
  const [dragActive, setDragActive] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(null);

  // File validation
  const validateFiles = useCallback((newFiles) => {
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/zip',
      'text/plain',
      'image/jpeg',
      'image/png'
    ];

    const maxSize = 50 * 1024 * 1024; // 50MB

    for (const file of newFiles) {
      if (!allowedTypes.includes(file.type) && !file.name.toLowerCase().match(/\.(pdf|docx|zip|txt|jpg|jpeg|png)$/)) {
        return `File type not supported: ${file.name}`;
      }
      if (file.size > maxSize) {
        return `File too large: ${file.name} (max 50MB)`;
      }
    }

    // Check for ZIP file restrictions
    const hasZip = newFiles.some(file => 
      file.type === 'application/zip' || file.name.toLowerCase().endsWith('.zip')
    );
    
    if (hasZip && newFiles.length > 1) {
      return "You can only upload one ZIP file at a time.";
    }

    return null;
  }, []);

  // Add files (can be File objects or Google Drive metadata)
  const addFiles = useCallback((newFiles) => {
    setError(null);
    
    const filesArray = Array.from(newFiles);
    
    // Skip validation for Google Drive metadata (they're not File objects)
    const isGoogleDriveMetadata = filesArray.length > 0 && filesArray[0].source === 'googledrive';
    
    if (!isGoogleDriveMetadata) {
      const validationError = validateFiles(filesArray);
      
      if (validationError) {
        setError(validationError);
        return false;
      }

      // Check if adding ZIP with existing files
      const hasZip = filesArray.some(file => 
        file.type === 'application/zip' || file.name.toLowerCase().endsWith('.zip')
      );
      
      if (hasZip) {
        setFiles([filesArray.find(file => 
          file.type === 'application/zip' || file.name.toLowerCase().endsWith('.zip')
        )]);
      } else {
        setFiles(prev => [...prev, ...filesArray]);
      }
    } else {
      // For Google Drive metadata, just add them all
      setFiles(prev => [...prev, ...filesArray]);
    }

    return true;
  }, [validateFiles]);

  // Remove file
  const removeFile = useCallback((fileToRemove) => {
    if (isUploading) return;
    
    setFiles(prev => prev.filter(file => file !== fileToRemove));
    setUploadProgress(prev => {
      const newProgress = { ...prev };
      delete newProgress[fileToRemove.name];
      return newProgress;
    });
  }, [isUploading]);

  // Handle Google Drive selection
  const handleGoogleDriveSelection = useCallback(async () => {
    try {
      setError(null);
      setDownloadProgress(null);
      console.log('Opening Google Drive picker...');
      
      const onProgress = (progressData) => {
        setDownloadProgress(progressData);
      };
      
      const driveFiles = await googleDriveService.openFilePicker(onProgress);
      console.log('Selected files:', driveFiles);
      
      if (driveFiles && driveFiles.length > 0) {
        const success = addFiles(driveFiles);
        if (success) {
          console.log(`Added ${driveFiles.length} files from Google Drive`);
        }
      }
      
      // Clear download progress after completion
      setDownloadProgress(null);
    } catch (error) {
      console.error('Google Drive error:', error);
      setDownloadProgress(null);
      
      let errorMessage = "Failed to access Google Drive. Please try again.";
      
      // Provide more specific error messages
      if (error.message.includes('Picker not available')) {
        errorMessage = "Google Drive is not available. Please refresh the page and try again.";
      } else if (error.message.includes('Authentication')) {
        errorMessage = "Google Drive authentication failed. Please try again.";
      } else if (error.message.includes('initialize')) {
        errorMessage = "Failed to initialize Google Drive. Please refresh the page.";
      }
      
      setError(errorMessage);
    }
  }, [addFiles]);

  // Handle drag events
  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  }, [addFiles]);

  // Clear all files
  const clearFiles = useCallback(() => {
    if (isUploading) return;
    setFiles([]);
    setUploadProgress({});
    setError(null);
    setDownloadProgress(null);
  }, [isUploading]);

  // Reset state
  const reset = useCallback(() => {
    setFiles([]);
    setError(null);
    setIsUploading(false);
    setUploadProgress({});
    setDragActive(false);
    setDownloadProgress(null);
  }, []);

  return {
    files,
    error,
    isUploading,
    uploadProgress,
    dragActive,
    downloadProgress,
    addFiles,
    removeFile,
    handleGoogleDriveSelection,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    clearFiles,
    reset,
    setIsUploading,
    setUploadProgress,
    setError
  };
};