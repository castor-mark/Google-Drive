const { google } = require('googleapis');

class TokenManager {
  constructor() {
    this.CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
    this.CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
    // Use server callback for SSO authentication
    const serverPort = process.env.PORT || '3005';
    this.REDIRECT_URI = `http://localhost:${serverPort}/api/auth/callback`;
    this.oauth2Client = null;
    this.tokenCache = new Map(); // In production, use Redis
  }

  // Initialize OAuth2 client
  initializeOAuth2Client() {
    if (!this.oauth2Client) {
      this.oauth2Client = new google.auth.OAuth2(
        this.CLIENT_ID,
        this.CLIENT_SECRET,
        this.REDIRECT_URI
      );
    }
    return this.oauth2Client;
  }

  // Generate authorization URL for initial auth
  generateAuthUrl() {
    const oauth2Client = this.initializeOAuth2Client();
    
    return oauth2Client.generateAuthUrl({
      access_type: 'offline', // This is key for refresh tokens
      scope: [
        'https://www.googleapis.com/auth/drive.file',
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile'
      ],
      prompt: 'consent' // Force consent screen to get refresh token
    });
  }

  // Exchange authorization code for tokens
  async exchangeCodeForTokens(authorizationCode) {
    try {
      const oauth2Client = this.initializeOAuth2Client();
      const { tokens } = await oauth2Client.getToken(authorizationCode);
      
      oauth2Client.setCredentials(tokens);
      
      // Cache the tokens
      const cacheKey = this.generateTokenCacheKey(tokens.access_token);
      this.tokenCache.set(cacheKey, {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiryDate: tokens.expiry_date,
        cached: new Date()
      });

      return {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresIn: tokens.expiry_date
      };
    } catch (error) {
      console.error('Error exchanging code for tokens:', error);
      throw new Error(`Token exchange failed: ${error.message}`);
    }
  }

  // Get a valid access token (refresh if needed)
  async getValidAccessToken(refreshToken, currentAccessToken = null) {
    try {
      // Check cache first
      if (currentAccessToken) {
        const cacheKey = this.generateTokenCacheKey(currentAccessToken);
        const cached = this.tokenCache.get(cacheKey);
        
        if (cached && cached.expiryDate > Date.now() + (5 * 60 * 1000)) {
          console.log('Using cached valid token');
          return cached.accessToken;
        }
      }

      // Refresh token if needed
      console.log('Refreshing access token...');
      const oauth2Client = this.initializeOAuth2Client();
      oauth2Client.setCredentials({ refresh_token: refreshToken });
      
      const { credentials } = await oauth2Client.refreshAccessToken();
      
      // Update cache
      const cacheKey = this.generateTokenCacheKey(credentials.access_token);
      this.tokenCache.set(cacheKey, {
        accessToken: credentials.access_token,
        refreshToken: refreshToken, // Refresh token usually doesn't change
        expiryDate: credentials.expiry_date,
        cached: new Date()
      });

      console.log('Access token refreshed successfully');
      return credentials.access_token;
      
    } catch (error) {
      console.error('Error refreshing access token:', error);
      throw new Error(`Token refresh failed: ${error.message}`);
    }
  }

  // Validate a token by making a test API call
  async validateToken(accessToken) {
    try {
      const oauth2Client = this.initializeOAuth2Client();
      oauth2Client.setCredentials({ access_token: accessToken });
      
      const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
      await oauth2.userinfo.get();
      
      return true;
    } catch (error) {
      console.error('Token validation failed:', error);
      return false;
    }
  }

  // Create Google Drive client with valid token
  async createDriveClient(accessToken, refreshToken) {
    try {
      // Get a valid access token (refresh if needed)
      const validToken = await this.getValidAccessToken(refreshToken, accessToken);
      
      const oauth2Client = this.initializeOAuth2Client();
      oauth2Client.setCredentials({ access_token: validToken });
      
      return google.drive({ version: 'v3', auth: oauth2Client });
      
    } catch (error) {
      console.error('Error creating Drive client:', error);
      throw error;
    }
  }

  // Utility: Generate cache key
  generateTokenCacheKey(accessToken) {
    return `token_${accessToken.substring(0, 10)}`;
  }

  // Clean up expired tokens from cache
  cleanupTokenCache() {
    const now = Date.now();
    for (const [key, value] of this.tokenCache.entries()) {
      if (value.expiryDate < now) {
        this.tokenCache.delete(key);
      }
    }
  }

  // Get user profile from Google
  async getUserProfile(accessToken) {
    try {
      const oauth2Client = this.initializeOAuth2Client();
      oauth2Client.setCredentials({ access_token: accessToken });
      
      const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
      const userInfo = await oauth2.userinfo.get();
      
      return userInfo.data;
    } catch (error) {
      console.error('Error getting user profile:', error);
      throw new Error(`Failed to get user profile: ${error.message}`);
    }
  }

  // Get cache statistics
  getCacheStats() {
    return {
      totalTokens: this.tokenCache.size,
      tokens: Array.from(this.tokenCache.entries()).map(([key, value]) => ({
        key,
        expiryDate: new Date(value.expiryDate),
        cached: value.cached
      }))
    };
  }
}

// Export singleton
module.exports = new TokenManager();