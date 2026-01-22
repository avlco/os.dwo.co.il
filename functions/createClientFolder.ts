// @ts-nocheck
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Sanitize folder name - remove characters not allowed in Dropbox paths
function sanitizeFolderName(name) {
  if (!name) return '';
  // Remove characters not allowed: \ / : * ? " < > |
  return name
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
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

    // Get Dropbox integration using Base44 SDK (same pattern as Gmail)
    let dropboxIntegration;
    try {
      dropboxIntegration = await base44.integrations.Dropbox.get();
    } catch (e) {
      console.log('[CreateClientFolder] base44.integrations.Dropbox.get() failed:', e.message);
      dropboxIntegration = null;
    }

    // If SDK method didn't work, try getting from IntegrationConnection
    if (!dropboxIntegration?.access_token) {
      console.log('[CreateClientFolder] Trying IntegrationConnection fallback...');

      const connections = await base44.entities.IntegrationConnection.filter({
        provider: 'dropbox',
        is_active: true
      });

      if (!connections || connections.length === 0) {
        console.log('[CreateClientFolder] No active Dropbox connection found');
        return new Response(JSON.stringify({
          success: false,
          message: 'No active Dropbox connection found'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // If we have a connection but can't get the token via SDK,
      // we need to use refresh token approach
      const connection = connections[0];
      console.log('[CreateClientFolder] Found connection, attempting token refresh...');

      // Get fresh token using refresh token + app credentials
      const appKey = Deno.env.get("DROPBOX_APP_KEY");
      const appSecret = Deno.env.get("DROPBOX_APP_SECRET");

      if (!appKey || !appSecret) {
        throw new Error('DROPBOX_APP_KEY or DROPBOX_APP_SECRET not configured');
      }

      // Try to get a new access token using the refresh token
      // Note: This requires the refresh_token to be stored unencrypted or accessible
      // If it's encrypted, we need ENCRYPTION_KEY

      // For now, return an error explaining the issue
      console.error('[CreateClientFolder] Cannot access encrypted tokens without ENCRYPTION_KEY');
      return new Response(JSON.stringify({
        success: false,
        message: 'Dropbox integration requires ENCRYPTION_KEY to access tokens. Please check function configuration.'
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const accessToken = dropboxIntegration.access_token;

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
