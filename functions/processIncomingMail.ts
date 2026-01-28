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
  
  // Recursive function to extract parts deeply
  function extractParts(payload, messageId) {
    // 1. Handle Attachments
    if (payload.filename && payload.body?.attachmentId) {
      attachments.push({
        filename: payload.filename,
        mimeType: payload.mimeType || 'application/octet-stream',
        size: payload.body.size || 0,
        attachmentId: payload.body.attachmentId,
        messageId: messageId
      });
    }
    
    // 2. Handle Body Content
    if (payload.body?.data) {
      const decoded = decodeBase64Utf8(payload.body.data);
      if (decoded) {
        if (payload.mimeType === 'text/html') bodyHtml = decoded;
        else if (payload.mimeType === 'text/plain') bodyText = decoded;
      }
    }
    
    // 3. Recurse into sub-parts (multipart)
    if (payload.parts && Array.isArray(payload.parts)) {
      payload.parts.forEach(p => extractParts(p, messageId));
    }
  }
  
  extractParts(gmailMsg.payload, gmailMsg.id);
  
  // Create snippet from text or html
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
  
  // Ideally, save the new token back to DB here if needed, 
  // but for this flow returning it allows immediate continuation.
  return data.access_token;
}

// ========================================
// 3. CORE SYNC LOGIC (BACKGROUND TASK)
// ========================================

