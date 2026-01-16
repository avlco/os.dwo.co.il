// @ts-nocheck
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// ========================================
// HELPER FUNCTIONS (Inline - No Import)
// ========================================

/**
 * מחזיר תאריך של לפני שבוע
 */
function getOneWeekAgo() {
  const date = new Date();
  date.setDate(date.getDate() - 7);
  return date.toISOString();
}

/**
 * ממיר תאריך ISO לפורמט של Gmail
 */
function formatDateForGmail(isoDate) {
  const date = new Date(isoDate);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}/${month}/${day}`;
}

/**
 * בונה שאילתת חיפוש ב-Gmail למיילים אחרי תאריך מסוים
 */
function buildDateQuery(afterDate) {
  const gmailDate = formatDateForGmail(afterDate);
  return `after:${gmailDate}`;
}

/**
 * מעדכן מטאדאטה של סנכרון
 */
async function updateSyncMetadata(connection, userBase44, updates) {
  const currentSync = connection.metadata?.gmail_sync || {};
  const updatedSync = { ...currentSync, ...updates };
  
  await userBase44.entities.IntegrationConnection.update(connection.id, {
    metadata: {
      ...connection.metadata,
      gmail_sync: updatedSync
    }
  });
}

/**
 * שולף את ה-historyId האחרון מ-Gmail
 */
async function getLatestHistoryId(accessToken) {
  try {
    const res = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/profile',
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    
    if (!res.ok) return null;
    
    const data = await res.json();
    return data.historyId || null;
  } catch (error) {
    console.error('[Helper] Failed to get historyId:', error);
    return null;
  }
}

/**
 * מפרק מייל של Gmail לאובייקט Mail
 * ✅ FIXED: Improved attachment detection
 */
function parseGmailMessage(gmailMsg) {
  const headers = gmailMsg.payload?.headers || [];
  
  const getHeader = (name) => {
    const header = headers.find(h => h.name.toLowerCase() === name.toLowerCase());
    return header?.value || '';
  };
  
  let bodyText = '';
  let bodyHtml = '';
  let hasAttachments = false;
  
  // ✅ FIXED: Recursive function to extract body AND detect attachments
  function extractBodyAndAttachments(payload) {
    // Check for attachment in current part
    if (payload.filename && payload.filename.length > 0) {
      hasAttachments = true;
    }
    
    // Or if it has an attachmentId (Gmail API marker)
    if (payload.body?.attachmentId) {
      hasAttachments = true;
    }
    
    // Extract body text/html
    if (payload.body?.data) {
      try {
        const decoded = atob(payload.body.data.replace(/-/g, '+').replace(/_/g, '/'));
        if (payload.mimeType === 'text/html') {
          bodyHtml = decoded;
        } else if (payload.mimeType === 'text/plain') {
          bodyText = decoded;
        }
      } catch (decodeError) {
        console.error('[Parse] Failed to decode body:', decodeError);
      }
    }
    
    // Recurse into nested parts
    if (payload.parts && Array.isArray(payload.parts)) {
      for (const part of payload.parts) {
        extractBodyAndAttachments(part);
      }
    }
  }
  
  extractBodyAndAttachments(gmailMsg.payload);
  
  return {
    external_id: gmailMsg.id,
    thread_id: gmailMsg.threadId,
    subject: getHeader('Subject'),
    sender_email: getHeader('From'),
    sender_name: getHeader('From').split('<')[0].trim(),
    recipient_email: getHeader('To'),
    cc: getHeader('Cc') || null,
    bcc: getHeader('Bcc') || null,
    body_text: bodyText || null,
    body_html: bodyHtml || null,
    received_at: new Date(parseInt(gmailMsg.internalDate)).toISOString(),
    labels: gmailMsg.labelIds ? gmailMsg.labelIds.join(',') : null,
    is_read: !gmailMsg.labelIds?.includes('UNREAD'),
    has_attachments: hasAttachments,  // ✅ Now correctly detected
    raw_headers: JSON.stringify(headers)
  };
}

// ========================================
// CRYPTO FUNCTIONS
// ========================================

function getProviderConfig(providerRaw) {
    const provider = providerRaw.toLowerCase().trim();
    if (provider === 'google') {
        const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
        const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
        if (!clientId || !clientSecret) throw new Error("Missing GOOGLE env vars");
        return { clientId, clientSecret, type: 'google' };
    }
    throw new Error(`Unknown provider: ${providerRaw}`);
}

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
    try {
        const key = await getCryptoKey();
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encoded = new TextEncoder().encode(text);
        const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
        const ivHex = Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join('');
        const encryptedHex = Array.from(new Uint8Array(encrypted)).map(b => b.toString(16).padStart(2, '0')).join('');
        return `${ivHex}:${encryptedHex}`;
    } catch (e) {
        console.error("[Encryption] Failed:", e);
        throw new Error(`Encryption failed: ${e.message}`);
    }
}

async function refreshGoogleToken(refreshToken, connection, userBase44) {
  const config = getProviderConfig('google');
  
  console.log("[Refresh] Refreshing access token...");
  
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }).toString(),
  });
  
  const data = await res.json();
  if (data.error) {
    console.error("[Refresh] Failed:", JSON.stringify(data));
    throw new Error(`Token refresh failed: ${JSON.stringify(data)}`);
  }
  
  const newAccessToken = data.access_token;
  const encryptedAccess = await encrypt(newAccessToken);
  const expiresAt = Date.now() + ((data.expires_in || 3600) * 1000);
  
  await userBase44.entities.IntegrationConnection.update(connection.id, {
    access_token_encrypted: encryptedAccess,
    expires_at: expiresAt,
    is_active: true,
    metadata: { 
      ...connection.metadata,
      last_updated: new Date().toISOString(), 
      last_refresh: "success" 
    }
  });
  
  console.log("[Refresh] ✅ Token refreshed successfully");
  return newAccessToken;
}

// ========================================
// SYNC FUNCTIONS
// ========================================

/**
 * סנכרון ראשון: משיכת מיילים משבוע אחרון בלבד
 */
async function fetchFirstWeekMessages(
  accessToken,
  refreshToken,
  connection,
  userBase44
) {
  console.log('[Sync] 🎯 FIRST SYNC - Fetching messages from last 7 days');
  
  const oneWeekAgo = getOneWeekAgo();
  const query = buildDateQuery(oneWeekAgo);
  
  console.log(`[Sync] Query: "${query}" (from ${oneWeekAgo})`);
  
  const listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=500`;
  
  let currentToken = accessToken;
  let listRes = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${currentToken}` }
  });
  
  // Token refresh if needed
  if (listRes.status === 401) {
    if (!refreshToken || refreshToken === "MISSING") {
      throw new Error("Token expired and no refresh token available");
    }
    
    console.log("[Gmail] Token expired during first sync, refreshing...");
    currentToken = await refreshGoogleToken(refreshToken, connection, userBase44);
    
    listRes = await fetch(listUrl, {
      headers: { Authorization: `Bearer ${currentToken}` }
    });
  }
  
  const listData = await listRes.json();
  
  if (!listData.messages || listData.messages.length === 0) {
    console.log('[Sync] ℹ️ No messages found in last 7 days');
    
    const latestHistoryId = await getLatestHistoryId(currentToken);
    if (latestHistoryId) {
      await updateSyncMetadata(connection, userBase44, {
        history_id: latestHistoryId,
        last_sync_timestamp: Date.now(),
        total_synced: 0,
        sync_mode: 'first_week_empty'
      });
    }
    
    return [];
  }
  
  console.log(`[Sync] 📧 Found ${listData.messages.length} messages in last 7 days`);
  
  const emails = [];
  for (let i = 0; i < listData.messages.length; i++) {
    const msg = listData.messages[i];
    
    try {
      const detailRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
        { headers: { Authorization: `Bearer ${currentToken}` } }
      );
      
      if (!detailRes.ok) {
        console.error(`[Sync] ❌ Failed to fetch message ${msg.id}: ${detailRes.status}`);
        continue;
      }
      
      const detailData = await detailRes.json();
      const parsedMail = parseGmailMessage(detailData);
      emails.push(parsedMail);
      
      if ((i + 1) % 50 === 0) {
        console.log(`[Sync] Progress: ${i + 1}/${listData.messages.length} messages processed`);
      }
      
    } catch (error) {
      console.error(`[Sync] ❌ Error processing message ${msg.id}:`, error);
    }
  }
  
  const latestHistoryId = await getLatestHistoryId(currentToken);
  if (latestHistoryId) {
    await updateSyncMetadata(connection, userBase44, {
      history_id: latestHistoryId,
      last_sync_timestamp: Date.now(),
      total_synced: emails.length,
      sync_mode: 'first_week_complete'
    });
  }
  
  console.log(`[Sync] ✅ First sync complete: ${emails.length} messages from last 7 days`);
  return emails;
}

/**
 * סנכרון אינקרמנטלי: משיכת רק מיילים חדשים מאז הפעם האחרונה
 */
async function fetchIncrementalMessages(
  accessToken,
  refreshToken,
  connection,
  userBase44
) {
  const gmailSync = connection.metadata?.gmail_sync;
  const startHistoryId = gmailSync?.history_id;
  
  if (!startHistoryId) {
    console.log('[Sync] ⚠️ No historyId found - falling back to first sync');
    return await fetchFirstWeekMessages(accessToken, refreshToken, connection, userBase44);
  }
  
  console.log(`[Sync] 🔄 INCREMENTAL SYNC - starting from historyId: ${startHistoryId}`);
  
  try {
    const historyUrl = `https://gmail.googleapis.com/gmail/v1/users/me/history?startHistoryId=${startHistoryId}&historyTypes=messageAdded&maxResults=100`;
    
    let currentToken = accessToken;
    let historyRes = await fetch(historyUrl, {
      headers: { Authorization: `Bearer ${currentToken}` }
    });
    
    if (historyRes.status === 401) {
      console.log("[Sync] Token expired, refreshing...");
      currentToken = await refreshGoogleToken(refreshToken, connection, userBase44);
      historyRes = await fetch(historyUrl, {
        headers: { Authorization: `Bearer ${currentToken}` }
      });
    }
    
    if (historyRes.status === 404) {
      console.warn('[Sync] ⚠️ HistoryId expired (404) - falling back to recent messages');
      return await fetchFallbackMessages(accessToken, refreshToken, connection, userBase44, 100);
    }
    
    const historyData = await historyRes.json();
    
    if (!historyData.history || historyData.history.length === 0) {
      console.log('[Sync] ✨ No new messages since last sync');
      
      await updateSyncMetadata(connection, userBase44, {
        last_sync_timestamp: Date.now(),
        sync_mode: 'incremental_no_changes'
      });
      
      return [];
    }
    
    console.log(`[Sync] 📬 Found ${historyData.history.length} history records with new messages`);
    
    const newMessageIds = [];
    for (const record of historyData.history) {
      if (record.messagesAdded) {
        for (const added of record.messagesAdded) {
          newMessageIds.push(added.message.id);
        }
      }
    }
    
    console.log(`[Sync] 📥 Processing ${newMessageIds.length} new message(s)`);
    
    const newMessages = [];
    for (let i = 0; i < newMessageIds.length; i++) {
      const messageId = newMessageIds[i];
      
      try {
        const detailRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
          { headers: { Authorization: `Bearer ${currentToken}` } }
        );
        
        if (!detailRes.ok) {
          console.error(`[Sync] ❌ Failed to fetch message ${messageId}: ${detailRes.status}`);
          continue;
        }
        
        const detailData = await detailRes.json();
        const parsedMail = parseGmailMessage(detailData);
        newMessages.push(parsedMail);
        
        if ((i + 1) % 10 === 0) {
          console.log(`[Sync] Progress: ${i + 1}/${newMessageIds.length} new messages processed`);
        }
        
      } catch (error) {
        console.error(`[Sync] ❌ Error processing message ${messageId}:`, error);
      }
    }
    
    const latestHistoryId = historyData.historyId;
    await updateSyncMetadata(connection, userBase44, {
      history_id: latestHistoryId,
      last_sync_timestamp: Date.now(),
      total_synced: (gmailSync?.total_synced || 0) + newMessages.length,
      sync_mode: 'incremental_success'
    });
    
    console.log(`[Sync] ✅ Incremental sync complete: ${newMessages.length} new message(s)`);
    return newMessages;
    
  } catch (error) {
    console.error('[Sync] ❌ Incremental sync failed:', error);
    console.log('[Sync] 🔄 Falling back to recent messages fetch');
    return await fetchFallbackMessages(accessToken, refreshToken, connection, userBase44, 100);
  }
}

