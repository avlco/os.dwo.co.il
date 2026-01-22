// @ts-nocheck
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

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

// Sanitize folder name - remove characters not allowed in Dropbox paths
function sanitizeFolderName(name: string): string {
  if (!name) return '';
  // Remove characters not allowed: \ / : * ? " < > |
  return name
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

Deno.serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('[CreateClientFolder] Starting...');

    const base44 = createClientFromRequest(req);
    const { client_name, client_number } = await req.json();

    if (!client_name || !client_number) {
      throw new Error('client_name and client_number are required');
    }

    console.log('[CreateClientFolder] Client:', client_number, '-', client_name);

    // Get Dropbox connection
    const dropboxConnections = await base44.entities.IntegrationConnection.filter({
      provider: 'dropbox',
      is_active: true
    });

    if (!dropboxConnections || dropboxConnections.length === 0) {
      console.log('[CreateClientFolder] No active Dropbox connection found, skipping folder creation');
      return new Response(JSON.stringify({
        success: false,
        message: 'No active Dropbox connection found'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const connection = dropboxConnections[0];
    const accessToken = await decrypt(connection.access_token_encrypted);

    if (!accessToken) {
      throw new Error('Failed to decrypt Dropbox access token');
    }

    // Sanitize names for folder path
    const safeNumber = sanitizeFolderName(client_number);
    const safeName = sanitizeFolderName(client_name);

    // Build folder path: /DWO/לקוחות - משרד/{client_number} - {client_name}
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
        autorename: false
      })
    });

    const result = await response.json();

    if (!response.ok) {
      // Check if folder already exists - that's OK
      if (result.error?.['.tag'] === 'path' &&
          result.error?.path?.['.tag'] === 'conflict') {
        console.log('[CreateClientFolder] Folder already exists, skipping');
        return new Response(JSON.stringify({
          success: true,
          message: 'Folder already exists',
          path: folderPath
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      console.error('[CreateClientFolder] Dropbox API error:', result);
      throw new Error(`Dropbox API error: ${JSON.stringify(result.error)}`);
    }

    console.log('[CreateClientFolder] Folder created successfully:', result.metadata?.path_display);

    return new Response(JSON.stringify({
      success: true,
      path: result.metadata?.path_display || folderPath,
      folder_id: result.metadata?.id
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[CreateClientFolder] Error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
