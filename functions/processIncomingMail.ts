// @ts-nocheck
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ========================================
// 1. HELPER FUNCTIONS (Crypto & Parsing)
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
    return null; 
  }
}

function parseGmailMessage(gmailMsg) {
  const headers = gmailMsg.payload?.headers || [];
  const getHeader = (name) => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';
  
  let bodyText = '';
  let bodyHtml = '';
  const attachments = [];
  
  function extractParts(payload, messageId) {
    if (payload.filename && payload.body?.attachmentId) {
      attachments.push({
        filename: payload.filename,
        mimeType: payload.mimeType || 'application/octet-stream',
        size: payload.body.size || 0,
        attachmentId: payload.body.attachmentId,
        messageId: messageId
      });
    }
    
    if (payload.body?.data) {
      const decoded = decodeBase64Utf8(payload.body.data);
      if (decoded) {
        if (payload.mimeType === 'text/html') bodyHtml = decoded;
        else if (payload.mimeType === 'text/plain') bodyText = decoded;
      }
    }
    
    if (payload.parts && Array.isArray(payload.parts)) {
      payload.parts.forEach(p => extractParts(p, messageId));
    }
  }
  
  extractParts(gmailMsg.payload, gmailMsg.id);
  
  let snippet = bodyText || '';
  if (!snippet && bodyHtml) snippet = bodyHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  
  return {
    external_id: gmailMsg.id,
    subject: getHeader('Subject'),
    sender_email: getHeader('From'),
    sender_name: getHeader('From').split('<')[0].trim(),
    recipients: (getHeader('To') || '').split(',').map(r => ({ email: r.trim() })),
    received_at: new Date(parseInt(gmailMsg.internalDate)).toISOString(),
    content_snippet: snippet.substring(0, 150),
    body_plain: bodyText || null,
    body_html: bodyHtml || null,
    processing_status: 'pending',
    source: 'gmail',
    attachments: attachments,
    thread_id: gmailMsg.threadId,
    has_attachments: attachments.length > 0
  };
}

// ========================================
// 2. GMAIL API INTERACTIONS
// ========================================

async function refreshGoogleToken(refreshToken, connection, base44) {
  console.log("[Sync] 🔄 Refreshing Google Token...");
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }).toString(),
  });
  
  const data = await res.json();
  if (data.error) throw new Error(`Token refresh failed: ${JSON.stringify(data)}`);
  
  return data.access_token;
}

// ========================================
// 3. CORE SYNC LOGIC (SYNCHRONOUS EXECUTION)
// ========================================