/**
 * Fallback: משיכת X מיילים אחרונים
 */
async function fetchFallbackMessages(
  accessToken,
  refreshToken,
  connection,
  userBase44,
  maxResults = 100
) {
  console.log(`[Sync] 🔄 FALLBACK - Fetching last ${maxResults} messages`);
  
  const listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}`;
  
  let currentToken = accessToken;
  let listRes = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${currentToken}` }
  });
  
  if (listRes.status === 401) {
    console.log("[Sync] Token expired during fallback, refreshing...");
    currentToken = await refreshGoogleToken(refreshToken, connection, userBase44);
    listRes = await fetch(listUrl, {
      headers: { Authorization: `Bearer ${currentToken}` }
    });
  }
  
  const listData = await listRes.json();
  
  if (!listData.messages || listData.messages.length === 0) {
    console.log('[Sync] ℹ️ No messages found in fallback');
    return [];
  }
  
  console.log(`[Sync] 📧 Found ${listData.messages.length} messages in fallback`);
  
  const emails = [];
  for (let i = 0; i < listData.messages.length; i++) {
    const msg = listData.messages[i];
    
    try {
      const detailRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
        { headers: { Authorization: `Bearer ${currentToken}` } }
      );
      
      if (!detailRes.ok) continue;
      
      const detailData = await detailRes.json();
      const parsedMail = parseGmailMessage(detailData);
      emails.push(parsedMail);
      
      if ((i + 1) % 25 === 0) {
        console.log(`[Sync] Fallback progress: ${i + 1}/${listData.messages.length}`);
      }
      
    } catch (error) {
      console.error(`[Sync] Error in fallback for ${msg.id}:`, error);
    }
  }
  
  const latestHistoryId = await getLatestHistoryId(currentToken);
  if (latestHistoryId) {
    await updateSyncMetadata(connection, userBase44, {
      history_id: latestHistoryId,
      last_sync_timestamp: Date.now(),
      total_synced: emails.length,
      sync_mode: 'fallback_complete'
    });
  }
  
  console.log(`[Sync] ✅ Fallback complete: ${emails.length} messages`);
  return emails;
}

