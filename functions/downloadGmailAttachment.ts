// @ts-nocheck
import { createClientFromRequest, createClient } from 'npm:@base44/sdk@0.8.6';

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
    throw new Error("Failed to decrypt access token");
  }
}

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
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }), 
        { status: 401, headers }
      );
    }

    const body = await req.json();
    const { messageId, attachmentId, filename } = body;

    if (!messageId || !attachmentId) {
      throw new Error("Missing messageId or attachmentId");
    }

    // שליפת Google connection
    const allConnections = await base44.entities.IntegrationConnection.list('-created_at', 100);
    const items = Array.isArray(allConnections) ? allConnections : (allConnections.data || []);
    const connection = items.find(c => c.provider === 'google' && c.is_active !== false);

    if (!connection) {
      throw new Error("Google connection not found");
    }

    const accessToken = await decrypt(connection.access_token_encrypted);

    // קריאה ל-Gmail API להורדת הקובץ
    const attachmentUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${attachmentId}`;
    
    const response = await fetch(attachmentUrl, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!response.ok) {
      throw new Error(`Gmail API error: ${response.status}`);
    }

    const attachmentData = await response.json();

    return new Response(
      JSON.stringify({ 
        success: true,
        data: attachmentData,
        filename: filename
      }), 
      { status: 200, headers }
    );

  } catch (err) {
    console.error("[Download] Error:", err);
    return new Response(
      JSON.stringify({ error: err.message }), 
      { status: 500, headers }
    );
  }
});
