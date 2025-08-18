import React, { useState, useEffect } from 'react';
import { FaGoogleDrive, FaCheck, FaExclamationTriangle, FaSignOutAlt, FaRedo } from 'react-icons/fa';
import googleDriveService from '../services/GoogleDriveService';

const AuthStatus = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [tokenExpiry, setTokenExpiry] = useState(null);
  const [timeRemaining, setTimeRemaining] = useState('');
  const [isRetrying, setIsRetrying] = useState(false);

  useEffect(() => {
    checkAuthStatus();
    
    // Check auth status every minute
    const interval = setInterval(checkAuthStatus, 60000);
    
    return () => clearInterval(interval);
  }, []);

  const checkAuthStatus = () => {
    const authenticated = googleDriveService.isAuthenticated();
    const expiry = googleDriveService.getTokenExpiry();
    
    setIsAuthenticated(authenticated);
    setTokenExpiry(expiry);
    
    if (expiry) {
      updateTimeRemaining(expiry);
    }
  };

  const updateTimeRemaining = (expiry) => {
    const now = new Date();
    const timeDiff = expiry - now;
    
    if (timeDiff <= 0) {
      setTimeRemaining('Expired');
      setIsAuthenticated(false);
      return;
    }

    const hours = Math.floor(timeDiff / (1000 * 60 * 60));
    const minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) {
      setTimeRemaining(`${hours}h ${minutes}m`);
    } else {
      setTimeRemaining(`${minutes}m`);
    }
  };

  const handleSignOut = async () => {
    try {
      await googleDriveService.signOut();
      checkAuthStatus();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const handleReauth = async () => {
    try {
      setIsRetrying(true);
      await googleDriveService.forceReauth();
      checkAuthStatus();
    } catch (error) {
      console.error('Error re-authenticating:', error);
    } finally {
      setIsRetrying(false);
    }
  };

  const handleInitialize = async () => {
    try {
      setIsRetrying(true);
      // Force re-initialization
      googleDriveService.isInitialized = false;
      await googleDriveService.initialize();
      checkAuthStatus();
    } catch (error) {
      console.error('Error initializing:', error);
    } finally {
      setIsRetrying(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <FaExclamationTriangle className="text-yellow-600 text-sm" />
            <span className="text-yellow-800 text-sm">
              Google Drive: Not authenticated
            </span>
          </div>
          <button
            onClick={handleInitialize}
            disabled={isRetrying}
            className="text-blue-600 hover:text-blue-700 text-xs underline disabled:opacity-50 flex items-center space-x-1"
            title="Initialize Google Drive"
          >
            {isRetrying ? (
              <div className="w-3 h-3 border border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <FaRedo className="text-xs" />
            )}
            <span>{isRetrying ? 'Initializing...' : 'Initialize'}</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-green-50 border border-green-200 rounded-lg p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <FaCheck className="text-green-600 text-sm" />
          <FaGoogleDrive className="text-blue-600 text-sm" />
          <span className="text-green-800 text-sm">
            Google Drive: Connected
          </span>
          {timeRemaining && (
            <span className="text-green-600 text-xs">
              ({timeRemaining} remaining)
            </span>
          )}
        </div>
        
        <div className="flex items-center space-x-2">
          <button
            onClick={handleReauth}
            disabled={isRetrying}
            className="text-blue-600 hover:text-blue-700 text-xs underline disabled:opacity-50 flex items-center space-x-1"
            title="Refresh authentication"
          >
            {isRetrying ? (
              <div className="w-3 h-3 border border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <FaRedo className="text-xs" />
            )}
            <span>{isRetrying ? 'Refreshing...' : 'Refresh'}</span>
          </button>
          <button
            onClick={handleSignOut}
            className="text-red-600 hover:text-red-700 text-xs"
            title="Sign out"
          >
            <FaSignOutAlt />
          </button>
        </div>
      </div>
    </div>
  );
};

export default AuthStatus;