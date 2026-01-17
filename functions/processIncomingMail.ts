// @ts-nocheck
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

// ========================================
// HELPER FUNCTIONS
// ========================================

function getOneWeekAgo() {
  const date = new Date();
  date.setDate(date.getDate() - 7);
  return date.toISOString();
}

function formatDateForGmail(isoDate) {
  const date = new Date(isoDate);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}/${month}/${day}`;
}

function buildDateQuery(afterDate) {
  const gmailDate = formatDateForGmail(afterDate);
  return `after:${gmailDate}`;
}

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

function decodeBase64Utf8(base64String) {
  try {
    const normalized = base64String.replace(/-/g, '+').replace(/_/g, '/');
    const binaryString = atob(normalized);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return new TextDecoder('utf-8').decode(bytes);
  } catch (error) {
    console.error('[Decode] Failed:', error);
    return null;
  }
}

function parseGmailMessage(gmailMsg) {
  const headers = gmailMsg.payload?.headers || [];
  
  const getHeader = (name) => {
    const header = headers.find(h => h.name.toLowerCase() === name.toLowerCase());
    return header?.value || '';
  };
  
  let bodyText = '';
  let bodyHtml = '';
  const attachments = [];
  
  function extractParts(payload, messageId) {
    if (payload.filename && payload.filename.length > 0) {
      if (payload.body?.attachmentId) {
        attachments.push({
          filename: payload.filename,
          mimeType: payload.mimeType || 'application/octet-stream',
          size: payload.body.size || 0,
          attachmentId: payload.body.attachmentId,
          messageId: messageId
        });
      }
    }
    
    if (payload.body?.data) {
      const decoded = decodeBase64Utf8(payload.body.data);
      
      if (decoded) {
        if (payload.mimeType === 'text/html') {
          bodyHtml = decoded;
        } else if (payload.mimeType === 'text/plain') {
          bodyText = decoded;
        }
      }
    }
    
    if (payload.parts && Array.isArray(payload.parts)) {
      for (const part of payload.parts) {
        extractParts(part, messageId);
      }
    }
  }
  
  extractParts(gmailMsg.payload, gmailMsg.id);
  
  let snippet = bodyText || '';
  if (!snippet && bodyHtml) {
    snippet = bodyHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  snippet = snippet.substring(0, 150);
  
  const toHeader = getHeader('To');
  const recipients = toHeader 
    ? toHeader.split(',').map(r => ({ email: r.trim() }))
    : [];
  
  const labels = gmailMsg.labelIds || [];
  
  return {
    external_id: gmailMsg.id,
    subject: getHeader('Subject'),
    sender_email: getHeader('From'),
    sender_name: getHeader('From').split('<')[0].trim(),
    recipients: recipients,
    received_at: new Date(parseInt(gmailMsg.internalDate)).toISOString(),
    content_snippet: snippet || null,
    body_plain: bodyText || null,
    body_html: bodyHtml || null,
    processing_status: 'pending',
    source: 'gmail',
    attachments: attachments,
    metadata: {
      labels: labels,
      thread_id: gmailMsg.threadId,
      is_read: !labels.includes('UNREAD'),
      raw_headers: JSON.stringify(headers)
    },
    thread_id: gmailMsg.threadId,
    has_attachments: attachments.length > 0
  };
}

// ========================================
// 🆕 RULE MATCHING LOGIC
// ========================================

/**
 * מוצא חוקי אוטומציה תואמים למייל
 * @param {Object} mail - אובייקט המייל
 * @param {Object} base44 - Base44 client
 * @returns {Array} רשימת חוקים תואמים
 */
async function findMatchingRules(mail, base44) {
  console.log(`[RuleMatcher] 🔍 Checking rules for mail: ${mail.subject}`);
  
  try {
    // שלוף את כל החוקים הפעילים
    const allRules = await base44.entities.AutomationRule.list('-created_date', 100);
    const rulesArray = Array.isArray(allRules) ? allRules : (allRules.data || []);
    const activeRules = rulesArray.filter(rule => rule.is_active === true);
    
    console.log(`[RuleMatcher] 📋 Found ${activeRules.length} active rules to check`);
    
    if (activeRules.length === 0) {
      console.log('[RuleMatcher] ⚠️ No active rules found in system');
      return [];
    }
    
    const matchingRules = [];
    
    for (const rule of activeRules) {
      const config = rule.catch_config || {};
      let isMatch = true;
      const reasons = [];
      
      // בדיקה 1: שולח (sender)
      if (config.senders && Array.isArray(config.senders) && config.senders.length > 0) {
        const senderMatches = config.senders.some(sender => {
          const senderLower = sender.toLowerCase().trim();
          const mailSenderLower = (mail.sender_email || '').toLowerCase();
          
          // תומך גם בכתובת מלאה או חלקית
          return mailSenderLower.includes(senderLower) || senderLower.includes(mailSenderLower);
        });
        
        if (!senderMatches) {
          isMatch = false;
          reasons.push(`sender mismatch (expected: ${config.senders.join(', ')})`);
        } else {
          reasons.push('✓ sender match');
        }
      }
      
      // בדיקה 2: נושא (subject)
      if (config.subject_contains && config.subject_contains.trim().length > 0) {
        const subjectKeyword = config.subject_contains.toLowerCase().trim();
        const mailSubject = (mail.subject || '').toLowerCase();
        
        if (!mailSubject.includes(subjectKeyword)) {
          isMatch = false;
          reasons.push(`subject mismatch (looking for: "${config.subject_contains}")`);
        } else {
          reasons.push('✓ subject match');
        }
      }
      
      // בדיקה 3: גוף המייל (body)
      if (config.body_contains && config.body_contains.trim().length > 0) {
        const bodyKeyword = config.body_contains.toLowerCase().trim();
        const mailBody = (mail.body_plain || mail.body_html || '').toLowerCase();
        
        if (!mailBody.includes(bodyKeyword)) {
          isMatch = false;
          reasons.push(`body mismatch (looking for: "${config.body_contains}")`);
        } else {
          reasons.push('✓ body match');
        }
      }
      
      // אם כל הבדיקות עברו
      if (isMatch) {
        console.log(`[RuleMatcher] ✅ Rule "${rule.name}" MATCHED: ${reasons.join(', ')}`);
        matchingRules.push(rule);
      } else {
        console.log(`[RuleMatcher] ❌ Rule "${rule.name}" rejected: ${reasons.join(', ')}`);
      }
    }
    
    console.log(`[RuleMatcher] 🎯 Total matching rules: ${matchingRules.length}`);
    return matchingRules;
    
  } catch (error) {
    console.error('[RuleMatcher] ❌ Error finding matching rules:', error);
    return [];
  }
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

async function fetchFirstWeekMessages(accessToken, refreshToken, connection, userBase44) {
  console.log('[Sync] 🎯 FIRST SYNC - Fetching messages from last 7 days');
  
  const oneWeekAgo = getOneWeekAgo();
  const query = buildDateQuery(oneWeekAgo);
  
  console.log(`[Sync] Query: "${query}" (from ${oneWeekAgo})`);
  
  const listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=500`;
  
  let currentToken = accessToken;
  let listRes = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${currentToken}` }
  });
  
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

async function fetchIncrementalMessages(accessToken, refreshToken, connection, userBase44) {
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

async function fetchFallbackMessages(accessToken, refreshToken, connection, userBase44, maxResults = 100) {
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

    const savedMails = [];
    for (const mail of newEmails) {
      if (!existingIds.has(mail.external_id)) {
        try {
          const created = await base44.entities.Mail.create({ 
            ...mail, 
            user_id: user.id 
          });
          savedMails.push(created);
        } catch (createError) {
          console.error(`[Sync] ❌ Failed to save mail ${mail.external_id}:`, createError.message);
        }
      } else {
        console.log(`[Sync] ⏭️ Skipping duplicate: ${mail.external_id}`);
      }
    }

    console.log(`[Automation] 🤖 Starting automation processing for ${savedMails.length} new mails`);

    // 🆕 לוגיקה חדשה: מצא חוקים תואמים והפעל אותם
    let totalRulesExecuted = 0;
    let totalRulesSuccess = 0;
    let totalRulesFailed = 0;

    for (const mail of savedMails) {
      try {
        console.log(`\n[Automation] 📧 Processing mail ID ${mail.id}: "${mail.subject}"`);
        
        // מצא חוקים תואמים
        const matchingRules = await findMatchingRules(mail, base44);
        
        if (matchingRules.length === 0) {
          console.log(`[Automation] ⚠️ No matching rules for mail ${mail.id}`);
          continue;
        }
        
        console.log(`[Automation] 🎯 Found ${matchingRules.length} matching rule(s) for mail ${mail.id}`);
        
        // הפעל כל חוק תואם
        for (const rule of matchingRules) {
          try {
            console.log(`[Automation] ▶️ Executing rule "${rule.name}" (ID: ${rule.id}) on mail ${mail.id}`);
            
            const automationResponse = await fetch(`${supabaseUrl}/functions/v1/executeAutomationRule`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseServiceKey}`
              },
              body: JSON.stringify({ 
                mailId: mail.id,  // 🆕 שינוי מ-mail_id ל-mailId
                ruleId: rule.id   // 🆕 הוספת ruleId
              })
            });
            
            totalRulesExecuted++;
            
            if (!automationResponse.ok) {
              const errorText = await automationResponse.text();
              console.error(`[Automation] ❌ Rule "${rule.name}" failed for mail ${mail.id}: ${errorText}`);
              totalRulesFailed++;
            } else {
              const result = await automationResponse.json();
              console.log(`[Automation] ✅ Rule "${rule.name}" executed successfully:`, JSON.stringify(result));
              totalRulesSuccess++;
            }
            
          } catch (ruleError) {
            console.error(`[Automation] ❌ Exception executing rule "${rule.name}" on mail ${mail.id}:`, ruleError);
            totalRulesFailed++;
          }
        }
        
      } catch (error) {
        console.error(`[Automation] ❌ Failed to process automation for mail ${mail.id}:`, error);
      }
    }

    console.log(`\n[Automation] 📊 Automation Summary:`);
    console.log(`  - New mails processed: ${savedMails.length}`);
    console.log(`  - Rules executed: ${totalRulesExecuted}`);
    console.log(`  - Successful: ${totalRulesSuccess}`);
    console.log(`  - Failed: ${totalRulesFailed}`);

    const syncMode = gmailSync?.sync_mode || 'unknown';
    console.log(`[Sync] ✅ COMPLETE - Saved ${savedMails.length} new mail(s) | Mode: ${syncMode}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        synced: savedMails.length,
        fetched: newEmails.length,
        sync_mode: syncMode,
        existing_in_db: existingMailItems.length,
        automation: {
          rules_executed: totalRulesExecuted,
          success: totalRulesSuccess,
          failed: totalRulesFailed
        }
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
