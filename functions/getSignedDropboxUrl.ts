import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// --- Crypto Helpers ---
async function getCryptoKey() {
  const envKey = Deno.env.get("SECRET_KEY_ENCRYPTION");
  if (!envKey) throw new Error("SECRET_KEY_ENCRYPTION is missing");
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

async function getDropboxToken(base44) {
  const connections = await base44.asServiceRole.entities.IntegrationConnection.filter({
    provider: 'dropbox',
    is_active: true
  });

  if (!connections || connections.length === 0) {
    throw new Error('No active Dropbox connection found');
  }

  const connection = connections[0];
  const refreshToken = await decrypt(connection.refresh_token_encrypted);
  if (!refreshToken) throw new Error('No refresh token - reconnect Dropbox');
  
  const accessToken = await refreshDropboxToken(refreshToken);
  
  // Save refreshed token
  const encryptedToken = await encrypt(accessToken);
  await base44.asServiceRole.entities.IntegrationConnection.update(connection.id, {
    access_token_encrypted: encryptedToken
  });

  return accessToken;
}

// --- Main Handler ---
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { document_id, dropbox_path } = await req.json();

    if (!document_id && !dropbox_path) {
      return Response.json({ error: 'document_id or dropbox_path is required' }, { status: 400 });
    }

    let path = dropbox_path;

    // If document_id provided, fetch the document to get the path
    if (document_id && !path) {
      const documents = await base44.entities.Document.filter({ id: document_id });
      if (!documents || documents.length === 0) {
        return Response.json({ error: 'Document not found' }, { status: 404 });
      }
      
      const document = documents[0];
      
      // If document already has a shared URL, return it
      if (document.file_url) {
        return Response.json({
          success: true,
          url: document.file_url,
          source: 'cached'
        }, { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      
      path = document.dropbox_path;
    }

    if (!path) {
      return Response.json({ error: 'No dropbox_path available' }, { status: 400 });
    }

    // Get Dropbox token
    const accessToken = await getDropboxToken(base44);

    // Try to get existing shared link first
    let response = await fetch('https://api.dropboxapi.com/2/sharing/list_shared_links', {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${accessToken}`, 
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify({ path: path, direct_only: true }),
    });
    
    let data = await response.json();
    
    if (data.links && data.links.length > 0) {
      return Response.json({
        success: true,
        url: data.links[0].url,
        source: 'existing_link'
      }, { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Create new shared link
    response = await fetch('https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings', {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${accessToken}`, 
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify({ 
        path: path, 
        settings: { 
          requested_visibility: 'public', 
          audience: 'public', 
          access: 'viewer' 
        } 
      }),
    });
    
    data = await response.json();

    if (data.error) {
      // Handle case where link already exists (race condition)
      if (data.error?.['.tag'] === 'shared_link_already_exists') {
        response = await fetch('https://api.dropboxapi.com/2/sharing/list_shared_links', {
          method: 'POST',
          headers: { 
            'Authorization': `Bearer ${accessToken}`, 
            'Content-Type': 'application/json' 
          },
          body: JSON.stringify({ path: path, direct_only: true }),
        });
        data = await response.json();
        if (data.links && data.links.length > 0) {
          return Response.json({
            success: true,
            url: data.links[0].url,
            source: 'existing_link'
          }, { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
      }
      throw new Error(data.error_summary || 'Failed to create shared link');
    }

    // If document_id was provided, update the Document entity with the new URL
    if (document_id && data.url) {
      await base44.entities.Document.update(document_id, {
        file_url: data.url
      });
    }

    return Response.json({
      success: true,
      url: data.url,
      source: 'new_link'
    }, { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('[getSignedDropboxUrl] Error:', error);
    return Response.json({ 
      success: false, 
      error: error.message 
    }, { 
      status: 500, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
});