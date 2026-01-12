import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { encrypt, decrypt, encryptTokens, decryptTokens } from './utils/crypto.js';

const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID");
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET");
const GOOGLE_REDIRECT_URI = Deno.env.get("GOOGLE_REDIRECT_URI");

const DROPBOX_APP_KEY = Deno.env.get("DROPBOX_APP_KEY");
const DROPBOX_APP_SECRET = Deno.env.get("DROPBOX_APP_SECRET");
const DROPBOX_REDIRECT_URI = Deno.env.get("DROPBOX_REDIRECT_URI");

// Google OAuth Scopes
const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');

// Dropbox OAuth Scopes
const DROPBOX_SCOPES = [
  'files.content.write',
  'files.content.read',
  'sharing.write',
  'account_info.read',
].join(' ');

/**
 * Generate OAuth authorization URL
 */
function getAuthUrl(provider, userId) {
  if (provider === 'google') {
    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: GOOGLE_REDIRECT_URI,
      response_type: 'code',
      scope: GOOGLE_SCOPES,
      access_type: 'offline',
      prompt: 'consent',
      state: JSON.stringify({ provider: 'google', userId }),
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }
  
  if (provider === 'dropbox') {
    const params = new URLSearchParams({
      client_id: DROPBOX_APP_KEY,
      redirect_uri: DROPBOX_REDIRECT_URI,
      response_type: 'code',
      token_access_type: 'offline',
      state: JSON.stringify({ provider: 'dropbox', userId }),
    });
    return `https://www.dropbox.com/oauth2/authorize?${params.toString()}`;
  }
  
  throw new Error('Unsupported provider');
}

/**
 * Exchange authorization code for tokens
 */
async function exchangeCodeForTokens(provider, code) {
  if (provider === 'google') {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: GOOGLE_REDIRECT_URI,
        grant_type: 'authorization_code',
      }).toString(),
    });
    
    const data = await response.json();
    if (data.error) throw new Error(data.error_description || data.error);
    return data;
  }
  
  if (provider === 'dropbox') {
    const response = await fetch('https://api.dropboxapi.com/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: DROPBOX_APP_KEY,
        client_secret: DROPBOX_APP_SECRET,
        redirect_uri: DROPBOX_REDIRECT_URI,
        grant_type: 'authorization_code',
      }).toString(),
    });
    
    const data = await response.json();
    if (data.error) throw new Error(data.error_description || data.error);
    return data;
  }
  
  throw new Error('Unsupported provider');
}

/**
 * Get user info from provider
 */
async function getUserInfo(provider, accessToken) {
  if (provider === 'google') {
    const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await response.json();
    return { email: data.email, display_name: data.name };
  }
  
  if (provider === 'dropbox') {
    const response = await fetch('https://api.dropboxapi.com/2/users/get_current_account', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await response.json();
    return { 
      email: data.email, 
      display_name: data.name?.display_name,
      account_id: data.account_id 
    };
  }
  
  return {};
}

/**
 * Refresh an expired token
 */
async function refreshAccessToken(provider, refreshToken) {
  if (provider === 'google') {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        grant_type: 'refresh_token',
      }).toString(),
    });
    
    const data = await response.json();
    if (data.error) throw new Error(data.error_description || data.error);
    return data;
  }
  
  if (provider === 'dropbox') {
    const response = await fetch('https://api.dropboxapi.com/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: DROPBOX_APP_KEY,
        client_secret: DROPBOX_APP_SECRET,
        grant_type: 'refresh_token',
      }).toString(),
    });
    
    const data = await response.json();
    if (data.error) throw new Error(data.error_description || data.error);
    return data;
  }
  
  throw new Error('Unsupported provider');
}

/**
 * Get a valid (non-expired) access token for a user
 */
