// functions/createClientFolder.ts
// @ts-nocheck
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

function sanitizeFolderName(name) {
  if (!name) return 'Unknown';
  return name.replace(/[\\/:*?"<>|]/g, '_').trim() || 'Unknown';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    
    const { client_name, client_number } = body;

    if (!client_name || !client_number) {
      throw new Error('client_name and client_number are required');
    }

    console.log('[CreateClientFolder] Starting for:', client_name);

    // Get Dropbox connection
    const dropboxConnections = await base44.entities.IntegrationConnection.filter({
      provider: 'dropbox',
      is_active: true
    });
    
    if (!dropboxConnections || dropboxConnections.length === 0) {
      console.log('[CreateClientFolder] No Dropbox connection - skipping folder creation');
      return new Response(
        JSON.stringify({ success: false, reason: 'no_dropbox_connection' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const connection = dropboxConnections[0];
    const accessToken = await decrypt(connection.access_token_encrypted);

    if (!accessToken) {
      throw new Error('Failed to decrypt Dropbox access token');
    }

    // Build folder path: /DWO/לקוחות - משרד/{client_number} - {client_name}
    const safeName = sanitizeFolderName(client_name);
    const safeNumber = sanitizeFolderName(client_number);
    const folderPath = `/DWO/לקוחות - משרד/${safeNumber} - ${safeName}`;

    console.log('[CreateClientFolder] Creating folder:', folderPath);

    // Create folder in Dropbox
    const response = await fetch('https://api.dropboxapi.com/2/files/create_folder_v2', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        path: folderPath,
        autorename: false,
      }),
    });
    
    const data = await response.json();
    
    // If folder already exists, that's OK
    if (data.error?.path?.['.tag'] === 'conflict') {
      console.log('[CreateClientFolder] Folder already exists:', folderPath);
      return new Response(
        JSON.stringify({ success: true, exists: true, path: folderPath }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    if (data.error) {
      throw new Error(data.error_summary || 'Failed to create folder');
    }
    
    console.log('[CreateClientFolder] ✅ Folder created:', folderPath);

    return new Response(
      JSON.stringify({ 
        success: true, 
        created: true,
        path: data.metadata?.path_display || folderPath 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[CreateClientFolder] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
