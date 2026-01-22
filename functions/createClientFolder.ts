// @ts-nocheck
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// פונקציות הצפנה
async function getCryptoKey() {
  const envKey = Deno.env.get("ENCRYPTION_KEY");
  if (!envKey) throw new Error("ENCRYPTION_KEY is missing");
  const encoder = new TextEncoder();
  const keyString = envKey.padEnd(32, '0').slice(0, 32);
  const keyBuffer = encoder.encode(keyString);
  return await crypto.subtle.importKey("raw", keyBuffer, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function decrypt(text) {
  if (!text) return null;
  const parts = text.split(':');
  if (parts.length !== 2) return text;
  const [ivHex, encryptedHex] = parts;
  const key = await getCryptoKey();
  const iv = new Uint8Array(ivHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
  const encrypted = new Uint8Array(encryptedHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, encrypted);
  return new TextDecoder().decode(decrypted);
}

async function encrypt(text) {
  const key = await getCryptoKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(text);
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  const ivHex = Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join('');
  const encryptedHex = Array.from(new Uint8Array(encrypted)).map(b => b.toString(16).padStart(2, '0')).join('');
  return `${ivHex}:${encryptedHex}`;
}

async function refreshDropboxToken(refreshToken) {
  const appKey = Deno.env.get("DROPBOX_APP_KEY");
  const appSecret = Deno.env.get("DROPBOX_APP_SECRET");
  if (!appKey || !appSecret) throw new Error('DROPBOX credentials not configured');

  const creds = btoa(`${appKey}:${appSecret}`);
  const response = await fetch('https://api.dropboxapi.com/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${creds}`
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    }).toString()
  });

  const result = await response.json();
  if (result.error) throw new Error(`Token refresh failed: ${result.error}`);
  return result.access_token;
}

function sanitizeFolderName(name) {
  if (!name) return '';
  return name.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const base44 = createClientFromRequest(req);
    const { client_name, client_number } = await req.json();

    if (!client_name || !client_number) {
      throw new Error('client_name and client_number are required');
    }

    console.log('[CreateClientFolder] Starting for:', client_name);

    const connections = await base44.entities.IntegrationConnection.filter({
      provider: 'dropbox',
      is_active: true
    });

    if (!connections || connections.length === 0) {
      throw new Error('No active Dropbox connection found');
    }

    const connection = connections[0];
    
    // רענון הטוקן
    console.log('[CreateClientFolder] Refreshing token...');
    const refreshToken = await decrypt(connection.refresh_token_encrypted);
    if (!refreshToken) throw new Error('No refresh token - reconnect Dropbox');
    
    const accessToken = await refreshDropboxToken(refreshToken);
    console.log('[CreateClientFolder] Token refreshed successfully');

    // שמירת הטוקן החדש
    const encryptedToken = await encrypt(accessToken);
    await base44.entities.IntegrationConnection.update(connection.id, {
      access_token_encrypted: encryptedToken
    });

    const safeNumber = sanitizeFolderName(client_number);
    const safeName = sanitizeFolderName(client_name);
    const folderPath = `/DWO/לקוחות - משרד/${safeNumber} - ${safeName}`;

    console.log('[CreateClientFolder] Creating folder:', folderPath);

    const response = await fetch('https://api.dropboxapi.com/2/files/create_folder_v2', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ path: folderPath, autorename: false })
    });

    const result = await response.json();

    if (!response.ok) {
      if (result.error?.['.tag'] === 'path' && result.error?.path?.['.tag'] === 'conflict') {
        console.log('[CreateClientFolder] Folder already exists');
        return new Response(JSON.stringify({ success: true, message: 'Folder already exists', path: folderPath }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      throw new Error(`Dropbox API error: ${JSON.stringify(result.error)}`);
    }

    console.log('[CreateClientFolder] Success!');
    return new Response(JSON.stringify({ success: true, path: result.metadata?.path_display || folderPath }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[CreateClientFolder] Error:', error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
