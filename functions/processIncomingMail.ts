import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// --- Crypto Helpers (Internal logic to ensure independence) ---
async function getCryptoKey() {
  const keyString = Deno.env.get("ENCRYPTION_KEY");
  if (!keyString) {
      console.warn("Using fallback key - Ensure ENCRYPTION_KEY is set in production!");
      // Fallback for dev only
      const fallback = "default-dev-key-must-be-32-bytes!!";
      const encoder = new TextEncoder();
      return await crypto.subtle.importKey(
          "raw", 
          encoder.encode(fallback.padEnd(32, '0').slice(0, 32)), 
          { name: "AES-GCM" }, 
          false, 
          ["encrypt", "decrypt"]
      );
  }
  
  const encoder = new TextEncoder();
  const keyBuffer = encoder.encode(keyString.padEnd(32, '0').slice(0, 32));
  return await crypto.subtle.importKey("raw", keyBuffer, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function decrypt(text: string): Promise<string> {
  try {
    const [ivHex, encryptedHex] = text.split(':');
    const key = await getCryptoKey();
    const iv = new Uint8Array(ivHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
    const encrypted = new Uint8Array(encryptedHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, encrypted);
    return new TextDecoder().decode(decrypted);
  } catch (e) {
    console.error("Decryption failed", e);
    throw new Error("Failed to decrypt token");
  }
}

// --- Gmail Logic ---
async function fetchGmailMessages(accessToken: string, limit = 10) {
    // 1. List Messages (Inbox only)
    const listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${limit}&q=in:inbox`;
    const listRes = await fetch(listUrl, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });
    
    if (!listRes.ok) {
        const err = await listRes.json();
        throw new Error(`Gmail API Error: ${err.error?.message || listRes.statusText}`);
    }

    const listData = await listRes.json();
    if (!listData.messages) return [];

    const emails = [];

    // 2. Get Details for each message
    console.log(`Found ${listData.messages.length} messages, fetching details...`);
    
    for (const msg of listData.messages) {
        try {
            const detailUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}`;
            const detailRes = await fetch(detailUrl, {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
            const detailData = await detailRes.json();
            
            // Extract Headers
            const headers = detailData.payload.headers;
            const subject = headers.find((h: any) => h.name === 'Subject')?.value || '(No Subject)';
            const from = headers.find((h: any) => h.name === 'From')?.value || 'Unknown';
            const dateHeader = headers.find((h: any) => h.name === 'Date')?.value;
            
            // Clean up "From" field
            const emailMatch = from.match(/<(.+)>/);
            const senderEmail = emailMatch ? emailMatch[1] : from;

            emails.push({
                subject,
                sender_email: senderEmail,
                received_at: dateHeader ? new Date(dateHeader).toISOString() : new Date().toISOString(),
                content_snippet: detailData.snippet || "",
                external_id: msg.id,
                processing_status: 'pending', // Default status for new mails
                source: 'gmail',
                metadata: { 
                    threadId: msg.threadId,
                    fetched_at: new Date().toISOString()
                }
            });
        } catch (innerErr) {
            console.error(`Failed to fetch message ${msg.id}`, innerErr);
        }
    }
    return emails;
}

// --- Main Handler ---
Deno.serve(async (req) => {
    // CORS Headers
    const headers = new Headers({
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Content-Type": "application/json"
    });

    if (req.method === "OPTIONS") return new Response(null, { headers });

    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        if (!user) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers });
        }

        console.log(`Processing mail sync for user: ${user.id}`);

        // 1. Get Integration Token
        const connections = await base44.entities.IntegrationConnection.filter({ 
            user_id: user.id, 
            provider: 'google' 
        });

        if (connections.length === 0) {
            return new Response(JSON.stringify({ error: 'No Google integration found. Please connect in Settings.' }), { status: 404, headers });
        }

        const connection = connections[0];
        const accessToken = await decrypt(connection.access_token);

        // 2. Fetch from Gmail
        const newEmails = await fetchGmailMessages(accessToken);
        
        if (newEmails.length === 0) {
            return new Response(JSON.stringify({ success: true, synced: 0, message: "No new emails found." }), { status: 200, headers });
        }

        // 3. Save to DB (Upsert Logic - Prevent Duplicates)
        let savedCount = 0;
        for (const mail of newEmails) {
            // Check if mail already exists by external_id
            const exists = await base44.entities.Mail.filter({ external_id: mail.external_id });
            
            if (exists.length === 0) {
                // IMPORTANT: Associate with current user_id to satisfy RLS
                const record = { ...mail, user_id: user.id };
                await base44.entities.Mail.create(record);
                savedCount++;
            }
        }

        console.log(`Sync complete. Fetched: ${newEmails.length}, Saved: ${savedCount}`);

        return new Response(JSON.stringify({ 
            success: true, 
            synced: savedCount,
            total_fetched: newEmails.length 
        }), { status: 200, headers });

    } catch (err: any) {
        console.error("Process Error:", err);
        return new Response(JSON.stringify({ error: err.message || String(err) }), { status: 500, headers });
    }
});
