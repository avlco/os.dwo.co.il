import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// --- Crypto helpers (same as integrationAuth) ---
async function getCryptoKey() {
  const keyString = Deno.env.get("ENCRYPTION_KEY");
  if (!keyString) {
    throw new Error("Missing ENCRYPTION_KEY");
  }
  const encoder = new TextEncoder();
  const keyBuffer = encoder.encode(keyString.padEnd(32, '0').slice(0, 32));
  return await crypto.subtle.importKey("raw", keyBuffer, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function decrypt(text) {
  const [ivHex, encryptedHex] = text.split(':');
  if (!ivHex || !encryptedHex) throw new Error("Invalid encrypted format");
  const key = await getCryptoKey();
  const iv = new Uint8Array(ivHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
  const encrypted = new Uint8Array(encryptedHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, encrypted);
  return new TextDecoder().decode(decrypted);
}

// --- Token refresh ---
async function refreshGoogleToken(refreshToken) {
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    }).toString()
  });
  
  const data = await res.json();
  if (data.error) {
    throw new Error(`Token refresh failed: ${data.error_description || data.error}`);
  }
  return data.access_token;
}

// --- Get valid access token ---
async function getValidAccessToken(connection, base44) {
  let accessToken = await decrypt(connection.access_token_encrypted || connection.access_token);
  
  // Check if token expired
  if (connection.expires_at && Date.now() > connection.expires_at) {
    console.log("Token expired, refreshing...");
    const refreshToken = await decrypt(connection.refresh_token_encrypted || connection.refresh_token);
    accessToken = await refreshGoogleToken(refreshToken);
    
    // Note: We should update the stored token here, but for simplicity we'll just use the new one
  }
  
  return accessToken;
}

// --- Parse email headers ---
function getHeader(headers, name) {
  const header = headers?.find(h => h.name?.toLowerCase() === name.toLowerCase());
  return header?.value || '';
}

// --- Parse email address ---
function parseEmailAddress(str) {
  if (!str) return { email: '', name: '' };
  const match = str.match(/^(.+?)\s*<(.+?)>$/);
  if (match) {
    return { name: match[1].trim(), email: match[2].trim() };
  }
  return { email: str.trim(), name: '' };
}

// --- Decode base64url ---
function decodeBase64Url(str) {
  if (!str) return '';
  try {
    const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    return decodeURIComponent(escape(atob(base64)));
  } catch (e) {
    console.error('Error decoding base64:', e);
    return '';
  }
}

// --- Extract body from message parts ---
function extractBody(payload) {
  let plain = '';
  let html = '';
  
  function processPart(part) {
    if (part.mimeType === 'text/plain' && part.body?.data) {
      plain = decodeBase64Url(part.body.data);
    } else if (part.mimeType === 'text/html' && part.body?.data) {
      html = decodeBase64Url(part.body.data);
    }
    if (part.parts) {
      part.parts.forEach(processPart);
    }
  }
  
  if (payload.body?.data) {
    if (payload.mimeType === 'text/plain') {
      plain = decodeBase64Url(payload.body.data);
    } else if (payload.mimeType === 'text/html') {
      html = decodeBase64Url(payload.body.data);
    }
  }
  
  if (payload.parts) {
    payload.parts.forEach(processPart);
  }
  
  return { plain, html };
}

