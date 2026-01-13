// @ts-nocheck
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// 1. מפתח קבוע - חובה שיהיה זהה בשני הקבצים
const STATIC_KEY = "my-secret-key-1234567890123456";

// 2. הגדרות סביבה
const APP_BASE_URL = "https://os.dwo.co.il"; 
// חשוב: נתיב זה חייב להיות זהה למה שהוגדר ב-Google Cloud Console
const REDIRECT_URI = `${APP_BASE_URL}/settings`; 

const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID");
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET");
const DROPBOX_APP_KEY = Deno.env.get("DROPBOX_APP_KEY");
const DROPBOX_APP_SECRET = Deno.env.get("DROPBOX_APP_SECRET");

async function getCryptoKey() {
  const encoder = new TextEncoder();
  const keyBuffer = encoder.encode(STATIC_KEY);
  return await crypto.subtle.importKey("raw", keyBuffer, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
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

async function getAuthUrl(provider, state) {
  console.log(`Generating Auth URL for ${provider}`);

  if (provider === 'google') {
    if (!GOOGLE_CLIENT_ID) throw new Error("Missing Google Config");
    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/drive.file',
      access_type: 'offline',
      prompt: 'consent',
      state: state,
      include_granted_scopes: 'true'
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  } 
  
  if (provider === 'dropbox') {
    if (!DROPBOX_APP_KEY) throw new Error("Missing Dropbox Config");
    const params = new URLSearchParams({
      client_id: DROPBOX_APP_KEY,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      token_access_type: 'offline',
      state: state
    });
    return `https://www.dropbox.com/oauth2/authorize?${params.toString()}`;
  }
  throw new Error(`Unsupported provider: ${provider}`);
}

async function handleCallback(code, provider, userId, base44) {
  console.log(`Handling callback for ${provider}, user: ${userId}`);
  let tokens;
  
  if (provider === 'google') {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
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
        redirect_uri: REDIRECT_URI,
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

  // שימוש ב-ServiceRole כדי לעקוף בעיות הרשאה בכתיבה/קריאה
  const existing = await base44.asServiceRole.entities.IntegrationConnection.filter({ user_id: userId, provider });

  const data = {
    user_id: userId,
    provider,
    access_token: encryptedAccess,
    expires_at: expiresAt, 
    metadata: { last_updated: new Date().toISOString() }
  };

  if (encryptedRefresh) data.refresh_token = encryptedRefresh;

  if (existing.length > 0) {
    await base44.asServiceRole.entities.IntegrationConnection.update(existing[0].id, data);
  } else {
    await base44.asServiceRole.entities.IntegrationConnection.create({
        ...data,
        refresh_token: encryptedRefresh || "MISSING"
    });
  }
}

Deno.serve(async (req) => {
    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Content-Type": "application/json"
    };

    if (req.method === "OPTIONS") return new Response(null, { headers });

    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers });

        const body = await req.json();
        const { action, provider, code, state } = body;

        if (action === 'getAuthUrl') {
            const url = await getAuthUrl(provider, state || user.id);
            return new Response(JSON.stringify({ authUrl: url }), { status: 200, headers });
        }
        
        if (action === 'handleCallback') {
            await handleCallback(code, provider, user.id, base44);
            return new Response(JSON.stringify({ success: true }), { status: 200, headers });
        }

        return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers });

    } catch (err) {
        console.error("Function Error:", err);
        return new Response(JSON.stringify({ error: err.message || String(err) }), { status: 500, headers });
    }
});