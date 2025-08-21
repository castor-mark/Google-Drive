class GoogleDriveService {
  constructor() {
    this.API_KEY = process.env.REACT_APP_GOOGLE_API_KEY;
    this.DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';
    this.isInitialized = false;
    this.accessToken = null;
    this.tokenExpiry = null;
    
    // Validate environment variables
    if (!this.API_KEY) {
      console.error('Missing Google Drive API key in environment variables');
      throw new Error('Google Drive API key not configured');
    }
  }


  // Check if we have a current token (server session based)
  isTokenValid() {
    return this.accessToken !== null;
  }

  // Load Google Identity Services
  async loadGoogleIdentity() {
    return new Promise((resolve, reject) => {
      if (window.google && window.google.accounts) {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      
      script.onload = () => {
        console.log('Google Identity Services loaded');
        resolve();
      };
      
      script.onerror = () => {
        reject(new Error('Failed to load Google Identity Services'));
      };
      
      document.head.appendChild(script);
    });
  }

  // Load Google API Client
  async loadGoogleAPI() {
    return new Promise((resolve, reject) => {
      if (window.gapi) {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://apis.google.com/js/api.js';
      script.async = true;
      script.defer = true;
      
      script.onload = () => {
        console.log('Google API loaded');
        resolve();
      };
      
      script.onerror = () => {
        reject(new Error('Failed to load Google API'));
      };
      
      document.head.appendChild(script);
    });
  }

  // Initialize services
  async initialize() {
    if (this.isInitialized) {
      // Double check that everything is still available
      if (window.google && window.google.accounts && window.gapi && window.google.picker) {
        return true;
      } else {
        // Reset initialization flag if APIs are missing
        this.isInitialized = false;
        console.log('APIs missing after page refresh, re-initializing...');
      }
    }

    try {
      console.log('Initializing Google services...');

      // Load Google Identity Services
      await this.loadGoogleIdentity();
      
      // Wait for google.accounts to be available
      let attempts = 0;
      while ((!window.google || !window.google.accounts) && attempts < 50) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }

      if (!window.google || !window.google.accounts) {
        throw new Error('Google Identity Services not available');
      }

      // Load Google API
      await this.loadGoogleAPI();
      
      // Wait for gapi
      attempts = 0;
      while (!window.gapi && attempts < 50) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }

      if (!window.gapi) {
        throw new Error('Google API not available');
      }

      // Load gapi client and picker - this is crucial for picker functionality
      await new Promise((resolve, reject) => {
        window.gapi.load('client:picker', {
          callback: () => {
            console.log('GAPI client and picker loaded successfully');
            resolve();
          },
          onerror: (error) => {
            console.error('Error loading GAPI client and picker:', error);
            reject(error);
          }
        });
      });

      // Wait for picker to be available
      attempts = 0;
      while ((!window.google || !window.google.picker) && attempts < 50) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }

      if (!window.google || !window.google.picker) {
        throw new Error('Google Picker not available after loading');
      }

      // Initialize gapi client
      await window.gapi.client.init({
        apiKey: this.API_KEY,
        discoveryDocs: [this.DISCOVERY_DOC]
      });

      this.isInitialized = true;
      console.log('Google services initialized successfully');
      
      // If we have a valid stored token, set it in gapi
      if (this.isTokenValid()) {
        window.gapi.client.setToken({
          access_token: this.accessToken
        });
        console.log('Restored token to gapi client');
      }
      
      return true;

    } catch (error) {
      console.error('Error initializing Google services:', error);
      this.isInitialized = false;
      throw new Error(`Failed to initialize: ${error.message}`);
    }
  }

  // Get authentication from server session (SSO-based)
  async authenticate(forceNew = false) {
    try {
      console.log('Getting authentication from server session...');
      await this.initialize();

      // Check if user has a valid server session with Google Drive access
      const response = await fetch(`${process.env.REACT_APP_API_URL}/api/auth/session`, {
        credentials: 'include'
      });

      if (response.ok) {
        const sessionData = await response.json();
        if (sessionData.authenticated) {
          console.log('User has valid session, getting Drive token from server...');
          
          // Get a temporary token for Google Drive picker from the server
          const tokenResponse = await fetch(`${process.env.REACT_APP_API_URL}/api/auth/drive-token`, {
            method: 'POST',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json'
            }
          });

          if (tokenResponse.ok) {
            const tokenData = await tokenResponse.json();
            if (tokenData.success) {
              // Use the server-provided token for the picker
              this.accessToken = tokenData.accessToken;
              this.tokenExpiry = new Date(Date.now() + (3600 * 1000)); // 1 hour default
              
              window.gapi.client.setToken({
                access_token: this.accessToken
              });

              console.log('Successfully got Drive token from server session');
              return { access_token: this.accessToken };
            }
          }
        }
      }

      // If no valid session, user needs to login to the system first
      throw new Error('Please log in to the system first to access Google Drive');

    } catch (error) {
      console.error('Authentication error:', error);
      throw error;
    }
  }


  // Open Google Drive Picker
  async openFilePicker(onProgress = null) {
    try {
      console.log('Opening file picker...');

      // Always ensure initialization before opening picker
      await this.initialize();

      // Ensure we have a valid token
      if (!this.isTokenValid()) {
        console.log('No valid token, getting from server session...');
        await this.authenticate();
      }

      // Double-check that picker is available
      if (!window.google || !window.google.picker) {
        console.error('Google Picker still not available after initialization');
        throw new Error('Google Picker not available. Please refresh the page and try again.');
      }

      return new Promise((resolve, reject) => {
        try {
          console.log('Creating picker with token:', this.accessToken);

          const picker = new window.google.picker.PickerBuilder()
            .enableFeature(window.google.picker.Feature.MULTISELECT_ENABLED)
            .setOAuthToken(this.accessToken)
            
            // My Drive tab
            .addView(new window.google.picker.DocsView(window.google.picker.ViewId.DOCS)
              .setIncludeFolders(true)
              .setSelectFolderEnabled(false)
              .setLabel('My Drive'))
            
            // Shared with me tab
            .addView(new window.google.picker.DocsView()
              .setIncludeFolders(true)
              .setSelectFolderEnabled(false)
              .setOwnedByMe(false)
              .setLabel('Shared with me'))
            
            // Shared Drives tab
            .addView(new window.google.picker.DocsView(window.google.picker.ViewId.DOCS)
              .setEnableTeamDrives(true)
              .setIncludeFolders(true)
              .setSelectFolderEnabled(false)
              .setLabel('Shared Drives'))
            
            // Recent tab
            .addView(new window.google.picker.DocsView(window.google.picker.ViewId.RECENTLY_PICKED)
              .setLabel('Recent'))
            
            .setDeveloperKey(this.API_KEY)
            .setCallback((data) => {
              console.log('Picker callback:', data);
              
              if (data.action === window.google.picker.Action.PICKED) {
                console.log('Files selected:', data.docs);
                this.processSelectedFiles(data.docs, resolve, reject, onProgress);
              } else if (data.action === window.google.picker.Action.CANCEL) {
                console.log('Picker cancelled');
                resolve([]);
              }
            })
            .setTitle('Select files from Google Drive')
            .setSize(1051, 650)
            .build();

          console.log('Showing picker...');
          picker.setVisible(true);

        } catch (error) {
          console.error('Error creating picker:', error);
          
          // If error might be due to invalid token or missing APIs, try full re-initialization
          if (error.message.includes('token') || 
              error.message.includes('auth') || 
              error.message.includes('picker') ||
              error.message.includes('google')) {
            
            console.log('Picker creation failed, attempting full re-initialization...');
            this.isInitialized = false;
            this.accessToken = null;
            this.tokenExpiry = null;
            
            // Try full re-initialization and authentication
            this.initialize()
              .then(() => this.authenticate(true))
              .then(() => {
                // Retry picker creation after re-initialization
                return this.openFilePicker();
              })
              .then(resolve)
              .catch((reinitError) => {
                console.error('Re-initialization failed:', reinitError);
                reject(new Error('Failed to initialize Google Drive. Please refresh the page and try again.'));
              });
          } else {
            reject(error);
          }
        }
      });

    } catch (error) {
      console.error('Error opening file picker:', error);
      throw error;
    }
  }

  // Process selected files and prepare metadata for server-side download
  async processSelectedFiles(docs, resolve, reject, onProgress = null) {
    try {
      const fileMetadata = [];
      const totalFiles = docs.length;

      for (let index = 0; index < docs.length; index++) {
        const doc = docs[index];
        console.log('Processing file metadata:', doc.name);

        try {
          // Notify progress callback if provided
          if (onProgress) {
            onProgress({
              current: index + 1,
              total: totalFiles,
              fileName: doc.name,
              status: 'processing'
            });
          }

          // Create metadata object for server-side processing
          const metadata = {
            id: doc.id,
            name: doc.name,
            mimeType: doc.mimeType,
            size: doc.sizeBytes,
            url: doc.url,
            source: 'googledrive',
            lastModified: new Date().getTime()
          };

          fileMetadata.push(metadata);
          console.log('File metadata processed:', doc.name);

          // Notify completion of this file
          if (onProgress) {
            onProgress({
              current: index + 1,
              total: totalFiles,
              fileName: doc.name,
              status: 'completed'
            });
          }

        } catch (error) {
          console.error(`Error processing file ${doc.name}:`, error);
          
          // Notify error for this file
          if (onProgress) {
            onProgress({
              current: index + 1,
              total: totalFiles,
              fileName: doc.name,
              status: 'error',
              error: error.message
            });
          }
        }
      }

      resolve(fileMetadata);

    } catch (error) {
      console.error('Error processing selected files:', error);
      reject(error);
    }
  }

  // Download file from Google Drive
  async downloadFile(fileId) {
    try {
      console.log('Downloading file:', fileId);

      const downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
      const response = await fetch(downloadUrl, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        }
      });

      if (!response.ok) {
        if (response.status === 401) {
          // Token expired or invalid
          this.clearStoredToken();
          throw new Error('Authentication expired. Please try again.');
        }
        throw new Error(`Download failed: ${response.status} ${response.statusText}`);
      }

      const blob = await response.blob();
      console.log('File downloaded successfully, size:', blob.size, 'bytes');
      
      return blob;

    } catch (error) {
      console.error('Error downloading file:', error);
      
      try {
        console.log('Trying gapi fallback...');
        const response = await window.gapi.client.request({
          path: `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
          method: 'GET'
        });

        if (response.body) {
          const uint8Array = new TextEncoder().encode(response.body);
          const blob = new Blob([uint8Array]);
          console.log('Fallback download successful');
          return blob;
        }

        throw new Error('No response body');
      } catch (fallbackError) {
        console.error('Fallback download also failed:', fallbackError);
        throw new Error('Unable to download file');
      }
    }
  }

  // Clear token (sign out handled by auth context)
  async signOut() {
    try {
      this.accessToken = null;
      this.tokenExpiry = null;
      console.log('Drive service token cleared');
    } catch (error) {
      console.error('Error clearing Drive token:', error);
    }
  }

  // Check if authenticated (has valid token)
  isAuthenticated() {
    return this.isTokenValid();
  }

  // Force re-authentication (useful for testing or when user explicitly wants to re-auth)
  async forceReauth() {
    this.accessToken = null;
    this.tokenExpiry = null;
    return await this.authenticate(true);
  }
}

// Export singleton
const googleDriveService = new GoogleDriveService();
export default googleDriveService;