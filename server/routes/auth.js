const express = require('express');
const router = express.Router();
const tokenManager = require('../services/TokenManager');
const session = require('express-session');
const MongoStore = require('connect-mongo');

// GET /api/auth/login/google - Start SSO login flow
router.get('/login/google', (req, res) => {
  try {
    const authUrl = tokenManager.generateAuthUrl();
    res.json({
      success: true,
      authUrl
    });
  } catch (error) {
    console.error('Error generating auth URL:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate authentication URL'
    });
  }
});

// GET /api/auth/google - Legacy endpoint (keep for compatibility)
router.get('/google', (req, res) => {
  try {
    const authUrl = tokenManager.generateAuthUrl();
    res.json({
      success: true,
      authUrl
    });
  } catch (error) {
    console.error('Error generating auth URL:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate authentication URL'
    });
  }
});

// GET /api/auth/callback - Handle OAuth callback and create session
router.get('/callback', async (req, res) => {
  try {
    const { code, error } = req.query;
    
    if (error) {
      return res.status(400).json({
        success: false,
        error: `OAuth error: ${error}`
      });
    }
    
    if (!code) {
      return res.status(400).json({
        success: false,
        error: 'Authorization code not provided'
      });
    }

    // Exchange code for tokens
    const tokens = await tokenManager.exchangeCodeForTokens(code);
    
    // Get user profile information
    const userProfile = await tokenManager.getUserProfile(tokens.accessToken);
    
    // Store tokens and user info in session
    req.session.authenticated = true;
    req.session.user = {
      id: userProfile.id,
      email: userProfile.email,
      name: userProfile.name,
      picture: userProfile.picture
    };
    req.session.googleTokens = {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
      createdAt: new Date()
    };

    console.log(`User ${userProfile.email} authenticated successfully`);

    // Redirect to close popup and notify parent window
    res.send(`
      <html>
        <head>
          <title>Login Successful</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 2rem; background: #f5f5f5; }
            .success { color: #137333; }
            .manual-close { margin-top: 1rem; color: #666; font-size: 0.9em; }
          </style>
        </head>
        <body>
          <h3 class="success">✅ Login successful!</h3>
          <p id="status">Closing window...</p>
          <p class="manual-close">If this window doesn't close automatically, you can close it manually.</p>
          
          <script>
            console.log('Callback page loaded');
            
            function closeWindow() {
              try {
                console.log('Attempting to close window');
                window.close();
                
                // If window.close() doesn't work immediately, try alternatives
                setTimeout(() => {
                  if (!window.closed) {
                    console.log('Window still open, trying alternative methods');
                    window.opener = null;
                    window.open('', '_self');
                    window.close();
                  }
                }, 500);
                
              } catch (error) {
                console.error('Error closing window:', error);
                document.getElementById('status').innerHTML = 'Please close this window manually.';
              }
            }
            
            function notifyParent() {
              try {
                console.log('Notifying parent window');
                const user = ${JSON.stringify(req.session.user)};
                
                if (window.opener && !window.opener.closed) {
                  window.opener.postMessage({
                    type: 'LOGIN_SUCCESS',
                    user: user
                  }, '${process.env.CLIENT_URL || 'http://localhost:3000'}');
                  console.log('Message sent to parent window');
                } else {
                  console.log('No valid opener window found');
                }
              } catch (error) {
                console.error('Error notifying parent:', error);
              }
            }
            
            // Execute the flow
            try {
              console.log('Starting callback flow');
              notifyParent();
              setTimeout(closeWindow, 1000); // Give parent time to process message
            } catch (error) {
              console.error('Callback flow error:', error);
              document.getElementById('status').innerHTML = 'Login completed. Please close this window.';
            }
          </script>
        </body>
      </html>
    `);

  } catch (error) {
    console.error('OAuth callback error:', error);
    res.status(500).json({
      success: false,
      error: 'Authentication failed'
    });
  }
});

// POST /api/auth/refresh - Refresh access token
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken, accessToken } = req.body;
    
    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        error: 'Refresh token is required'
      });
    }

    const newAccessToken = await tokenManager.getValidAccessToken(refreshToken, accessToken);
    
    res.json({
      success: true,
      accessToken: newAccessToken
    });

  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to refresh token'
    });
  }
});

// GET /api/auth/validate - Validate current token
router.post('/validate', async (req, res) => {
  try {
    const { accessToken } = req.body;
    
    if (!accessToken) {
      return res.status(400).json({
        success: false,
        error: 'Access token is required'
      });
    }

    const isValid = await tokenManager.validateToken(accessToken);
    
    res.json({
      success: true,
      isValid
    });

  } catch (error) {
    console.error('Token validation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to validate token'
    });
  }
});

// GET /api/auth/session - Check current session
router.get('/session', (req, res) => {
  if (req.session.authenticated) {
    res.json({
      authenticated: true,
      user: req.session.user
    });
  } else {
    res.json({
      authenticated: false
    });
  }
});

// GET /api/auth/status - Check authentication status with token expiry
router.get('/status', (req, res) => {
  if (req.session.authenticated && req.session.googleTokens) {
    const tokens = req.session.googleTokens;
    const now = new Date();
    const tokenAge = now - new Date(tokens.createdAt);
    const expiryTime = new Date(new Date(tokens.createdAt).getTime() + (tokens.expiresIn * 1000));
    const isExpired = tokenAge > (tokens.expiresIn * 1000);

    res.json({
      authenticated: true,
      user: req.session.user,
      tokenExpiry: expiryTime.toISOString(),
      isExpired: isExpired
    });
  } else {
    res.json({
      authenticated: false
    });
  }
});

// POST /api/auth/drive-token - Get Drive token from user session
router.post('/drive-token', async (req, res) => {
  try {
    if (!req.session.authenticated || !req.session.googleTokens) {
      return res.status(401).json({
        success: false,
        error: 'Not authenticated or no Google Drive access'
      });
    }

    const tokens = req.session.googleTokens;
    
    // Check if access token is still valid
    const now = new Date();
    const tokenAge = now - new Date(tokens.createdAt);
    const tokenExpired = tokenAge > (tokens.expiresIn * 1000);

    let accessToken = tokens.accessToken;

    // Refresh token if expired
    if (tokenExpired && tokens.refreshToken) {
      try {
        console.log('Refreshing expired session token');
        const newAccessToken = await tokenManager.getValidAccessToken(
          tokens.refreshToken, 
          tokens.accessToken
        );
        
        // Update session with new token
        req.session.googleTokens.accessToken = newAccessToken;
        req.session.googleTokens.createdAt = new Date();
        
        accessToken = newAccessToken;
        console.log('Session token refreshed successfully');
        
      } catch (refreshError) {
        console.error('Failed to refresh session token:', refreshError);
        return res.status(401).json({
          success: false,
          error: 'Token expired and refresh failed. Please log in again.'
        });
      }
    }

    res.json({
      success: true,
      accessToken: accessToken
    });

  } catch (error) {
    console.error('Drive token error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get Drive token'
    });
  }
});

// POST /api/auth/logout - Logout user
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Session destroy error:', err);
      return res.status(500).json({
        success: false,
        error: 'Logout failed'
      });
    }
    
    res.clearCookie('connect.sid'); // Clear session cookie
    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  });
});

module.exports = router;