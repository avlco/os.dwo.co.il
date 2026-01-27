// @ts-nocheck
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// --- Crypto Helpers (Reused to ensure standalone execution) ---
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
  if (result.error) throw new Error(`Token refresh failed: ${result.error_description || result.error}`);
  return result.access_token;
}

function sanitizeFolderName(name) {
  if (!name) return '';
  return name.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim();
}

// --- Main Handler ---
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const base44 = createClientFromRequest(req);
    const { caseId, relativePath = "" } = await req.json();

    if (!caseId) {
      throw new Error('caseId is required');
    }

    // 1. Get Integration Connection
    const connections = await base44.entities.IntegrationConnection.filter({
      provider: 'dropbox',
      is_active: true
    });

    if (!connections || connections.length === 0) {
      throw new Error('No active Dropbox connection found');
    }
    const connection = connections[0];

    // 2. Auth & Token Management
    let accessToken = await decrypt(connection.access_token_encrypted);
    
    // Check if token works (simple check), if not refresh
    // Note: To save API calls, we might assume we need refresh on 401 later, 
    // but for stability we'll check if we have a refresh token and use logic similar to other functions.
    // For now, let's try to use it and handle 401.

    // 3. Resolve Path
    const cases = await base44.entities.Case.filter({ id: caseId });
    if (!cases.length) throw new Error('Case not found');
    const currentCase = cases[0];

    const clients = await base44.entities.Client.filter({ id: currentCase.client_id });
    if (!clients.length) throw new Error('Client not found');
    const client = clients[0];

    const safeClientNumber = sanitizeFolderName(client.client_number || client.number || '');
    const safeClientName = sanitizeFolderName(client.name);
    const safeCaseNumber = sanitizeFolderName(currentCase.case_number);

    // Root path logic matches createClientFolder.ts logic
    const clientRoot = `/DWO/לקוחות - משרד/${safeClientNumber} - ${safeClientName}`;
    // We add case subfolder to keep things organized
    const caseRoot = `${clientRoot}/${safeCaseNumber}`;
    
    // Construct final path
    // Remove leading slash from relativePath to avoid double slashes
    const cleanRelative = relativePath.startsWith('/') ? relativePath.substring(1) : relativePath;
    const finalPath = cleanRelative ? `${caseRoot}/${cleanRelative}` : caseRoot;

    console.log(`[Dropbox] Listing: ${finalPath}`);

    // 4. Dropbox API Call
    const listFolder = async (token) => {
      return await fetch('https://api.dropboxapi.com/2/files/list_folder', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          path: finalPath,
          include_media_info: false,
          include_deleted: false,
          include_has_explicit_shared_members: false
        })
      });
    };

    let response = await listFolder(accessToken);

    // Handle Token Expiry
    if (response.status === 401) {
      console.log('[Dropbox] Token expired, refreshing...');
      const refreshToken = await decrypt(connection.refresh_token_encrypted);
      if (!refreshToken) throw new Error('Refresh token missing');
      
      accessToken = await refreshDropboxToken(refreshToken);
      
      // Save new token
      const encryptedToken = await encrypt(accessToken);
      await base44.entities.IntegrationConnection.update(connection.id, {
        access_token_encrypted: encryptedToken
      });
      
      // Retry
      response = await listFolder(accessToken);
    }

    const data = await response.json();

    // Handle "Path not found" (Folder doesn't exist yet)
    if (data.error?.['.tag'] === 'path' && data.error?.path?.['.tag'] === 'not_found') {
      return new Response(JSON.stringify({ 
        success: true, 
        folder_missing: true,
        root_path: caseRoot,
        current_path: finalPath
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (data.error) {
      throw new Error(`Dropbox API Error: ${JSON.stringify(data.error)}`);
    }

    // 5. Get Temporary Links for Files (Optional enhancement for thumbnails/preview)
    // For now, we return the metadata. The frontend will request links when needed or we rely on preview.

    return new Response(JSON.stringify({
      success: true,
      entries: data.entries,
      has_more: data.has_more,
      cursor: data.cursor,
      root_path: caseRoot,
      current_path: finalPath
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('[Dropbox] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
