import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// --- Crypto Helpers ---
async function getCryptoKey() {
  const envKey = Deno.env.get("ENCRYPTION_SECRET_KEY");
  if (!envKey) throw new Error("ENCRYPTION_SECRET_KEY is missing");
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

function sanitizeName(name) {
  if (!name) return 'Unknown';
  return name.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim() || 'Unknown';
}

async function ensureDropboxFolder(accessToken, folderPath) {
  const response = await fetch('https://api.dropboxapi.com/2/files/create_folder_v2', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: folderPath, autorename: false }),
  });
  const data = await response.json();
  if (data.error?.path?.['.tag'] === 'conflict') return { exists: true, path: folderPath };
  if (data.error) throw new Error(data.error_summary || 'Failed to create folder');
  return { created: true, path: data.metadata?.path_display || folderPath };
}

async function uploadToDropbox(accessToken, filePath, fileContent) {
  const response = await fetch('https://content.dropboxapi.com/2/files/upload', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Dropbox-API-Arg': JSON.stringify({ path: filePath, mode: 'add', autorename: true, mute: false }),
      'Content-Type': 'application/octet-stream',
    },
    body: fileContent,
  });
  const data = await response.json();
  if (data.error) throw new Error(data.error_summary || 'Failed to upload file');
  return data;
}

async function createDropboxSharedLink(accessToken, filePath) {
  let response = await fetch('https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: filePath, settings: { requested_visibility: 'public', audience: 'public', access: 'viewer' } }),
  });
  let data = await response.json();
  
  if (data.error?.['.tag'] === 'shared_link_already_exists') {
    response = await fetch('https://api.dropboxapi.com/2/sharing/list_shared_links', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: filePath, direct_only: true }),
    });
    data = await response.json();
    if (data.links && data.links.length > 0) return data.links[0].url;
  }
  return data.url;
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

    const { 
      file_url,           // URL של הקובץ להעלאה (או base64)
      file_content_base64, // תוכן הקובץ ב-base64 (אופציונלי)
      file_name,          // שם הקובץ
      client_id,          // מזהה לקוח
      case_id,            // מזהה תיק (אופציונלי)
      document_type,      // סוג מסמך
      description,        // תיאור
      custom_path,        // נתיב מותאם אישית (אופציונלי)
      source_mail_id,     // מזהה מייל מקורי (אופציונלי)
      source_task_id      // מזהה משימה מקורית (אופציונלי)
    } = await req.json();

    if (!file_name) {
      return Response.json({ error: 'file_name is required' }, { status: 400 });
    }

    if (!file_url && !file_content_base64) {
      return Response.json({ error: 'file_url or file_content_base64 is required' }, { status: 400 });
    }

    // 1. Get file content
    let fileContent;
    if (file_content_base64) {
      const binaryString = atob(file_content_base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      fileContent = bytes;
    } else {
      const response = await fetch(file_url);
      if (!response.ok) throw new Error(`Failed to download file: ${response.status}`);
      fileContent = new Uint8Array(await response.arrayBuffer());
    }

    // 2. Resolve client and case info
    let client = null;
    let caseData = null;

    if (client_id) {
      const clients = await base44.entities.Client.filter({ id: client_id });
      client = clients[0];
    }

    if (case_id) {
      const cases = await base44.entities.Case.filter({ id: case_id });
      caseData = cases[0];
      
      // If no client_id provided but case has one, use it
      if (!client && caseData?.client_id) {
        const clients = await base44.entities.Client.filter({ id: caseData.client_id });
        client = clients[0];
      }
    }

    // 3. Build Dropbox path
    let dropboxPath;
    
    if (custom_path) {
      // Use custom path if provided
      dropboxPath = custom_path;
    } else if (client) {
      // Build smart path: /DWO/לקוחות - משרד/{client_number} - {client_name}/{case_number}/{document_type}/
      const clientNumber = sanitizeName(client.client_number || '0000');
      const clientName = sanitizeName(client.name);
      const clientFolder = `/DWO/לקוחות - משרד/${clientNumber} - ${clientName}`;
      
      if (caseData) {
        const caseNumber = sanitizeName(caseData.case_number);
        const docType = document_type || 'general';
        dropboxPath = `${clientFolder}/${caseNumber}/${docType}`;
      } else {
        dropboxPath = `${clientFolder}/general`;
      }
    } else {
      // Fallback to Manual_Review folder
      dropboxPath = `/DWO/Manual_Review/${new Date().toISOString().split('T')[0]}`;
    }

    // 4. Get Dropbox token and upload
    const accessToken = await getDropboxToken(base44);
    
    // Ensure folder exists
    await ensureDropboxFolder(accessToken, dropboxPath);
    
    // Upload file
    const safeFileName = sanitizeName(file_name);
    const filePath = `${dropboxPath}/${safeFileName}`;
    const uploadResult = await uploadToDropbox(accessToken, filePath, fileContent);
    
    // Create shared link
    const sharedUrl = await createDropboxSharedLink(accessToken, uploadResult.path_display);

    // 5. Create Document entity record
    const documentRecord = await base44.entities.Document.create({
      name: file_name,
      type: document_type || 'other',
      file_url: sharedUrl,
      dropbox_path: uploadResult.path_display,
      dropbox_file_id: uploadResult.id,
      file_size: uploadResult.size || fileContent.length,
      client_id: client?.id || null,
      case_id: caseData?.id || null,
      description: description || null,
      folder: dropboxPath,
      uploaded_by: user.email,
      source_mail_id: source_mail_id || null,
      source_task_id: source_task_id || null,
      version: 1
    });

    console.log(`[uploadDocumentToDropbox] Successfully uploaded: ${uploadResult.path_display}`);

    return Response.json({
      success: true,
      document_id: documentRecord.id,
      file_url: sharedUrl,
      dropbox_path: uploadResult.path_display,
      dropbox_file_id: uploadResult.id
    }, { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('[uploadDocumentToDropbox] Error:', error);
    return Response.json({ 
      success: false, 
      error: error.message 
    }, { 
      status: 500, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
});