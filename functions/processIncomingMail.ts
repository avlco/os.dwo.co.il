// @ts-nocheck
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// מפתח קבוע
const STATIC_KEY = "my-secret-key-1234567890123456";

async function getCryptoKey() {
  const encoder = new TextEncoder();
  const keyBuffer = encoder.encode(STATIC_KEY);
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
    return text; 
  }
}

async function fetchGmailMessages(accessToken, limit = 10) {
    console.log("Fetching Gmail messages...");
    const listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${limit}&q=in:inbox`;
    
    const listRes = await fetch(listUrl, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });
    
    if (!listRes.ok) {
        const txt = await listRes.text();
        // אם הטוקן פג תוקף - נחזיר שגיאה ברורה
        if (listRes.status === 401) throw new Error("Google Token Expired. Please reconnect in Settings.");
        throw new Error(`Gmail API Error: ${listRes.status} - ${txt}`);
    }

    const listData = await listRes.json();
    if (!listData.messages) return [];

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
                source: 'gmail'
            });
        } catch (e) {
            console.error("Error fetching specific msg", e);
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
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers });

        // --- תיקון קריטי: חיפוש חכם של האינטגרציה ---
        // במקום לסנן לפי 'google', נביא הכל ונבדוק בקוד (פותר בעיות אותיות גדולות/קטנות)
        const allConnections = await base44.entities.IntegrationConnection.filter({ user_id: user.id });
        
        // מציאת החיבור הרלוונטי (Google, google, GOOGLE)
        const connection = allConnections.find(c => c.provider && c.provider.toLowerCase() === 'google');

        if (!connection) {
            // דיבוג למשתמש: מה כן מצאנו?
            const foundProviders = allConnections.map(c => c.provider).join(', ') || "None";
            return new Response(JSON.stringify({ 
                error: `No Google integration found. Found providers: [${foundProviders}]. Please go to Settings -> Integrations.` 
            }), { status: 404, headers });
        }

        if (!connection.access_token) {
             return new Response(JSON.stringify({ error: 'Integration found but Token is missing. Please reconnect.' }), { status: 400, headers });
        }

        const accessToken = await decrypt(connection.access_token);
        const newEmails = await fetchGmailMessages(accessToken);
        
        let savedCount = 0;
        for (const mail of newEmails) {
            const exists = await base44.entities.Mail.filter({ external_id: mail.external_id });
            if (exists.length === 0) {
                await base44.entities.Mail.create({ ...mail, user_id: user.id });
                savedCount++;
            }
        }

        return new Response(JSON.stringify({ success: true, synced: savedCount, total: newEmails.length }), { status: 200, headers });

    } catch (err) {
        console.error("Critical Function Error:", err);
        return new Response(JSON.stringify({ error: err.message || String(err) }), { status: 500, headers });
    }
});