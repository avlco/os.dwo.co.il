// @ts-nocheck
import { createClient, createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// --- עזרי אבטחה (זהים ל-integrationAuth) ---

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
    if (parts.length !== 2) return text; // מניעת קריסה אם הטוקן לא מוצפן
    
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

async function fetchGmailMessages(accessToken, limit = 10) {
    console.log("[DEBUG] Fetching from Gmail API...");
    // הוספת q=in:inbox כדי למשוך רק מהדואר הנכנס
    const listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${limit}&q=in:inbox`;
    
    const listRes = await fetch(listUrl, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });
    
    if (!listRes.ok) {
        const txt = await listRes.text();
        if (listRes.status === 401) throw new Error("Google Token Expired. Please reconnect.");
        throw new Error(`Gmail API Error: ${listRes.status} - ${txt}`);
    }

    const listData = await listRes.json();
    if (!listData.messages || listData.messages.length === 0) {
        console.log("[DEBUG] No new messages found in Gmail.");
        return [];
    }

    console.log(`[DEBUG] Found ${listData.messages.length} messages headers. Fetching details...`);
    const emails = [];
    
    for (const msg of listData.messages) {
        try {
            const detailRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}`, {
                headers: { Authorization: `Bearer ${accessToken}` }
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
                // שומרים גם את התוכן הגולמי אם צריך אותו לעתיד
                body_plain: detailData.snippet 
            });
        } catch (e) {
            console.error(`[WARN] Failed to fetch message ${msg.id}`, e);
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
        // 1. זיהוי המשתמש
        const userClient = createClientFromRequest(req);
        const user = await userClient.auth.me();
        if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers });

        // 2. שימוש ב-Service Client לעבודה מול ה-DB
        const adminBase44 = createClient({ useServiceRole: true });

        // 3. שליפת פרטי החיבור
        const connectionsResponse = await adminBase44.entities.IntegrationConnection.list({ 
            where: { user_id: user.id, provider: 'google' },
            limit: 1
        });
        
        // נרמול התוצאה (כמו שעשינו ב-integrationAuth)
        const connections = Array.isArray(connectionsResponse) ? connectionsResponse : (connectionsResponse.data || []);
        const connection = connections[0];

        if (!connection) {
            return new Response(JSON.stringify({ 
                error: `No Google integration found. Please connect in Settings.` 
            }), { status: 404, headers });
        }

        // 4. פענוח הטוקן
        console.log("[DEBUG] Decrypting access token...");
        const accessToken = await decrypt(connection.access_token_encrypted);
        
        // 5. משיכת מיילים מגוגל
        const newEmails = await fetchGmailMessages(accessToken);
        
        // 6. שמירה ל-DB (רק מה שלא קיים)
        let savedCount = 0;
        for (const mail of newEmails) {
            // בדיקה אם המייל כבר קיים במערכת
            const existsResponse = await adminBase44.entities.Mail.list({ 
                where: { external_id: mail.external_id },
                limit: 1
            });
            const exists = Array.isArray(existsResponse) ? existsResponse : (existsResponse.data || []);

            if (exists.length === 0) {
                await adminBase44.entities.Mail.create({ 
                    ...mail, 
                    user_id: user.id 
                });
                savedCount++;
            }
        }

        console.log(`[DEBUG] Sync complete. Saved ${savedCount} new emails.`);
        return new Response(JSON.stringify({ 
            success: true, 
            synced: savedCount, 
            total_fetched: newEmails.length 
        }), { status: 200, headers });

    } catch (err) {
        console.error("Sync Process Error:", err);
        return new Response(JSON.stringify({ error: err.message || String(err) }), { status: 500, headers });
    }
});