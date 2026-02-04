// @ts-nocheck
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ========================================
// 1. CRYPTO HELPERS (Standalone - no imports)
// ========================================

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

// ========================================
// 2. TOKEN MANAGEMENT
// ========================================

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
  if (result.error) throw new Error(`Dropbox token refresh failed: ${result.error_description || result.error}`);
  return result.access_token;
}

async function refreshGoogleToken(refreshToken) {
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  if (!clientId || !clientSecret) throw new Error('Google credentials not configured');

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    }).toString()
  });

  const result = await response.json();
  if (result.error) throw new Error(`Google token refresh failed: ${result.error}`);
  return result.access_token;
}

async function getDropboxToken(base44) {
  const connections = await base44.asServiceRole.entities.IntegrationConnection.filter({
    provider: 'dropbox',
    is_active: true
  });
  if (!connections || connections.length === 0) throw new Error('No active Dropbox connection');

  const conn = connections[0];
  const refreshToken = await decrypt(conn.refresh_token_encrypted);
  if (!refreshToken) throw new Error('No Dropbox refresh token - reconnect Dropbox');

  const accessToken = await refreshDropboxToken(refreshToken);

  // Save refreshed token
  const encryptedToken = await encrypt(accessToken);
  await base44.asServiceRole.entities.IntegrationConnection.update(conn.id, {
    access_token_encrypted: encryptedToken,
    expires_at: Date.now() + 3600000
  });

  return { accessToken, metadata: conn.metadata || {} };
}

async function getGoogleToken(base44) {
  const connections = await base44.asServiceRole.entities.IntegrationConnection.filter({
    provider: 'google',
    is_active: true
  });
  if (!connections || connections.length === 0) throw new Error('No active Google connection');

  const conn = connections[0];

  // Check if token is still valid (60s buffer)
  const now = Date.now();
  if (conn.expires_at && now < conn.expires_at - 60000) {
    const token = await decrypt(conn.access_token_encrypted);
    if (token) return token;
  }

  // Refresh
  const refreshToken = await decrypt(conn.refresh_token_encrypted);
  if (!refreshToken) throw new Error('No Google refresh token');

  const accessToken = await refreshGoogleToken(refreshToken);

  // Save
  const encryptedToken = await encrypt(accessToken);
  await base44.asServiceRole.entities.IntegrationConnection.update(conn.id, {
    access_token_encrypted: encryptedToken,
    expires_at: Date.now() + 3600000
  });

  return accessToken;
}

// ========================================
// 3. DROPBOX OPERATIONS
// ========================================

function sanitizeName(name) {
  if (!name) return 'Unknown';
  return name.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim() || 'Unknown';
}

async function ensureDropboxFolder(accessToken, folderPath) {
  try {
    const response = await fetch('https://api.dropboxapi.com/2/files/create_folder_v2', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: folderPath, autorename: false }),
    });
    const data = await response.json();
    if (data.error?.path?.['.tag'] === 'conflict') return { exists: true, path: folderPath };
    if (data.error) throw new Error(data.error_summary || 'Failed to create folder');
    return { created: true, path: data.metadata?.path_display || folderPath };
  } catch (error) {
    if (error.message?.includes('conflict')) return { exists: true, path: folderPath };
    throw error;
  }
}