// --- Extract attachments info ---
function extractAttachments(payload, messageId) {
  const attachments = [];
  
  function processPart(part) {
    if (part.filename && part.body?.attachmentId) {
      attachments.push({
        filename: part.filename,
        size: part.body.size || 0,
        mimeType: part.mimeType,
        attachmentId: part.body.attachmentId,
        messageId: messageId
      });
    }
    if (part.parts) {
      part.parts.forEach(processPart);
    }
  }
  
  if (payload.parts) {
    payload.parts.forEach(processPart);
  }
  
  return attachments;
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

    // Get request params
    const body = await req.json().catch(() => ({}));
    const maxResults = body.maxResults || 20;

    // Find Google connection for current user
    const connections = await base44.asServiceRole.entities.IntegrationConnection.filter({ 
      user_id: user.id, 
      provider: 'google' 
    });

    if (!connections || connections.length === 0) {
      return new Response(JSON.stringify({ 
        error: 'Google not connected', 
        message: 'אנא חבר את חשבון Google שלך בהגדרות' 
      }), { status: 400, headers });
    }

    const connection = connections[0];
    const accessToken = await getValidAccessToken(connection, base44);

    // Fetch messages list from Gmail
    const listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}&labelIds=INBOX`;
    const listRes = await fetch(listUrl, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (!listRes.ok) {
      const errorData = await listRes.json();
      console.error("Gmail API error:", errorData);
      return new Response(JSON.stringify({ 
        error: 'Gmail API error', 
        details: errorData 
      }), { status: listRes.status, headers });
    }

    const listData = await listRes.json();
    const messages = listData.messages || [];

    if (messages.length === 0) {
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'No messages found',
        imported: 0 
      }), { status: 200, headers });
    }

    // Get existing message IDs to avoid duplicates
    const existingMails = await base44.asServiceRole.entities.Mail.list('-created_date', 500);
    const existingMessageIds = new Set(existingMails.map(m => m.message_id).filter(Boolean));

    let imported = 0;
    let skipped = 0;

    // Fetch each message details
    for (const msg of messages) {
      // Skip if already imported
      if (existingMessageIds.has(msg.id)) {
        skipped++;
        continue;
      }

      // Get full message
      const msgUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`;
      const msgRes = await fetch(msgUrl, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });

      if (!msgRes.ok) {
        console.error(`Failed to fetch message ${msg.id}`);
        continue;
      }

      const msgData = await msgRes.json();
      const msgHeaders = msgData.payload?.headers || [];

      // Parse message data
      const subject = getHeader(msgHeaders, 'Subject') || '(ללא נושא)';
      const fromStr = getHeader(msgHeaders, 'From');
      const { email: senderEmail, name: senderName } = parseEmailAddress(fromStr);
      const dateStr = getHeader(msgHeaders, 'Date');
      const toStr = getHeader(msgHeaders, 'To');
      const ccStr = getHeader(msgHeaders, 'Cc');

      // Parse recipients
      const recipients = [];
      if (toStr) {
        toStr.split(',').forEach(r => {
          const parsed = parseEmailAddress(r.trim());
          if (parsed.email) recipients.push({ ...parsed, type: 'to' });
        });
      }
      if (ccStr) {
        ccStr.split(',').forEach(r => {
          const parsed = parseEmailAddress(r.trim());
          if (parsed.email) recipients.push({ ...parsed, type: 'cc' });
        });
      }

      // Extract body
      const { plain, html } = extractBody(msgData.payload);

      // Extract attachments info
      const attachments = extractAttachments(msgData.payload, msg.id);

      // Create mail record
      const mailData = {
        message_id: msg.id,
        subject: subject,
        sender_email: senderEmail,
        sender_name: senderName,
        recipients: recipients,
        body_plain: plain.substring(0, 50000), // Limit size
        body_html: html.substring(0, 100000),
        received_at: dateStr ? new Date(dateStr).toISOString() : new Date().toISOString(),
        processing_status: 'pending',
        priority: 'medium',
        is_spam: false,
        is_archived: false,
        attachments: attachments.map(a => ({
          filename: a.filename,
          size: a.size,
          url: '' // Would need separate download
        }))
      };

      await base44.asServiceRole.entities.Mail.create(mailData);
      imported++;
    }

    return new Response(JSON.stringify({ 
      success: true, 
      imported,
      skipped,
      total: messages.length,
      message: `יובאו ${imported} מיילים חדשים` 
    }), { status: 200, headers });

  } catch (err) {
    console.error("Function Error:", err);
    return new Response(JSON.stringify({ error: err.message || String(err) }), { status: 500, headers });
  }
});