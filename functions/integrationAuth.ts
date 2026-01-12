import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// --- Section 1: Inlined Crypto Logic (No external imports!) ---

async function getCryptoKey() {
  const keyString = Deno.env.get("ENCRYPTION_KEY");
  if (!keyString) {
    console.warn("Missing ENCRYPTION_KEY, using fallback (NOT SECURE for production)");
    return await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"]
    );
  }
  
  const encoder = new TextEncoder();
  const keyBuffer = encoder.encode(keyString.padEnd(32, '0').slice(0, 32));
  
  return await crypto.subtle.importKey(
    "raw", 
    keyBuffer, 
    { name: "AES-GCM" }, 
    false, 
    ["encrypt", "decrypt"]
  );
}

async function encrypt(text) {
  try {
    const key = await getCryptoKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(text);
    const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
    
    const ivHex = Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join('');
    const encryptedHex = Array.from(new Uint8Array(encrypted)).map(b => b.toString(16).padStart(2, '0')).join('');
    return `${ivHex}:${encryptedHex}`;
  } catch (e) {
    console.error("Encryption failed:", e);
    throw new Error("Failed to encrypt token");
  }
}

async function decrypt(text) {
  try {
    const [ivHex, encryptedHex] = text.split(':');
    if (!ivHex || !encryptedHex) throw new Error("Invalid encrypted format");
    
    const key = await getCryptoKey();
    const iv = new Uint8Array(ivHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
    const encrypted = new Uint8Array(encryptedHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
    
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, encrypted);
    return new TextDecoder().decode(decrypted);
  } catch (e) {
    console.error("Decryption failed:", e);
    throw new Error("Failed to decrypt token");
  }
}

// --- Section 2: Integration Logic ---

const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID");
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET");
const GOOGLE_REDIRECT_URI = Deno.env.get("GOOGLE_REDIRECT_URI");

const DROPBOX_APP_KEY = Deno.env.get("DROPBOX_APP_KEY");
const DROPBOX_APP_SECRET = Deno.env.get("DROPBOX_APP_SECRET");
const DROPBOX_REDIRECT_URI = Deno.env.get("DROPBOX_REDIRECT_URI");

async function getAuthUrl(provider, userId) {
  console.log(`Generating Auth URL for ${provider}`);

  if (provider === 'google') {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_REDIRECT_URI) throw new Error("Missing Google Config");
    
    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: GOOGLE_REDIRECT_URI,
      response_type: 'code',
      scope: [
        'https://www.googleapis.com/auth/gmail.modify',
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/drive.file',
        'https://www.googleapis.com/auth/spreadsheets'
      ].join(' '),
      access_type: 'offline',
      prompt: 'consent',
      state: userId,
      include_granted_scopes: 'true'
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  } 
  
  if (provider === 'dropbox') {
    if (!DROPBOX_APP_KEY || !DROPBOX_REDIRECT_URI) throw new Error("Missing Dropbox Config");
    const params = new URLSearchParams({
      client_id: DROPBOX_APP_KEY,
      redirect_uri: DROPBOX_REDIRECT_URI,
      response_type: 'code',
      token_access_type: 'offline',
      state: userId
    });
    return `https://www.dropbox.com/oauth2/authorize?${params.toString()}`;
  }

  throw new Error(`Unsupported provider: ${provider}`);
}

