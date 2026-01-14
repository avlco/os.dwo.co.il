// @ts-nocheck
import { createClient, createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

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
    console.error("Decryption warning:", e);
    throw new Error("Failed to decrypt access token");
  }
}

async function fetchGmailMessages(accessToken, limit = 10) {
    console.log("[DEBUG] Fetching Gmail messages...");
    const listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${limit}&q=in:inbox`;
    
    const listRes = await fetch(listUrl, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });
    
    if (!listRes.ok) {
        const txt = await listRes.text();
        if (listRes.status === 401) throw new Error("Google Token Expired. Please reconnect in Settings.");
        throw new Error(`Gmail API Error: ${listRes.status} - ${txt}`);
    }

    const listData = await listRes.json();
    if (!listData.messages || listData.messages.length === 0) {
        console.log("[DEBUG] No messages found");
        return [];
    }

    console.log(`[DEBUG] Found ${listData.messages.length} messages`);
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
                body_plain: detailData.snippet 
            });
        } catch (e) {
            console.error(`[WARN] Failed processing message ${msg.id}`, e);
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
        const userClient = createClientFromRequest(req);
        const user = await userClient.auth.me();
        if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers });

        const adminBase44 = createClient({ useServiceRole: true });

        // === התיקון: List All + Memory Filter ===
        console.log("[DEBUG] Listing all connections to find system google account...");
        const allConnections = await adminBase44.entities.IntegrationConnection.list();
        const items = Array.isArray(allConnections) ? allConnections : (allConnections.data || []);
        
        // מציאת החיבור של גוגל (ללא תנאי סינון בצד שרת)
        const connection = items.find(c => c.provider === 'google' && c.is_active !== false);

        if (!connection) {
            return new Response(JSON.stringify({ 
                error: `No System Google Account connected. An admin must connect it in Settings > Integrations.` 
            }), { status: 404, headers });
        }

        console.log("[DEBUG] Decrypting token...");
        const accessToken = await decrypt(connection.access_token_encrypted);
        
        const newEmails = await fetchGmailMessages(accessToken);
        
        let savedCount = 0;
        // שליפת כל המיילים הקיימים כדי למנוע כפילויות (שוב, list all למניעת באגים)
        const allExistingMails = await adminBase44.entities.Mail.list();
        const existingMailItems = Array.isArray(allExistingMails) ? allExistingMails : (allExistingMails.data || []);
        const existingIds = new Set(existingMailItems.map(m => m.external_id));

        for (const mail of newEmails) {
            if (!existingIds.has(mail.external_id)) {
                await adminBase44.entities.Mail.create({ 
                    ...mail, 
                    user_id: user.id 
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
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
    }
});