async function executeSync(base44, user) {
  console.log(`[Background] 🚀 Starting Sync for user ${user.id}`);

  try {
    // A. GET CONNECTION
    const connections = await base44.entities.IntegrationConnection.list('-created_at', 10);
    const connection = (connections.data || connections).find(c => c.provider === 'google' && c.is_active !== false);
    
    if (!connection) {
      console.log("[Background] No active Google connection found.");
      return;
    }

    let accessToken = await decrypt(connection.access_token_encrypted);
    const refreshToken = connection.refresh_token_encrypted ? await decrypt(connection.refresh_token_encrypted) : null;

    // B. DETERMINE QUERY (The "Smart Sync")
    // Get the absolute latest mail to determine Delta
    const lastMails = await base44.entities.Mail.list('-received_at', 1);
    const lastMail = (lastMails.data || lastMails)[0];

    let query = '';
    
    if (!lastMail) {
      // SCENARIO 1: FIRST SYNC (Last 24 Hours Only)
      // This prevents the "500 Timeout" by not fetching years of history
      const oneDayAgo = Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000);
      query = `after:${oneDayAgo}`;
      console.log(`[Background] 🆕 First Sync detected. Query: ${query} (Last 24h)`);
    } else {
      // SCENARIO 2: DELTA SYNC
      // Fetch only what came AFTER the last mail we have (+1 second buffer)
      const lastTime = Math.floor(new Date(lastMail.received_at).getTime() / 1000) + 1;
      query = `after:${lastTime}`;
      console.log(`[Background] 🔄 Delta Sync. Query: ${query} (Since last mail)`);
    }

    // C. FETCH LIST FROM GMAIL
    // Using maxResults=50 to keep execution fast and within limits
    let listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=50`;
    
    let listRes = await fetch(listUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
    
    // Handle Token Expiry
    if (listRes.status === 401 && refreshToken) {
      accessToken = await refreshGoogleToken(refreshToken, connection, base44);
      listRes = await fetch(listUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
    }

    const listData = await listRes.json();
    if (!listData.messages || listData.messages.length === 0) {
      console.log("[Background] ✨ No new messages found.");
      return;
    }

    console.log(`[Background] 📥 Found ${listData.messages.length} new messages. Fetching details...`);

    // D. FETCH DETAILS & SAVE
    const savedMails = [];
    const existingMailsList = await base44.entities.Mail.list('-received_at', 200); 
    const existingIds = new Set((existingMailsList.data || existingMailsList).map(m => m.external_id));

    for (const msg of listData.messages) {
      if (existingIds.has(msg.id)) continue; // Skip duplicates

      try {
        const detailRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        
        if (!detailRes.ok) {
           console.warn(`[Background] Failed to fetch details for msg ${msg.id}`);
           continue;
        }

        const detailData = await detailRes.json();
        const parsed = parseGmailMessage(detailData);
        
        const created = await base44.entities.Mail.create({ ...parsed, user_id: user.id });
        savedMails.push(created);
      } catch (e) {
        console.error(`[Background] Error saving mail ${msg.id}:`, e);
      }
    }

    console.log(`[Background] ✅ Saved ${savedMails.length} new mails.`);

    // E. TRIGGER AUTOMATION
    // Only run if we actually saved new mails
    if (savedMails.length > 0) {
      await runAutomation(base44, savedMails);
    }

  } catch (error) {
    console.error("[Background] ❌ Critical Sync Error:", error);
  }
}

// ========================================
// 4. AUTOMATION LOGIC (MATCH & EXECUTE)
// ========================================

async function runAutomation(base44, mails) {
  console.log(`[Automation] 🤖 Processing ${mails.length} mails for rules...`);
  
  // Fetch active rules
  const rulesRaw = await base44.entities.AutomationRule.list('-created_date', 100);
  const rules = (rulesRaw.data || rulesRaw).filter(r => r.is_active);
  
  if (rules.length === 0) return;

  for (const mail of mails) {
    try {
      // Find matches locally to save API calls
      const matchingRules = rules.filter(rule => {
        const config = rule.catch_config || {};
        let match = true;
        
        // Sender check
        if (config.senders?.length > 0) {
            const sender = (mail.sender_email || '').toLowerCase();
            if (!config.senders.some(s => sender.includes(s.toLowerCase()))) match = false;
        }
        // Subject check
        if (match && config.subject_contains) {
            if (!mail.subject?.toLowerCase().includes(config.subject_contains.toLowerCase())) match = false;
        }
        // Body check
        if (match && config.body_contains) {
            const body = (mail.body_plain || mail.body_html || '').toLowerCase();
            if (!body.includes(config.body_contains.toLowerCase())) match = false;
        }
        
        return match;
      });

      if (matchingRules.length === 0) continue;

      // Buffers for Batching
      const actionsBuffer = [];
      const extractedBuffer = {};

      for (const rule of matchingRules) {
        // Execute Rule 
        const res = await base44.functions.invoke('executeAutomationRule', {
          mailId: mail.id,
          ruleId: rule.id
        });

        if (res.error) {
            console.error(`[Automation] Rule ${rule.id} error:`, res.error);
            continue;
        }

        const data = res.data || {};
        
        // Collect Info
        if (data.extracted_info) Object.assign(extractedBuffer, data.extracted_info);
        if (data.case_id) extractedBuffer.case_id = data.case_id;
        if (data.client_id) extractedBuffer.client_id = data.client_id;

        // Collect Pending Actions (The critical Batch Logic)
        if (data.results) {
            const pending = data.results.filter(r => r.status === 'pending_batch');
            actionsBuffer.push(...pending);
        }
      }

      // Create Batch if needed
      if (actionsBuffer.length > 0) {
        console.log(`[Automation] 📦 Creating approval batch with ${actionsBuffer.length} actions.`);
        await base44.functions.invoke('aggregateApprovalBatch', {
            mailId: mail.id,
            actionsToApprove: actionsBuffer,
            extractedInfo: extractedBuffer
        });
      }

    } catch (e) {
      console.error(`[Automation] Failed to process mail ${mail.id}:`, e);
    }
  }
}

// ========================================
// 5. MAIN ENTRY POINT (ASYNC SERVER)
// ========================================

Deno.serve(async (req) => {
  // Always handle OPTIONS for CORS
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // 1. Auth Check
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    // Explicitly handle unauthorized access
    if (!user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    // 2. TRIGGER BACKGROUND WORK (The 500 Fix)
    // This allows the response to return immediately while the sync happens in background
    if (typeof EdgeRuntime !== 'undefined') {
        EdgeRuntime.waitUntil(executeSync(base44, user));
    } else {
        // Fallback for non-edge environments (Promise doesn't block response)
        executeSync(base44, user);
    }

    // 3. IMMEDIATE RESPONSE (200 OK)
    // The browser gets this immediately, solving the Timeout issue
    return new Response(JSON.stringify({ 
      success: true, 
      status: 'queued', 
      message: 'Sync started in background' 
    }), { 
      status: 200, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });

  } catch (err) {
    console.error("[Serve] Error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});