async function handleCallback(code, provider, userId, base44) {
  console.log(`Handling callback for ${provider}`);
  let tokens;
  
  if (provider === 'google') {
    const res = await fetch('https://oauth2.googleapis.com/token', {
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
    tokens = await res.json();
  } else if (provider === 'dropbox') {
    const credentials = btoa(`${DROPBOX_APP_KEY}:${DROPBOX_APP_SECRET}`);
    const res = await fetch('https://api.dropboxapi.com/oauth2/token', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`
      },
      body: new URLSearchParams({
        code,
        grant_type: 'authorization_code',
        redirect_uri: DROPBOX_REDIRECT_URI,
      }).toString(),
    });
    tokens = await res.json();
  }

  if (!tokens || tokens.error) {
    console.error("Provider Token Error:", tokens);
    throw new Error(`Provider Error: ${tokens?.error_description || JSON.stringify(tokens)}`);
  }

  const encryptedAccess = await encrypt(tokens.access_token);
  const encryptedRefresh = tokens.refresh_token ? await encrypt(tokens.refresh_token) : null;
  const expiresAt = Date.now() + ((tokens.expires_in || 3600) * 1000); 

  const existing = await base44.entities.IntegrationConnection.filter({ user_id: userId, provider });

  const data = {
    user_id: userId,
    provider,
    access_token_encrypted: encryptedAccess,
    expires_at: expiresAt, 
    metadata: { last_updated: new Date().toISOString() },
    is_active: true
  };

  if (encryptedRefresh) {
    data.refresh_token_encrypted = encryptedRefresh;
  }

  if (existing.length > 0) {
    await base44.entities.IntegrationConnection.update(existing[0].id, data);
  } else {
    await base44.entities.IntegrationConnection.create({
      ...data,
      refresh_token_encrypted: encryptedRefresh || "MISSING_REFRESH_TOKEN"
    });
  }
}

// --- Section 3: Token Refresh Utility ---

async function getValidToken(userId, provider, base44) {
  const connections = await base44.entities.IntegrationConnection.filter({ user_id: userId, provider });
  if (connections.length === 0) throw new Error(`No connection found for ${provider}`);

  let connection = connections[0];
  
  if (Date.now() > (connection.expires_at - 300000)) {
    console.log(`Refreshing token for ${provider}...`);
    
    if (!connection.refresh_token_encrypted) throw new Error(`Cannot refresh token for ${provider}`);
    
    const refreshToken = await decrypt(connection.refresh_token_encrypted);
    let newTokens;

    if (provider === 'google') {
      const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
        }).toString(),
      });
      newTokens = await res.json();
    } else if (provider === 'dropbox') {
      const credentials = btoa(`${DROPBOX_APP_KEY}:${DROPBOX_APP_SECRET}`);
      const res = await fetch('https://api.dropboxapi.com/oauth2/token', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${credentials}`
        },
        body: new URLSearchParams({
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
        }).toString(),
      });
      newTokens = await res.json();
    }

    if (newTokens.error) throw new Error(JSON.stringify(newTokens));

    const newAccessEnc = await encrypt(newTokens.access_token);
    const newExpiresAt = Date.now() + (newTokens.expires_in * 1000);
    
    const updateData = {
      access_token_encrypted: newAccessEnc,
      expires_at: newExpiresAt,
    };
    
    if (newTokens.refresh_token) {
      updateData.refresh_token_encrypted = await encrypt(newTokens.refresh_token);
    }
    
    await base44.entities.IntegrationConnection.update(connection.id, updateData);
    
    return newTokens.access_token;
  }

  return await decrypt(connection.access_token_encrypted);
}

// === MAIN ENTRY POINT ===
Deno.serve(async (req) => {
  const headers = new Headers({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Content-Type": "application/json"
  });

  if (req.method === "OPTIONS") {
    return new Response(null, { headers });
  }

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers });
    }

    const body = await req.json();
    const { action, provider, code } = body;

    console.log(`Action: ${action}, Provider: ${provider}, User: ${user.id}`);

    if (action === 'getAuthUrl') {
      const url = await getAuthUrl(provider, user.id);
      return new Response(JSON.stringify({ authUrl: url }), { status: 200, headers });
    }
    
    if (action === 'handleCallback') {
      await handleCallback(code, provider, user.id, base44);
      return new Response(JSON.stringify({ success: true }), { status: 200, headers });
    }

    if (action === 'getValidToken') {
      const token = await getValidToken(user.id, provider, base44);
      return new Response(JSON.stringify({ token }), { status: 200, headers });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers });

  } catch (err) {
    console.error("Function Error:", err);
    return new Response(JSON.stringify({ error: err.message || String(err) }), { status: 500, headers });
  }
});