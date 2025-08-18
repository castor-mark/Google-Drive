import React from 'react';
import { FaGoogleDrive, FaUpload } from 'react-icons/fa';

const Header = () => {
  return (
    <header className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2">
              <FaUpload className="text-primary-600 text-xl" />
              <h1 className="text-xl font-bold text-gray-900">
                File Uploader
              </h1>
            </div>
            <div className="hidden sm:flex items-center space-x-2 text-sm text-gray-500">
              <span>•</span>
              <FaGoogleDrive className="text-sm" />
              <span>Google Drive Integration</span>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            <div className="text-sm text-gray-500">
              Showcase Demo
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;