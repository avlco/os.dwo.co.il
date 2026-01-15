// @ts-nocheck
import { createClient, createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// ===== פונקציות הצפנה =====
async function getCryptoKey() {
  const envKey = Deno.env.get("ENCRYPTION_KEY");
  if (!envKey) throw new Error("ENCRYPTION_KEY is missing");
  const encoder = new TextEncoder();
  const keyString = envKey.padEnd(32, '0').slice(0, 32);
  const keyBuffer = encoder.encode(keyString);
  return await crypto.subtle.importKey("raw", keyBuffer, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function decrypt(text) {
  try {
    if (!text) return null;
    const parts = text.split(':');
    if (parts.length !== 2) return text;
    
    const [ivHex, encryptedHex] = parts;
    const key = await getCryptoKey();
    const iv = new Uint8Array(ivHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
    const encrypted = new Uint8Array(encryptedHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
    
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, encrypted);
    return new TextDecoder().decode(decrypted);
  } catch (e) {
    console.error("[Decrypt] Error:", e);
    throw new Error("Failed to decrypt access token");
  }
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
    throw new Error(`Encryption failed: ${e.message}`);
  }
}

// ===== פונקציות Google OAuth =====
function getProviderConfig(providerRaw) {
  const provider = providerRaw.toLowerCase().trim();
  if (provider === 'google') {
    const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
    const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
    if (!clientId || !clientSecret) throw new Error("Missing GOOGLE env vars");
    return { clientId, clientSecret, type: 'google' };
  }
  throw new Error(`Provider ${providerRaw} not supported for refresh`);
}

async function refreshGoogleToken(refreshToken, connectionId, adminBase44) {
  console.log("[Refresh] Starting token refresh...");
  const config = getProviderConfig('google');
  
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
  if (data.error) throw new Error(`Token refresh failed: ${JSON.stringify(data)}`);

  const newAccessToken = data.access_token;
  const encryptedAccess = await encrypt(newAccessToken);
  const expiresAt = Date.now() + ((data.expires_in || 3600) * 1000);

  await adminBase44.entities.IntegrationConnection.update(connectionId, {
    access_token_encrypted: encryptedAccess,
    expires_at: expiresAt,
    metadata: { 
      last_updated: new Date().toISOString(), 
      last_refresh: "success" 
    },
    is_active: true
  });

  console.log("[Refresh] Token refreshed successfully");
  return newAccessToken;
}

// ===== פונקציות עיבוד מיילים =====

// פענוח Base64 מ-Gmail (URL-safe)
function decodeBase64(data) {
  if (!data) return null;
  try {
    const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
    return atob(base64);
  } catch (e) {
    console.error("[Base64] Decode error:", e);
    return null;
  }
}

// חילוץ גוף המייל (טקסט רגיל ו-HTML)
function extractEmailBody(payload) {
  let plainText = null;
  let htmlText = null;
  
  // פונקציה רקורסיבית לחיפוש בכל ה-parts
  function searchParts(part) {
    // אם יש body ישיר
    if (part.body?.data) {
      const decoded = decodeBase64(part.body.data);
      if (part.mimeType === 'text/plain' && !plainText) {
        plainText = decoded;
      } else if (part.mimeType === 'text/html' && !htmlText) {
        htmlText = decoded;
      }
    }
    
    // חיפוש רקורסיבי ב-parts מקוננים
    if (part.parts) {
      for (const subPart of part.parts) {
        searchParts(subPart);
      }
    }
  }
  
  searchParts(payload);
  
  return {
    plain: plainText,
    html: htmlText
  };
}

// חילוץ קבצים מצורפים
function extractAttachments(payload) {
  const attachments = [];
  
  function searchParts(part) {
    // קובץ מצורף = יש filename ו-attachmentId
    if (part.filename && part.body?.attachmentId) {
      attachments.push({
        filename: part.filename,
        mimeType: part.mimeType || 'application/octet-stream',
        size: part.body.size || 0,
        attachmentId: part.body.attachmentId
      });
    }
    
    // רקורסיה
    if (part.parts) {
      for (const subPart of part.parts) {
        searchParts(subPart);
      }
    }
  }
  
  searchParts(payload);
  return attachments;
}

// ✅ משיכת מיילים מ-Gmail עם כל הפרטים
async function fetchGmailMessages(accessToken, refreshToken, connectionId, adminBase44, limit = 500) {
  console.log(`[Gmail] Fetching up to ${limit} messages...`);
  
  // ✅ שינוי: הסרת q=in:inbox כדי לקבל את כל המיילים
  const listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${limit}`;
  
  let currentToken = accessToken;
  let listRes = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${currentToken}` }
  });
  
  // טיפול בתוקף Token
  if (listRes.status === 401) {
    if (!refreshToken || refreshToken === "MISSING") {
      throw new Error("Token expired and no refresh token available");
    }
    console.log("[Gmail] Token expired, refreshing...");
    currentToken = await refreshGoogleToken(refreshToken, connectionId, adminBase44);
    listRes = await fetch(listUrl, {
      headers: { Authorization: `Bearer ${currentToken}` }
    });
  }

  if (!listRes.ok) {
    const txt = await listRes.text();
    throw new Error(`Gmail API Error: ${listRes.status} - ${txt}`);
  }

  const listData = await listRes.json();
  if (!listData.messages || listData.messages.length === 0) {
    console.log("[Gmail] No messages found");
    return [];
  }

  console.log(`[Gmail] Found ${listData.messages.length} messages, fetching details...`);
  const emails = [];
  
  // שליפת פרטי כל מייל
  for (let i = 0; i < listData.messages.length; i++) {
    const msg = listData.messages[i];
    
    try {
      const detailRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
        { headers: { Authorization: `Bearer ${currentToken}` } }
      );
      
      if (!detailRes.ok) {
        console.error(`[Gmail] Failed to fetch message ${msg.id}: ${detailRes.status}`);
        continue;
      }
      
      const detailData = await detailRes.json();
      const headers = detailData.payload?.headers || [];
      
      // חילוץ Headers
      const subject = headers.find(h => h.name === 'Subject')?.value || '(No Subject)';
      const from = headers.find(h => h.name === 'From')?.value || 'Unknown';
      const to = headers.find(h => h.name === 'To')?.value || '';
      const dateHeader = headers.find(h => h.name === 'Date')?.value;
      
      // חילוץ אימייל השולח
      let senderEmail = from;
      const emailMatch = from.match(/<(.+)>/);
      if (emailMatch) {
        senderEmail = emailMatch[1];
      }
      
      // חילוץ שם השולח
      let senderName = from.replace(/<.+>/, '').trim();
      if (senderName === senderEmail) senderName = null;
      
      // ✅ חילוץ גוף המייל (טקסט + HTML)
      const body = extractEmailBody(detailData.payload);
      
      // ✅ חילוץ קבצים מצורפים
      const attachments = extractAttachments(detailData.payload);
      
      emails.push({
        subject,
        sender_email: senderEmail,
        sender_name: senderName,
        recipients: to ? [{ email: to }] : [],
        received_at: dateHeader ? new Date(dateHeader).toISOString() : new Date().toISOString(),
        content_snippet: detailData.snippet || "",
        external_id: msg.id,
        processing_status: 'pending',
        source: 'gmail',
        body_plain: body.plain || detailData.snippet || "",
        body_html: body.html || null,
        attachments: attachments.length > 0 ? attachments : null,
        metadata: {
          labels: detailData.labelIds || [],
          thread_id: detailData.threadId,
          has_attachments: attachments.length > 0
        }
      });
      
      // לוג כל 50 מיילים
      if ((i + 1) % 50 === 0) {
        console.log(`[Gmail] Processed ${i + 1}/${listData.messages.length} messages`);
      }
      
    } catch (e) {
      console.error(`[Gmail] Failed to process message ${msg.id}:`, e.message);
    }
  }
  
  console.log(`[Gmail] Successfully processed ${emails.length} messages`);
  return emails;
}