// ========================================
// MAIN HANDLER
// ========================================

Deno.serve(async (req) => {
  const headers = { 
    "Access-Control-Allow-Origin": "*", 
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Content-Type": "application/json"
  };
  
  if (req.method === "OPTIONS") {
    return new Response(null, { headers });
  }

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }), 
        { status: 401, headers }
      );
    }

    console.log(`[Sync] 🚀 Starting mail sync for user: ${user.email || user.id}`);

    const allConnections = await base44.entities.IntegrationConnection.list('-created_at', 100);
    const items = Array.isArray(allConnections) ? allConnections : (allConnections.data || []);
    const connection = items.find(c => c.provider === 'google' && c.is_active !== false);
    
    if (!connection) {
      console.log('[Sync] ❌ No active Google connection found');
      return new Response(
        JSON.stringify({ 
          error: 'Google connection not found. Please connect via Settings.',
          code: 'NO_CONNECTION'
        }), 
        { status: 404, headers }
      );
    }

    const accessToken = await decrypt(connection.access_token_encrypted);
    const refreshToken = connection.refresh_token_encrypted 
      ? await decrypt(connection.refresh_token_encrypted) 
      : null;
    
    if (!accessToken) {
      throw new Error("Failed to decrypt access token");
    }

    let newEmails;
    const gmailSync = connection.metadata?.gmail_sync;
    
    if (!gmailSync || !gmailSync.history_id) {
      console.log('[Sync] 📍 First sync detected - using date-based fetch (last 7 days)');
      newEmails = await fetchFirstWeekMessages(accessToken, refreshToken, connection, base44);
    } else {
      console.log('[Sync] 🔄 Regular sync - using incremental History API');
      newEmails = await fetchIncrementalMessages(accessToken, refreshToken, connection, base44);
    }

    console.log(`[Sync] 📊 Fetched ${newEmails.length} message(s) from Gmail`);

    const allExistingMails = await base44.entities.Mail.list('-received_at', 2000);
    const existingMailItems = Array.isArray(allExistingMails) 
      ? allExistingMails 
      : (allExistingMails.data || []);
    
    const existingIds = new Set(existingMailItems.map(m => m.external_id));
    console.log(`[Sync] 📋 Found ${existingIds.size} existing mails in database`);

    let savedCount = 0;
    for (const mail of newEmails) {
      if (!existingIds.has(mail.external_id)) {
        try {
          await base44.entities.Mail.create({ 
            ...mail, 
            user_id: user.id 
          });
          savedCount++;
        } catch (createError) {
          console.error(`[Sync] ❌ Failed to save mail ${mail.external_id}:`, createError.message);
        }
      } else {
        console.log(`[Sync] ⏭️ Skipping duplicate: ${mail.external_id}`);
      }
    }

    const syncMode = gmailSync?.sync_mode || 'unknown';
    console.log(`[Sync] ✅ COMPLETE - Saved ${savedCount} new mail(s) | Mode: ${syncMode}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        synced: savedCount,
        fetched: newEmails.length,
        sync_mode: syncMode,
        existing_in_db: existingMailItems.length
      }), 
      { status: 200, headers }
    );

  } catch (err) {
    console.error("[Sync] ❌ ERROR:", err);
    return new Response(
      JSON.stringify({ 
        error: err.message || String(err),
        stack: err.stack 
      }), 
      { status: 500, headers }
    );
  }
});
