class GoogleDriveService {
  constructor() {
    this.CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID;
    this.API_KEY = process.env.REACT_APP_GOOGLE_API_KEY;
    this.DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';
    this.SCOPES = 'https://www.googleapis.com/auth/drive.readonly';
    this.isInitialized = false;
    this.accessToken = null;
    this.tokenExpiry = null;
    
    // Storage keys
    this.STORAGE_KEY = 'google_drive_token';
    this.EXPIRY_KEY = 'google_drive_token_expiry';
    
    // Load token from storage on initialization
    this.loadTokenFromStorage();
    
    // Validate environment variables
    if (!this.CLIENT_ID || !this.API_KEY) {
      console.error('Missing Google Drive API credentials in environment variables');
      throw new Error('Google Drive API credentials not configured');
    }
  }

  // Load token from localStorage
  loadTokenFromStorage() {
    try {
      const storedToken = localStorage.getItem(this.STORAGE_KEY);
      const storedExpiry = localStorage.getItem(this.EXPIRY_KEY);
      
      if (storedToken && storedExpiry) {
        const expiryTime = new Date(storedExpiry);
        const now = new Date();
        
        // Check if token is still valid (with 5 minute buffer)
        if (expiryTime > new Date(now.getTime() + 5 * 60 * 1000)) {
          this.accessToken = storedToken;
          this.tokenExpiry = expiryTime;
          console.log('Loaded valid token from storage, expires at:', expiryTime);
          return true;
        } else {
          console.log('Stored token has expired, clearing storage');
          this.clearStoredToken();
        }
      }
    } catch (error) {
      console.error('Error loading token from storage:', error);
      this.clearStoredToken();
    }
    return false;
  }

  // Save token to localStorage
  saveTokenToStorage(token, expiresIn) {
    try {
      // Calculate expiry time (expiresIn is in seconds)
      const expiryTime = new Date(Date.now() + (expiresIn * 1000));
      
      localStorage.setItem(this.STORAGE_KEY, token);
      localStorage.setItem(this.EXPIRY_KEY, expiryTime.toISOString());
      
      this.accessToken = token;
      this.tokenExpiry = expiryTime;
      
      console.log('Token saved to storage, expires at:', expiryTime);
    } catch (error) {
      console.error('Error saving token to storage:', error);
    }
  }

  // Clear stored token
  clearStoredToken() {
    try {
      localStorage.removeItem(this.STORAGE_KEY);
      localStorage.removeItem(this.EXPIRY_KEY);
      this.accessToken = null;
      this.tokenExpiry = null;
      console.log('Cleared stored token');
    } catch (error) {
      console.error('Error clearing stored token:', error);
    }
  }

  // Check if token is valid and not expired
  isTokenValid() {
    if (!this.accessToken || !this.tokenExpiry) {
      return false;
    }
    
    // Check if token expires in the next 5 minutes
    const now = new Date();
    const bufferTime = new Date(now.getTime() + 5 * 60 * 1000);
    
    return this.tokenExpiry > bufferTime;
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

  // Authenticate using Google Identity Services
  async authenticate(forceNew = false) {
    try {
      await this.initialize();

      // If we have a valid token and not forcing new auth, use it
      if (!forceNew && this.isTokenValid()) {
        console.log('Using existing valid token');
        window.gapi.client.setToken({
          access_token: this.accessToken
        });
        return { access_token: this.accessToken };
      }

      // Clear any existing invalid token
      if (!this.isTokenValid()) {
        this.clearStoredToken();
      }

      return new Promise((resolve, reject) => {
        console.log('Starting new authentication...');

        const client = window.google.accounts.oauth2.initTokenClient({
          client_id: this.CLIENT_ID,
          scope: this.SCOPES,
          callback: (response) => {
            if (response.error) {
              console.error('Authentication error:', response.error);
              reject(new Error(`Authentication failed: ${response.error}`));
              return;
            }

            console.log('Authentication successful!');
            
            // Save token to storage (expires_in is in seconds)
            const expiresIn = response.expires_in || 3600; // Default to 1 hour
            this.saveTokenToStorage(response.access_token, expiresIn);
            
            // Set the token for gapi client
            window.gapi.client.setToken({
              access_token: this.accessToken
            });

            resolve(response);
          },
          error_callback: (error) => {
            console.error('OAuth error:', error);
            reject(new Error(`OAuth error: ${error.type}`));
          }
        });

        client.requestAccessToken();
      });

    } catch (error) {
      console.error('Authentication initialization error:', error);
      throw error;
    }
  }

  // Open Google Drive Picker
  async openFilePicker() {
    try {
      console.log('Opening file picker...');

      // Always ensure initialization before opening picker
      await this.initialize();

      // Ensure we have a valid token
      if (!this.isTokenValid()) {
        console.log('No valid token, authenticating...');
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
                this.processSelectedFiles(data.docs, resolve, reject);
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
            this.clearStoredToken();
            
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

  // Process selected files and download them
  async processSelectedFiles(docs, resolve, reject) {
    try {
      const files = [];

      for (const doc of docs) {
        console.log('Processing file:', doc.name);

        try {
          const fileBlob = await this.downloadFile(doc.id);
          
          const file = new File([fileBlob], doc.name, {
            type: doc.mimeType,
            lastModified: new Date().getTime()
          });

          file.driveId = doc.id;
          file.driveUrl = doc.url;
          file.source = 'googledrive';

          files.push(file);
          console.log('File processed successfully:', doc.name);

        } catch (error) {
          console.error(`Error processing file ${doc.name}:`, error);
          
          // If it's an auth error, clear token and let user know
          if (error.message.includes('401') || error.message.includes('auth')) {
            this.clearStoredToken();
            throw new Error('Authentication expired. Please try again.');
          }
        }
      }

      resolve(files);

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

  // Sign out and clear stored token
  async signOut() {
    try {
      if (this.accessToken && window.google && window.google.accounts) {
        window.google.accounts.oauth2.revoke(this.accessToken);
      }
      this.clearStoredToken();
      console.log('Signed out successfully');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  }

  // Check if authenticated (has valid token)
  isAuthenticated() {
    return this.isTokenValid();
  }

  // Force re-authentication (useful for testing or when user explicitly wants to re-auth)
  async forceReauth() {
    this.clearStoredToken();
    return await this.authenticate(true);
  }

  // Get token expiry time for UI display
  getTokenExpiry() {
    return this.tokenExpiry;
  }
}

// Export singleton
const googleDriveService = new GoogleDriveService();
export default googleDriveService;