// ===== Main Handler =====
Deno.serve(async (req) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Content-Type": "application/json"
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { headers });
  }

  try {
    console.log("[Sync] Starting mail sync process...");
    
    // אימות משתמש
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }), 
        { status: 401, headers }
      );
    }
    
    console.log(`[Sync] Authenticated user: ${user.email || user.id}`);

    // קליינט אדמין לעדכון Tokens
    const adminBase44 = createClient({ useServiceRole: true });

    // חיפוש חיבור Google
    console.log("[Sync] Looking for Google connection...");
    const allConnections = await base44.entities.IntegrationConnection.list('-created_at', 100);
    const items = Array.isArray(allConnections) ? allConnections : (allConnections.data || []);
    
    const connection = items.find(c => 
      c.provider === 'google' && c.is_active !== false
    );

    if (!connection) {
      return new Response(
        JSON.stringify({ 
          error: 'Google connection not found. Please connect via Settings.' 
        }), 
        { status: 404, headers }
      );
    }

    console.log(`[Sync] Connection found (ID: ${connection.id})`);

    // פענוח Tokens
    const accessToken = await decrypt(connection.access_token_encrypted);
    const refreshToken = connection.refresh_token_encrypted 
      ? await decrypt(connection.refresh_token_encrypted) 
      : null;
    
    if (!accessToken) {
      throw new Error("Failed to decrypt access token");
    }

    // ✅ משיכת מיילים (עד 500)
    const newEmails = await fetchGmailMessages(
      accessToken, 
      refreshToken, 
      connection.id, 
      adminBase44,
      500  // ✅ הגדלנו מ-20 ל-500
    );
    
    // שמירת מיילים חדשים בלבד
    console.log("[Sync] Checking for new emails...");
    const allExistingMails = await base44.entities.Mail.list('-received_at', 2000);
    const existingMailItems = Array.isArray(allExistingMails) 
      ? allExistingMails 
      : (allExistingMails.data || []);
    
    const existingIds = new Set(existingMailItems.map(m => m.external_id));
    
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
          console.error(`[Sync] Failed to save mail ${mail.external_id}:`, createError.message);
        }
      }
    }

    console.log(`[Sync] Saved ${savedCount} new emails out of ${newEmails.length} fetched`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        synced: savedCount, 
        total_fetched: newEmails.length,
        existing_in_db: existingMailItems.length
      }), 
      { status: 200, headers }
    );

  } catch (err) {
    console.error("[Sync] Error:", err);
    return new Response(
      JSON.stringify({ 
        error: err.message || String(err),
        stack: err.stack 
      }), 
      { status: 500, headers }
    );
  }
});