async function uploadFileToDropbox(accessToken, filePath, fileContent) {
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

async function createSharedLink(accessToken, filePath) {
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

// ========================================
// 4. PATH BUILDING - NEW SCHEMA + LEGACY SUPPORT
// ========================================

/**
 * Resolves a dynamic level value based on source and format (for FolderTreeSchema)
 */
function resolveDynamicLevel(level, context) {
  const { source, format } = level;
  
  switch (source) {
    case 'client': {
      if (!context.client) return '_לא_משוייך';
      const fmt = format || '{client_number} - {client_name}';
      return fmt
        .replace('{client_number}', sanitizeName(context.client.client_number || ''))
        .replace('{client_name}', sanitizeName(context.client.name || ''))
        .replace('{client_id}', context.client.id || '');
    }
    
    case 'case': {
      if (!context.caseData) return 'ממתין_לשיוך';
      const fmt = format || '{case_number}';
      return fmt
        .replace('{case_number}', sanitizeName(context.caseData.case_number || ''))
        .replace('{case_title}', sanitizeName(context.caseData.title || ''))
        .replace('{case_type}', sanitizeName(context.caseData.case_type || ''))
        .replace('{application_number}', sanitizeName(context.caseData.application_number || ''));
    }
    
    case 'user': {
      if (!context.user) return 'system';
      const fmt = format || '{user_name}';
      return fmt
        .replace('{user_name}', sanitizeName(context.user.full_name || context.user.email || ''))
        .replace('{user_email}', sanitizeName(context.user.email || ''))
        .replace('{department}', sanitizeName(context.user.department || ''));
    }
    
    case 'date': {
      const now = new Date();
      const fmt = format || '{year}';
      return fmt
        .replace('{year}', now.getFullYear().toString())
        .replace('{month}', String(now.getMonth() + 1).padStart(2, '0'))
        .replace('{day}', String(now.getDate()).padStart(2, '0'))
        .replace('{year_month}', `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
    }
    
    default:
      return 'unknown';
  }
}

/**
 * Resolves static/pool level value from path_selections
 */
function resolveStaticOrPoolLevel(level, pathSelections) {
  const selection = pathSelections?.[level.key];
  
  if (!selection) {
    // For static levels with single value, use that value
    if (level.type === 'static' && level.values?.length === 1) {
      return level.values[0].code;
    }
    return null;
  }
  
  const matchingValue = level.values?.find(v => v.code === selection);
  return matchingValue ? matchingValue.code : selection;
}

/**
 * NEW: Build path from FolderTreeSchema entity
 */
function buildPathFromSchema(schema, pathSelections = {}, context = {}) {
  if (!schema || !schema.levels || !Array.isArray(schema.levels)) {
    console.warn('[UploadToDropbox] Invalid schema, falling back to default path');
    return buildDefaultPath(context);
  }
  
  const parts = [];
  
  // Add root path
  if (schema.root_path) {
    parts.push(schema.root_path.replace(/^\/+|\/+$/g, ''));
  }
  
  // Sort levels by order
  const sortedLevels = [...schema.levels].sort((a, b) => (a.order || 0) - (b.order || 0));
  
  for (const level of sortedLevels) {
    let folderName = null;
    
    switch (level.type) {
      case 'dynamic':
        folderName = resolveDynamicLevel(level, context);
        break;
        
      case 'static':
      case 'pool':
        folderName = resolveStaticOrPoolLevel(level, pathSelections);
        break;
        
      default:
        console.warn(`[UploadToDropbox] Unknown level type: ${level.type}`);
    }
    
    if (folderName) {
      parts.push(sanitizeName(folderName));
    } else if (level.required !== false) {
      console.warn(`[UploadToDropbox] Missing required level: ${level.key}`);
      parts.push(`_${level.key}_`);
    }
  }
  
  // Add optional subfolder from context
  if (context.subfolder) {
    parts.push(sanitizeName(context.subfolder));
  }
  
  return '/' + parts.join('/');
}

/**
 * Resolves filename template with tokens
 */
function resolveFilenameTemplate(template, context, originalFilename) {
  if (!template) return originalFilename || 'document';
  
  let result = template;
  
  // Token replacements
  result = result.replace(/{Case_No}/g, context.caseData?.case_number || '');
  result = result.replace(/{Client_Name}/g, context.client?.name || '');
  result = result.replace(/{Client_No}/g, context.client?.client_number || '');
  result = result.replace(/{Case_Type}/g, context.caseData?.case_type || '');
  result = result.replace(/{Official_No}/g, context.caseData?.application_number || '');
  result = result.replace(/{Mail_Subject}/g, context.mail?.subject || '');
  result = result.replace(/{Mail_Date}/g, context.mail?.received_at ? new Date(context.mail.received_at).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]);
  result = result.replace(/{Date}/g, new Date().toISOString().split('T')[0]);
  result = result.replace(/{Year}/g, new Date().getFullYear().toString());
  result = result.replace(/{Month}/g, String(new Date().getMonth() + 1).padStart(2, '0'));
  result = result.replace(/{Original_Filename}/g, originalFilename || 'document');
  
  // Clean up empty tokens
  result = result.replace(/\{\w+\}/g, '').replace(/\s+/g, ' ').trim();
  
  return sanitizeName(result) || originalFilename || 'document';
}

/**
 * LEGACY: Build path from old folder_structure array (backward compatibility)
 */
function buildDropboxPathLegacy(folderStructure, context) {
  if (!folderStructure || !Array.isArray(folderStructure) || folderStructure.length === 0) {
    return buildDefaultPath(context);
  }

  const sorted = [...folderStructure].sort((a, b) => (a.order || 0) - (b.order || 0));
  const parts = [];

  for (const level of sorted) {
    switch (level.type) {
      case 'fixed':
        if (level.value) parts.push(level.value);
        break;

      case 'client':
        if (context.client) {
          const format = level.format || '{number} - {name}';
          const clientPart = format
            .replace('{number}', sanitizeName(context.client.client_number || context.client.number || ''))
            .replace('{name}', sanitizeName(context.client.name || ''));
          parts.push(clientPart);
        } else {
          parts.push('_לא_משוייך');
        }
        break;

      case 'case':
        if (context.caseData) {
          const format = level.format || '{case_number}';
          const casePart = format
            .replace('{case_number}', sanitizeName(context.caseData.case_number || ''))
            .replace('{title}', sanitizeName(context.caseData.title || ''));
          parts.push(casePart);
        } else {
          parts.push('ממתין_לשיוך');
        }
        break;

      case 'document_type':
        if (context.documentType && level.mapping) {
          const folderName = level.mapping[context.documentType] || context.documentType;
          parts.push(sanitizeName(folderName));
        } else if (context.documentType) {
          parts.push(sanitizeName(context.documentType));
        }
        break;

      case 'year':
        parts.push(new Date().getFullYear().toString());
        break;

      case 'month_year': {
        const now = new Date();
        parts.push(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
        break;
      }

      case 'department':
        if (context.caseData?.department) {
          parts.push(sanitizeName(context.caseData.department));
        }
        break;
    }
  }

  if (context.subfolder) {
    parts.push(sanitizeName(context.subfolder));
  }

  return '/' + parts.join('/');
}

/**
 * DEFAULT: Canonical path structure
 */
function buildDefaultPath(context) {
  const parts = ['DWO', 'לקוחות - משרד'];

  if (context.client) {
    const num = sanitizeName(context.client.client_number || context.client.number || '');
    const name = sanitizeName(context.client.name || '');
    parts.push(`${num} - ${name}`);
  } else {
    parts.push('_לא_משוייך');
  }

  if (context.caseData) {
    parts.push(sanitizeName(context.caseData.case_number || ''));
  } else {
    parts.push('ממתין_לשיוך');
  }

  if (context.documentType) {
    parts.push(sanitizeName(context.documentType));
  }

  if (context.subfolder) {
    parts.push(sanitizeName(context.subfolder));
  }

  return '/' + parts.join('/');
}

// ========================================
// 5. ATTACHMENT DOWNLOAD
// ========================================

async function downloadAttachment(attachment, googleToken, mailGmailId) {
  // Method 1: Direct URL download (if Mail entity stores URLs)
  if (attachment.url) {
    console.log(`[UploadToDropbox] Downloading from URL: ${attachment.filename}`);
    const response = await fetch(attachment.url);
    if (!response.ok) throw new Error(`Failed to download from URL: ${response.status}`);
    return new Uint8Array(await response.arrayBuffer());
  }

  // Method 2: Gmail API download (if we have messageId + attachmentId)
  if (mailGmailId && attachment.attachmentId && googleToken) {
    console.log(`[UploadToDropbox] Downloading from Gmail API: ${attachment.filename}`);
    const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${mailGmailId}/attachments/${attachment.attachmentId}`;
    
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${googleToken}` }
    });

    if (!response.ok) throw new Error(`Gmail API error: ${response.status}`);

    const data = await response.json();
    if (!data.data) throw new Error('No attachment data from Gmail');

    // Convert base64url to Uint8Array
    const base64 = data.data.replace(/-/g, '+').replace(/_/g, '/');
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }

  throw new Error(`Cannot download attachment: ${attachment.filename || 'unknown'} - no URL or Gmail data`);
}

// ========================================
// 6. MAIN HANDLER
// ========================================

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const base44 = createClientFromRequest(req);

    const rawBody = await req.json();
    const params = rawBody.body || rawBody;
    const { 
      mailId, 
      caseId, 
      clientId, 
      documentType, 
      subfolder,
      // NEW: FolderTreeSchema parameters
      schema_id,
      path_selections,
      filename_template
    } = params;

    if (!mailId) {
      return new Response(JSON.stringify({ error: 'mailId is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`[UploadToDropbox] Starting - Mail: ${mailId}, Case: ${caseId || 'none'}, Type: ${documentType || 'other'}, Schema: ${schema_id || 'legacy'}`);

    // 1. Fetch Mail
    const mail = await base44.asServiceRole.entities.Mail.get(mailId);
    if (!mail) throw new Error(`Mail not found: ${mailId}`);

    if (!mail.attachments || mail.attachments.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        skipped: true,
        reason: 'no_attachments',
        uploaded: 0
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 2. Fetch Case & Client (if available)
    let caseData = null;
    let client = null;

    if (caseId) {
      try {
        caseData = await base44.asServiceRole.entities.Case.get(caseId);
      } catch (e) { console.warn('[UploadToDropbox] Case not found:', caseId); }
    }

    const resolvedClientId = clientId || caseData?.client_id;
    if (resolvedClientId) {
      try {
        client = await base44.asServiceRole.entities.Client.get(resolvedClientId);
      } catch (e) { console.warn('[UploadToDropbox] Client not found:', resolvedClientId); }
    }

    // 3. Get Dropbox Token + folder_structure from metadata
    const { accessToken: dropboxToken, metadata } = await getDropboxToken(base44);
    const folderStructure = metadata.folder_structure || null;

    // 4. Get Google Token (for Gmail attachment download fallback)
    let googleToken = null;
    try {
      googleToken = await getGoogleToken(base44);
    } catch (e) {
      console.warn('[UploadToDropbox] Google token not available:', e.message);
    }

    // 5. Build Path - NEW SCHEMA OR LEGACY
    let folderPath;
    let usingNewSchema = false;
    
    if (schema_id) {
      // NEW FLOW: Use FolderTreeSchema
      console.log(`[UploadToDropbox] Using new FolderTreeSchema: ${schema_id}`);
      try {
        const schema = await base44.asServiceRole.entities.FolderTreeSchema.get(schema_id);
        if (schema && schema.is_active !== false) {
          folderPath = buildPathFromSchema(schema, path_selections || {}, {
            client,
            caseData,
            mail,
            documentType: documentType || 'other',
            subfolder
          });
          usingNewSchema = true;
          console.log(`[UploadToDropbox] Schema path built: ${folderPath}`);
        } else {
          console.warn(`[UploadToDropbox] Schema ${schema_id} not found or inactive, falling back to legacy`);
        }
      } catch (schemaError) {
        console.error(`[UploadToDropbox] Failed to load schema ${schema_id}:`, schemaError.message);
      }
    }
    
    // LEGACY FALLBACK: Use old folder_structure or default path
    if (!usingNewSchema) {
      folderPath = buildDropboxPathLegacy(folderStructure, {
        client,
        caseData,
        documentType: documentType || 'other',
        subfolder
      });
    }

    console.log(`[UploadToDropbox] Target path: ${folderPath}`);

    // 6. Ensure Folder Exists
    await ensureDropboxFolder(dropboxToken, folderPath);

    // 7. Upload Each Attachment
    const results = [];
    // Gmail message ID is stored in external_id field
    const gmailMessageId = mail.external_id || mail.gmail_message_id || mail.messageId || null;
    console.log(`[UploadToDropbox] Gmail message ID: ${gmailMessageId}, Attachments count: ${mail.attachments.length}`);

    for (const attachment of mail.attachments) {
      try {
        const originalFilename = attachment.filename || attachment.name || 'unnamed';
        
        // Resolve filename - NEW TEMPLATE or LEGACY
        let filename;
        if (filename_template && usingNewSchema) {
          filename = resolveFilenameTemplate(filename_template, { client, caseData, mail }, originalFilename);
          // Preserve extension
          const ext = originalFilename.includes('.') ? originalFilename.split('.').pop() : '';
          if (ext && !filename.endsWith(`.${ext}`)) {
            filename = `${filename}.${ext}`;
          }
        } else {
          filename = sanitizeName(originalFilename);
        }

        // Download
        const fileContent = await downloadAttachment(attachment, googleToken, gmailMessageId);

        // Upload to Dropbox
        const filePath = `${folderPath}/${filename}`;
        const uploadResult = await uploadFileToDropbox(dropboxToken, filePath, fileContent);

        // Create Shared Link
        let sharedUrl = null;
        try {
          sharedUrl = await createSharedLink(dropboxToken, uploadResult.path_display);
        } catch (e) {
          console.warn('[UploadToDropbox] Shared link failed:', e.message);
        }

        // 8. Create Document Entity
        const docData = {
          name: filename,
          type: documentType || 'other',
          case_id: caseId || null,
          client_id: resolvedClientId || null,
          dropbox_path: uploadResult.path_display,
          dropbox_file_id: uploadResult.id,
          file_url: sharedUrl || '',
          file_size: uploadResult.size || 0,
          mime_type: attachment.mimeType || attachment.contentType || '',
          source_mail_id: mailId,
          folder: caseId ? 'case_documents' : 'pending_assignment',
          version: 1,
          uploaded_by: 'automation'
        };

        const document = await base44.asServiceRole.entities.Document.create(docData);

        results.push({
          filename,
          dropbox_path: uploadResult.path_display,
          shared_url: sharedUrl,
          document_id: document.id,
          status: 'success'
        });

        console.log(`[UploadToDropbox] ✅ ${filename}`);

      } catch (attachError) {
        console.error(`[UploadToDropbox] ❌ ${attachment.filename}:`, attachError.message);
        results.push({
          filename: attachment.filename || 'unknown',
          status: 'failed',
          error: attachError.message
        });
      }
    }

    // 9. If no caseId — create pending assignment task
    if (!caseId && results.some(r => r.status === 'success')) {
      try {
        await base44.asServiceRole.entities.Task.create({
          title: `מסמך ממתין לשיוך - ${mail.subject || 'ללא נושא'}`,
          description: `מסמכים מהמייל "${mail.subject}" הועלו לדרופבוקס אך לא שויכו לתיק.\nנתיב: ${folderPath}\nקבצים: ${results.filter(r => r.status === 'success').map(r => r.filename).join(', ')}`,
          status: 'pending',
          priority: 'medium',
          task_type: 'document_assignment',
          mail_id: mailId,
          client_id: resolvedClientId || null,
          extracted_data: {
            pending_documents: results.filter(r => r.status === 'success').map(r => r.document_id),
            dropbox_path: folderPath
          }
        });
        console.log('[UploadToDropbox] 📋 Created pending assignment task');
      } catch (e) {
        console.warn('[UploadToDropbox] Failed to create assignment task:', e.message);
      }
    }

    // 10. Return Results
    const successCount = results.filter(r => r.status === 'success').length;
    const failCount = results.filter(r => r.status === 'failed').length;

    console.log(`[UploadToDropbox] Done: ${successCount} success, ${failCount} failed`);

    return new Response(JSON.stringify({
      success: failCount === 0,
      uploaded: successCount,
      failed: failCount,
      results,
      dropbox_path: folderPath
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('[UploadToDropbox] Critical Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});