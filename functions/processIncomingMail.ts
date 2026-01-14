// @ts-nocheck
import { createClient, createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// --- עזרים ---
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

async function getCryptoKey() {
  const envKey = Deno.env.get("ENCRYPTION_KEY");
  if (!envKey) throw new Error("ENCRYPTION_KEY is missing");
  const encoder = new TextEncoder();
  const keyString = envKey.padEnd(32, '0').slice(0, 32);
  const keyBuffer = encoder.encode(keyString);
  return await crypto.subtle.importKey("raw", keyBuffer, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
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
    console.error("Decryption warning:", e);
    throw new Error("Failed to decrypt access token");
  }
}

// --- לוגיקה ---

async function refreshGoogleToken(refreshToken, connectionId, adminBase44) {
    console.log("[DEBUG] Refreshing Google Token...");
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
    if (data.error) {
        console.error("Refresh failed:", data);
        throw new Error(`Failed to refresh token: ${JSON.stringify(data)}`);
    }

    const newAccessToken = data.access_token;
    const encryptedAccess = await encrypt(newAccessToken);
    const expiresAt = Date.now() + ((data.expires_in || 3600) * 1000);

    // עדכון ב-DB
    await adminBase44.entities.IntegrationConnection.update(connectionId, {
        access_token_encrypted: encryptedAccess,
        expires_at: expiresAt,
        metadata: { last_updated: new Date().toISOString(), last_refresh: "success" },
        is_active: true
    });

    console.log("[DEBUG] Token refreshed successfully.");
    return newAccessToken;
}

async function fetchGmailMessages(accessToken, refreshToken, connectionId, adminBase44, limit = 20) {
    console.log("[DEBUG] Fetching from Gmail...");
    const listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${limit}&q=in:inbox`;
    
    let currentToken = accessToken;
    let listRes = await fetch(listUrl, {
        headers: { Authorization: `Bearer ${currentToken}` }
    });
    
    // ניסיון רענון אם פג תוקף
    if (listRes.status === 401) {
        if (!refreshToken || refreshToken === "MISSING") {
            throw new Error("Token expired and no refresh token available.");
        }
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
        console.log("[DEBUG] No messages found.");
        return [];
    }

    console.log(`[DEBUG] Processing ${listData.messages.length} messages...`);
    const emails = [];
    
    for (const msg of listData.messages) {
        try {
            const detailRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}`, {
                headers: { Authorization: `Bearer ${currentToken}` }
            });
            const detailData = await detailRes.json();
            const headers = detailData.payload.headers;
            
            const subject = headers.find(h => h.name === 'Subject')?.value || '(No Subject)';
            const from = headers.find(h => h.name === 'From')?.value || 'Unknown';
            const dateHeader = headers.find(h => h.name === 'Date')?.value;
            
            let senderEmail = from;
            if (from.includes('<') && from.includes('>')) {
                const match = from.match(/<(.+)>/);
                if (match) senderEmail = match[1];
            }

            emails.push({
                subject,
                sender_email: senderEmail,
                received_at: dateHeader ? new Date(dateHeader).toISOString() : new Date().toISOString(),
                content_snippet: detailData.snippet || "",
                external_id: msg.id,
                processing_status: 'pending',
                source: 'gmail',
                body_plain: detailData.snippet 
            });
        } catch (e) {
            console.error(`[WARN] Failed msg ${msg.id}`, e);
        }
    }
    return emails;
}

Deno.serve(async (req) => {
    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Content-Type": "application/json"
    };

    if (req.method === "OPTIONS") return new Response(null, { headers });

    try {
        // אימות המשתמש (מי לחץ על הכפתור)
        const userClient = createClientFromRequest(req);
        const user = await userClient.auth.me();
        if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers });

        // === התיקון הקריטי: שימוש ב-Service Client לכל התהליך ===
        // זה מונע את שגיאת ה-Invalid ID ואת בעיות ההרשאה
        const adminBase44 = createClient({ useServiceRole: true });

        console.log("[DEBUG] Looking for system google connection...");
        const allConnections = await adminBase44.entities.IntegrationConnection.list({ limit: 100 });
        const items = Array.isArray(allConnections) ? allConnections : (allConnections.data || []);
        
        const connection = items.find(c => c.provider === 'google' && c.is_active !== false);

        if (!connection) {
            return new Response(JSON.stringify({ 
                error: `System connection not found. Please connect Google via Settings (Admin).` 
            }), { status: 404, headers });
        }

        console.log("[DEBUG] Decrypting tokens...");
        const accessToken = await decrypt(connection.access_token_encrypted);
        const refreshToken = connection.refresh_token_encrypted ? await decrypt(connection.refresh_token_encrypted) : null;
        
        const newEmails = await fetchGmailMessages(accessToken, refreshToken, connection.id, adminBase44);
        
        let savedCount = 0;
        // שימוש ב-Service Client לשמירה - עוקף בעיות הרשאה בטבלת Mail
        const allExistingMails = await adminBase44.entities.Mail.list({ limit: 1000 });
        const existingMailItems = Array.isArray(allExistingMails) ? allExistingMails : (allExistingMails.data || []);
        const existingIds = new Set(existingMailItems.map(m => m.external_id));

        for (const mail of newEmails) {
            if (!existingIds.has(mail.external_id)) {
                await adminBase44.entities.Mail.create({ 
                    ...mail, 
                    user_id: user.id // המשתמש שיזם את הסנכרון הוא ה"בעלים" של המייל החדש
                });
                savedCount++;
            }
        }

        return new Response(JSON.stringify({ 
            success: true, 
            synced: savedCount, 
            total_fetched: newEmails.length 
        }), { status: 200, headers });

    } catch (err) {
        console.error("Sync Error:", err);
        return new Response(JSON.stringify({ error: err.message || String(err) }), { status: 500, headers });
    }
});