async function executeSync(base44, user) {
  console.log(`[Sync] 🚀 Starting Sync for user ${user.id}`);
  let syncedCount = 0;

  try {
    // A. GET CONNECTION (ROBUST LOOKUP)
    // Fetch 50 items to ensure we find the connection even if list is cluttered
    const connectionsRes = await base44.entities.IntegrationConnection.list('-created_at', 50);
    const connections = connectionsRes.data || connectionsRes;
    
    // Case-insensitive search for 'google'
    const connection = connections.find(c => 
      c.provider && 
      c.provider.toLowerCase() === 'google' && 
      c.is_active !== false
    );
    
    if (!connection) {
      console.log("[Sync] ❌ No active Google connection found.");
      return 0;
    }

    let accessToken = await decrypt(connection.access_token_encrypted);
    const refreshToken = connection.refresh_token_encrypted ? await decrypt(connection.refresh_token_encrypted) : null;

    // B. DETERMINE QUERY (SMART SYNC)
    const lastMails = await base44.entities.Mail.list('-received_at', 1);
    const lastMail = (lastMails.data || lastMails)[0];

    let query = '';
    
    if (!lastMail) {
      // First Sync: Last 24 hours
      const oneDayAgo = Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000);
      query = `after:${oneDayAgo}`;
      console.log(`[Sync] 🆕 First Sync. Query: ${query}`);
    } else {
      // Delta Sync: Last mail time minus 10 minutes overlap
      const bufferMinutes = 10; 
      const lastTime = Math.floor((new Date(lastMail.received_at).getTime() - (bufferMinutes * 60 * 1000)) / 1000);
      query = `after:${lastTime}`;
      console.log(`[Sync] 🔄 Delta Sync. Query: ${query}`);
    }

    // C. FETCH FROM GMAIL
    // Limited to 20 to prevent timeouts in synchronous mode
    let listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=20`;
    
    let listRes = await fetch(listUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
    
    // Handle Token Expiry
    if (listRes.status === 401 && refreshToken) {
      accessToken = await refreshGoogleToken(refreshToken, connection, base44);
      listRes = await fetch(listUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
    }

    const listData = await listRes.json();
    if (!listData.messages || listData.messages.length === 0) {
      console.log("[Sync] ✨ No new messages.");
      return 0;
    }

    console.log(`[Sync] 📥 Fetching details for ${listData.messages.length} messages...`);

    // D. SAVE EMAILS
    const savedMails = [];
    // Check duplicates
    const existingMailsList = await base44.entities.Mail.list('-received_at', 100); 
    const existingIds = new Set((existingMailsList.data || existingMailsList).map(m => m.external_id));

    for (const msg of listData.messages) {
      if (existingIds.has(msg.id)) continue; 

      try {
        const detailRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        
        if (!detailRes.ok) continue;

        const detailData = await detailRes.json();
        const parsed = parseGmailMessage(detailData);
        
        const created = await base44.entities.Mail.create({ ...parsed, user_id: user.id });
        savedMails.push(created);
      } catch (e) {
        console.error(`[Sync] Error saving mail ${msg.id}:`, e);
      }
    }

    syncedCount = savedMails.length;
    console.log(`[Sync] ✅ Saved ${syncedCount} new mails.`);

    // E. TRIGGER AUTOMATION
    if (savedMails.length > 0) {
      // Pass the userId to the automation function!
      await runAutomation(base44, savedMails, user.id);
    }

    return syncedCount;

  } catch (error) {
    console.error("[Sync] ❌ Critical Error:", error);
    throw error; // Re-throw so the main handler catches it
  }
}

// ========================================
// 4. AUTOMATION LOGIC
// ========================================

async function runAutomation(base44, mails, userId) {
  console.log(`[Automation] 🤖 Processing rules for user ${userId}...`);
  
  const rulesRaw = await base44.entities.AutomationRule.list('-created_date', 100);
  const rules = (rulesRaw.data || rulesRaw).filter(r => r.is_active);
  
  if (rules.length === 0) return;

  for (const mail of mails) {
    try {
      const matchingRules = rules.filter(rule => {
        const config = rule.catch_config || {};
        let match = true;
        
        if (config.senders?.length > 0) {
            const sender = (mail.sender_email || '').toLowerCase();
            if (!config.senders.some(s => sender.includes(s.toLowerCase()))) match = false;
        }
        if (match && config.subject_contains) {
            if (!mail.subject?.toLowerCase().includes(config.subject_contains.toLowerCase())) match = false;
        }
        if (match && config.body_contains) {
            const body = (mail.body_plain || mail.body_html || '').toLowerCase();
            if (!body.includes(config.body_contains.toLowerCase())) match = false;
        }
        return match;
      });

      if (matchingRules.length === 0) continue;

      // עדכון סטטוס המייל - זוהה לאוטומציה
      try {
        await base44.entities.Mail.update(mail.id, { 
          processing_status: 'matched_for_automation',
          matched_rule_id: matchingRules[0].id,
          matched_rule_name: matchingRules[0].name
        });
      } catch (e) {
        console.error(`[Automation] Failed to update mail status:`, e);
      }

      const actionsBuffer = [];
      const extractedBuffer = {};

      for (const rule of matchingRules) {
        // IMPORTANT: Pass userId to executeAutomationRule
        const res = await base44.functions.invoke('executeAutomationRule', {
          mailId: mail.id,
          ruleId: rule.id,
          userId: userId // <--- PASSING USER ID
        });

        if (res.error) {
            console.error(`[Automation] Rule ${rule.id} error:`, res.error);
            continue;
        }

        const data = res.data || {};
        
        if (data.extracted_info) Object.assign(extractedBuffer, data.extracted_info);
        if (data.case_id) extractedBuffer.case_id = data.case_id;
        if (data.client_id) extractedBuffer.client_id = data.client_id;
        if (data.client_language) extractedBuffer.client_language = data.client_language;

        if (data.results) {
            const pending = data.results.filter(r => r.status === 'pending_batch');
            actionsBuffer.push(...pending);
        }
      }

      if (actionsBuffer.length > 0) {
        console.log(`[Automation] 📦 Creating approval batch with ${actionsBuffer.length} actions...`);
        // עדכון סטטוס - ממתין לאישור
        try {
          const batchRes = await base44.functions.invoke('aggregateApprovalBatch', {
              mailId: mail.id,
              actionsToApprove: actionsBuffer,
              extractedInfo: extractedBuffer,
              userId: userId,
              clientLanguage: extractedBuffer.client_language || 'he'
          });
          
          // עדכון המייל עם מזהה האצווה וסטטוס ממתין לאישור
          if (batchRes.data?.batches?.length > 0) {
            await base44.entities.Mail.update(mail.id, { 
              processing_status: 'awaiting_approval',
              automation_batch_id: batchRes.data.batches[0].batch_id
            });
          }
        } catch (e) {
          console.error(`[Automation] Failed to create batch:`, e);
        }
      } else {
        // אם אין פעולות ממתינות לאישור, סמן כהושלם
        try {
          await base44.entities.Mail.update(mail.id, { 
            processing_status: 'automation_complete'
          });
        } catch (e) {
          console.error(`[Automation] Failed to update mail status:`, e);
        }
      }

    } catch (e) {
      console.error(`[Automation] Failed to process mail ${mail.id}:`, e);
    }
  }
}

// ========================================
// 5. MAIN ENTRY POINT
// ========================================

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    // Synchronous execution (awaiting result)
    const count = await executeSync(base44, user);

    // Return the count to the UI
    return new Response(JSON.stringify({ 
      success: true, 
      synced: count,
      message: `Synced ${count} emails` 
    }), { 
      status: 200, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });

  } catch (err) {
    console.error("[Serve] Error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});