import React, { useState, useEffect } from 'react';
import { FaGoogle, FaSpinner } from 'react-icons/fa';

const LoginPage = ({ onLoginSuccess }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Check if user is already logged in on component mount
  useEffect(() => {
    checkExistingSession();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const checkExistingSession = async () => {
    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL}/api/auth/session`, {
        credentials: 'include' // Include cookies for session
      });
      
      if (response.ok) {
        const sessionData = await response.json();
        if (sessionData.authenticated) {
          onLoginSuccess(sessionData.user);
        }
      }
    } catch (error) {
      console.log('No existing session found');
    }
  };

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Get the OAuth URL from server
      const response = await fetch(`${process.env.REACT_APP_API_URL}/api/auth/login/google`);
      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to initiate login');
      }

      // Open OAuth popup
      const popup = window.open(
        data.authUrl,
        'google_login',
        'width=600,height=600,scrollbars=yes,resizable=yes'
      );

      if (!popup) {
        throw new Error('Popup blocked. Please allow popups for this site.');
      }

      // Listen for popup completion
      const checkCompletion = setInterval(() => {
        try {
          if (popup.closed) {
            clearInterval(checkCompletion);
            setIsLoading(false);
            // Check if login was successful
            checkExistingSession();
          }
        } catch (error) {
          // Ignore cross-origin errors
        }
      }, 1000);

      // Declare timeout variable
      let loginTimeout;

      // Listen for messages from popup
      const messageHandler = (event) => {
        if (event.origin !== window.location.origin.replace(':3000', ':3005')) {
          return; // Only accept messages from our server
        }

        if (event.data.type === 'LOGIN_SUCCESS') {
          clearInterval(checkCompletion);
          clearTimeout(loginTimeout);
          window.removeEventListener('message', messageHandler);
          
          setIsLoading(false);
          onLoginSuccess(event.data.user);
          
          // Close popup if still open
          if (popup && !popup.closed) {
            popup.close();
          }
        }
      };

      window.addEventListener('message', messageHandler);

      // Set timeout after handlers are defined
      loginTimeout = setTimeout(() => {
        if (!popup.closed) {
          popup.close();
          clearInterval(checkCompletion);
          window.removeEventListener('message', messageHandler);
          setIsLoading(false);
          setError('Login timeout. Please try again.');
        }
      }, 300000); // 5 minutes

    } catch (error) {
      console.error('Login error:', error);
      setError(error.message);
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        {/* App Logo/Header */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            File Upload System
          </h1>
          <p className="text-sm text-gray-600">
            Sign in to your account
          </p>
        </div>

        {/* Login Card */}
        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
            
            {/* Error Message */}
            {error && (
              <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
                {error}
              </div>
            )}

            {/* Google Login Button */}
            <button
              onClick={handleGoogleLogin}
              disabled={isLoading}
              className={`
                w-full flex justify-center items-center py-3 px-4 border border-transparent 
                rounded-md shadow-sm text-sm font-medium text-white
                ${isLoading 
                  ? 'bg-gray-400 cursor-not-allowed' 
                  : 'bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500'
                }
                transition duration-150 ease-in-out
              `}
            >
              {isLoading ? (
                <>
                  <FaSpinner className="animate-spin mr-2" />
                  Signing in...
                </>
              ) : (
                <>
                  <FaGoogle className="mr-2" />
                  Continue with Google
                </>
              )}
            </button>

            {/* Subtitle */}
            <p className="mt-4 text-center text-sm text-gray-600">
              Access your Google Drive files seamlessly
            </p>

            {/* Permissions Info */}
            <div className="mt-6 text-xs text-gray-500 text-center">
              <p>By signing in, you grant access to:</p>
              <ul className="mt-1 space-y-1">
                <li>• Your basic profile information</li>
                <li>• Selected Google Drive files</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;