export async function getValidToken(base44, userId, provider) {
  const connections = await base44.asServiceRole.entities.IntegrationConnection.filter({ 
    user_id: userId, 
    provider,
    is_active: true 
  });
  
  if (connections.length === 0) {
    throw new Error(`No active ${provider} connection found for user`);
  }
  
  const connection = connections[0];
  const now = Date.now();
  const bufferTime = 5 * 60 * 1000; // 5 minutes buffer
  
  // Decrypt current tokens
  const { access_token, refresh_token } = await decryptTokens({
    access_token_encrypted: connection.access_token_encrypted,
    refresh_token_encrypted: connection.refresh_token_encrypted,
  });
  
  // Check if token is still valid
  if (connection.expires_at > now + bufferTime) {
    // Update last_used_at
    await base44.asServiceRole.entities.IntegrationConnection.update(connection.id, {
      last_used_at: new Date().toISOString()
    });
    return access_token;
  }
  
  // Token expired, need to refresh
  if (!refresh_token) {
    throw new Error(`${provider} token expired and no refresh token available`);
  }
  
  console.log(`Refreshing ${provider} token for user ${userId}...`);
  
  const newTokens = await refreshAccessToken(provider, refresh_token);
  const encrypted = await encryptTokens({
    access_token: newTokens.access_token,
    refresh_token: newTokens.refresh_token || refresh_token,
  });
  
  const newExpiresAt = now + (newTokens.expires_in * 1000);
  
  await base44.asServiceRole.entities.IntegrationConnection.update(connection.id, {
    access_token_encrypted: encrypted.access_token_encrypted,
    refresh_token_encrypted: encrypted.refresh_token_encrypted,
    expires_at: newExpiresAt,
    last_used_at: new Date().toISOString(),
  });
  
  console.log(`${provider} token refreshed successfully`);
  return newTokens.access_token;
}

// Main HTTP handler
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { action, provider, code } = await req.json();
    
    // Action: Get OAuth URL
    if (action === 'getAuthUrl') {
      const authUrl = getAuthUrl(provider, user.id);
      return Response.json({ authUrl });
    }
    
    // Action: Handle OAuth Callback
    if (action === 'handleCallback') {
      if (!code) {
        return Response.json({ error: 'Authorization code required' }, { status: 400 });
      }
      
      // Exchange code for tokens
      const tokens = await exchangeCodeForTokens(provider, code);
      
      // Get user info from provider
      const userInfo = await getUserInfo(provider, tokens.access_token);
      
      // Encrypt tokens
      const encrypted = await encryptTokens({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
      });
      
      const expiresAt = Date.now() + (tokens.expires_in * 1000);
      
      // Check for existing connection
      const existing = await base44.entities.IntegrationConnection.filter({
        user_id: user.id,
        provider,
      });
      
      const connectionData = {
        user_id: user.id,
        provider,
        access_token_encrypted: encrypted.access_token_encrypted,
        refresh_token_encrypted: encrypted.refresh_token_encrypted,
        expires_at: expiresAt,
        metadata: userInfo,
        is_active: true,
        last_used_at: new Date().toISOString(),
      };
      
      if (existing.length > 0) {
        await base44.entities.IntegrationConnection.update(existing[0].id, connectionData);
      } else {
        await base44.entities.IntegrationConnection.create(connectionData);
      }
      
      return Response.json({ 
        success: true, 
        provider,
        email: userInfo.email,
        display_name: userInfo.display_name,
      });
    }
    
    // Action: Disconnect
    if (action === 'disconnect') {
      const connections = await base44.entities.IntegrationConnection.filter({
        user_id: user.id,
        provider,
      });
      
      if (connections.length > 0) {
        await base44.entities.IntegrationConnection.delete(connections[0].id);
      }
      
      return Response.json({ success: true });
    }
    
    // Action: Get connection status
    if (action === 'getStatus') {
      const connections = await base44.entities.IntegrationConnection.filter({
        user_id: user.id,
      });
      
      const status = {
        google: null,
        dropbox: null,
      };
      
      for (const conn of connections) {
        if (conn.is_active) {
          status[conn.provider] = {
            connected: true,
            email: conn.metadata?.email,
            display_name: conn.metadata?.display_name,
            spreadsheet_id: conn.metadata?.spreadsheet_id,
            expires_at: conn.expires_at,
          };
        }
      }
      
      return Response.json(status);
    }
    
    // Action: Update metadata (e.g., spreadsheet_id)
    if (action === 'updateMetadata') {
      const { metadata: newMetadata } = await req.json().catch(() => ({}));
      
      const connections = await base44.entities.IntegrationConnection.filter({
        user_id: user.id,
        provider,
      });
      
      if (connections.length === 0) {
        return Response.json({ error: 'Connection not found' }, { status: 404 });
      }
      
      const existingMetadata = connections[0].metadata || {};
      await base44.entities.IntegrationConnection.update(connections[0].id, {
        metadata: { ...existingMetadata, ...newMetadata }
      });
      
      return Response.json({ success: true });
    }
    
    return Response.json({ error: 'Invalid action' }, { status: 400 });
    
  } catch (error) {
    console.error('Integration auth error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});