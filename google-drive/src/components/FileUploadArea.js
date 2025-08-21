import React, { useRef, useState } from 'react';
import { FaGoogleDrive, FaUpload, FaCloudUploadAlt, FaCheckCircle } from 'react-icons/fa';
import { useFileUpload } from '../hooks/useFileUpload';
import FileUploadList from './FileUploadList';
import AuthStatus from './AuthStatus';
import DownloadProgress from './DownloadProgress';

const FileUploadArea = () => {
  const inputRef = useRef(null);
  const [successMessage, setSuccessMessage] = useState(null);
  
  const {
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
    setIsUploading,
    setUploadProgress,
    setError
  } = useFileUpload();

  const handleFileInputChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(e.target.files);
      e.target.value = null; // Reset input
    }
  };

  // Updated handleUpload function for server-side processing
  const handleUpload = async () => {
    if (files.length === 0) return;

    setIsUploading(true);
    setError(null);
    
    try {
      // Separate local files from Google Drive metadata
      const localFiles = files.filter(file => file instanceof File && file.source !== 'googledrive');
      const googleDriveFiles = files.filter(file => file.source === 'googledrive');

      let result;

      if (googleDriveFiles.length > 0) {
        // Handle Google Drive files - send metadata to server
        const requestData = {
          googleDriveFiles: googleDriveFiles,
          localFiles: [], // We'll handle mixed uploads separately if needed
          description: 'Uploaded from React frontend',
          category: 'user_upload',
          uploadedBy: 'frontend_user'
        };

        const response = await fetch(`${process.env.REACT_APP_API_URL}/api/upload/google-drive`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include', // Include session cookies
          body: JSON.stringify(requestData)
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Server-side upload failed');
        }

        result = await response.json();
        
        // Start polling for progress
        if (result.jobId) {
          await pollUploadProgress(result.jobId);
          return;
        }
        
      } else {
        // Handle local files - traditional FormData upload
        const formData = new FormData();
        
        localFiles.forEach(file => {
          formData.append('files', file);
        });
        
        formData.append('description', 'Uploaded from React frontend');
        formData.append('category', 'user_upload');
        formData.append('uploadedBy', 'frontend_user');

        // Use XMLHttpRequest for progress tracking on local files
        const xhr = new XMLHttpRequest();
        
        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) {
            const progress = Math.round((event.loaded / event.total) * 100);
            const newProgress = {};
            localFiles.forEach(file => {
              newProgress[file.name] = progress;
            });
            setUploadProgress(newProgress);
          }
        });
        
        return new Promise((resolve, reject) => {
          xhr.addEventListener('load', () => {
            if (xhr.status === 200) {
              try {
                const result = JSON.parse(xhr.responseText);
                setSuccessMessage(`Successfully uploaded ${result.files.length} file(s)!`);
                
                setTimeout(() => {
                  setIsUploading(false);
                  clearFiles();
                  setTimeout(() => setSuccessMessage(null), 3000);
                }, 1000);
                
                resolve(result);
              } catch (error) {
                setError('Invalid response from server');
                setIsUploading(false);
                reject(error);
              }
            } else {
              try {
                const errorData = JSON.parse(xhr.responseText);
                setError(errorData.error || 'Upload failed');
              } catch {
                setError('Upload failed with status: ' + xhr.status);
              }
              setIsUploading(false);
              reject(new Error('Upload failed'));
            }
          });
          
          xhr.addEventListener('error', () => {
            setError(`Could not connect to server. Make sure the backend is running on ${process.env.REACT_APP_API_URL}`);
            setIsUploading(false);
            reject(new Error('Connection failed'));
          });
          
          xhr.open('POST', `${process.env.REACT_APP_API_URL}/api/upload`);
          xhr.send(formData);
        });
      }
      
    } catch (error) {
      console.error('Upload error:', error);
      setError(error.message || 'Upload failed. Please try again.');
      setIsUploading(false);
    }
  };

  // Poll server for upload progress
  const pollUploadProgress = async (jobId) => {
    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`${process.env.REACT_APP_API_URL}/api/upload/progress/${jobId}`);
        
        if (!response.ok) {
          throw new Error('Failed to get progress');
        }
        
        const progressData = await response.json();
        
        // Update progress
        const newProgress = {};
        if (progressData.currentFile) {
          newProgress[progressData.currentFile] = Math.round((progressData.completed / progressData.total) * 100);
        }
        setUploadProgress(newProgress);
        
        // Check if completed
        if (progressData.status === 'completed') {
          clearInterval(pollInterval);
          setSuccessMessage(`Successfully processed ${progressData.total} file(s) from Google Drive!`);
          
          setTimeout(() => {
            setIsUploading(false);
            clearFiles();
            setTimeout(() => setSuccessMessage(null), 3000);
          }, 1000);
          
        } else if (progressData.status === 'failed') {
          clearInterval(pollInterval);
          setError(progressData.error || 'Server-side processing failed');
          setIsUploading(false);
        }
        
      } catch (error) {
        console.error('Progress polling error:', error);
        clearInterval(pollInterval);
        setError('Failed to track upload progress');
        setIsUploading(false);
      }
    }, 2000); // Poll every 2 seconds
    
    // Stop polling after 30 minutes (for very large uploads)
    setTimeout(() => {
      clearInterval(pollInterval);
      if (isUploading) {
        setError('Upload timeout - processing may still continue on server');
        setIsUploading(false);
      }
    }, 30 * 60 * 1000);
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Main Upload Card */}
      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
        {/* Header */}
        <div className="px-8 py-6 bg-gradient-to-r from-primary-50 to-blue-50 border-b border-gray-100">
          <div className="flex items-center space-x-3">
            <FaCloudUploadAlt className="text-2xl text-primary-600" />
            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                Upload Your Files
              </h2>
              <p className="text-gray-600 mt-1">
                Upload from your computer or Google Drive
              </p>
            </div>
          </div>
        </div>

        {/* Upload Area */}
        <div className="p-8">
          {/* Auth Status */}
          <div className="mb-6">
            <AuthStatus />
          </div>

          <div
            className={`upload-zone ${dragActive ? 'upload-zone-active' : ''} p-12 text-center`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <div className="space-y-6">
              {/* Upload Icon */}
              <div className="flex justify-center">
                <div className={`w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300 ${
                  dragActive 
                    ? 'bg-primary-100 text-primary-600 scale-110' 
                    : 'bg-gray-100 text-gray-400'
                }`}>
                  <FaCloudUploadAlt className="text-3xl" />
                </div>
              </div>

              {/* Main Text */}
              <div className="space-y-2">
                <h3 className="text-xl font-semibold text-gray-900">
                  {dragActive ? 'Drop your files here' : 'Choose files or drag them here'}
                </h3>
                <p className="text-gray-500">
                  Support for PDF, DOCX, ZIP, images and text files - no size limit
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                {/* Local Upload Button */}
                <button
                  onClick={() => inputRef.current?.click()}
                  disabled={isUploading || downloadProgress}
                  className="btn-primary flex items-center space-x-2 min-w-[180px] justify-center"
                >
                  <FaUpload className="text-sm" />
                  <span>Browse Files</span>
                </button>

                {/* Google Drive Button */}
                <button
                  onClick={handleGoogleDriveSelection}
                  disabled={isUploading || downloadProgress}
                  className="btn-secondary flex items-center space-x-2 min-w-[180px] justify-center bg-blue-600 hover:bg-blue-700 text-white border-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {downloadProgress ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Downloading...</span>
                    </>
                  ) : (
                    <>
                      <FaGoogleDrive className="text-sm" />
                      <span>Google Drive</span>
                    </>
                  )}
                </button>
              </div>

              {/* Hidden File Input */}
              <input
                ref={inputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleFileInputChange}
                accept=".pdf,.docx,.zip,.txt,.jpg,.jpeg,.png,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/zip,text/plain,image/jpeg,image/png"
              />
            </div>
          </div>

          {/* Download Progress */}
          <DownloadProgress progress={downloadProgress} />

          {/* Success Message */}
          {successMessage && (
            <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center space-x-2">
                <FaCheckCircle className="text-green-600 text-lg" />
                <p className="text-green-700 text-sm font-medium">
                  {successMessage}
                </p>
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="mt-4 p-4 bg-error-50 border border-error-200 rounded-lg">
              <div className="flex items-center space-x-2">
                <div className="w-5 h-5 rounded-full bg-error-100 flex items-center justify-center">
                  <span className="text-error-600 text-sm">!</span>
                </div>
                <p className="text-error-700 text-sm font-medium">
                  {error}
                </p>
              </div>
            </div>
          )}

          {/* File List */}
          <FileUploadList
            files={files}
            uploadProgress={uploadProgress}
            onRemoveFile={removeFile}
            isUploading={isUploading}
          />

          {/* Upload Button */}
          {files.length > 0 && (
            <div className="mt-8 flex justify-center">
              <button
                onClick={handleUpload}
                disabled={isUploading || files.length === 0}
                className="btn-primary px-8 py-3 text-lg min-w-[200px] justify-center"
              >
                {isUploading ? (
                  <div className="flex items-center space-x-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Uploading...</span>
                  </div>
                ) : (
                  <div className="flex items-center space-x-2">
                    <FaUpload className="text-sm" />
                    <span>Upload {files.length} file{files.length > 1 ? 's' : ''}</span>
                  </div>
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid md:grid-cols-2 gap-6 mt-8">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center space-x-3 mb-4">
            <FaUpload className="text-primary-600 text-xl" />
            <h3 className="font-semibold text-gray-900">Local Upload</h3>
          </div>
          <p className="text-gray-600 text-sm">
            Select files directly from your computer. Supports drag and drop for easy uploading.
          </p>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center space-x-3 mb-4">
            <FaGoogleDrive className="text-blue-600 text-xl" />
            <h3 className="font-semibold text-gray-900">Google Drive</h3>
          </div>
          <p className="text-gray-600 text-sm">
            Access your files stored in Google Drive. Secure OAuth2 authentication required.
          </p>
        </div>
      </div>
    </div>
  );
};

export default FileUploadArea;