import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

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
    if (!text) {
      console.error("[Decrypt] Text is null or undefined");
      return null;
    }
    
    const parts = text.split(':');
    if (parts.length !== 2) {
      console.error("[Decrypt] Invalid format");
      return text;
    }
    
    const ivHex = parts[0];
    const encryptedHex = parts[1];
    
    console.log("[Decrypt] Decrypting token...");
    
    const key = await getCryptoKey();
    const iv = new Uint8Array(ivHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
    const encrypted = new Uint8Array(encryptedHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
    
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, encrypted);
    const decryptedText = new TextDecoder().decode(decrypted);
    
    console.log("[Decrypt] Successfully decrypted");
    return decryptedText;
  } catch (e) {
    console.error("[Decrypt] Error:", e.message);
    throw new Error("Failed to decrypt: " + e.message);
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
    return ivHex + ':' + encryptedHex;
  } catch (e) {
    throw new Error("Encryption failed: " + e.message);
  }
}

async function refreshGoogleToken(refreshToken, connection, base44) {
  console.log("[Refresh] Starting token refresh...");
  
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  
  if (!clientId || !clientSecret) {
    throw new Error("Missing GOOGLE env vars");
  }
  
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
  if (data.error) {
    throw new Error("Token refresh failed: " + JSON.stringify(data));
  }

  const newAccessToken = data.access_token;
  const encryptedAccess = await encrypt(newAccessToken);
  const expiresAt = Date.now() + ((data.expires_in || 3600) * 1000);

  await base44.entities.IntegrationConnection.update(connection.id, {
    access_token_encrypted: encryptedAccess,
    expires_at: expiresAt,
    is_active: true
  });
  
  console.log("[Refresh] Token refreshed successfully");
  return newAccessToken;
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
    console.log("[Download] Starting...");
    
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }), 
        { status: 401, headers }
      );
    }

    const body = await req.json();
    const messageId = body.messageId;
    const attachmentId = body.attachmentId;
    const filename = body.filename;

    console.log("[Download] messageId:", messageId);
    console.log("[Download] attachmentId:", attachmentId);

    if (!messageId || !attachmentId) {
      throw new Error("Missing messageId or attachmentId");
    }

    console.log("[Download] Fetching connection...");
    const allConnections = await base44.entities.IntegrationConnection.list('-created_at', 100);
    const items = Array.isArray(allConnections) ? allConnections : (allConnections.data || []);
    const connection = items.find(c => c.provider === 'google' && c.is_active !== false);

    if (!connection) {
      throw new Error("Google connection not found");
    }

    console.log("[Download] Connection found");

    let accessToken = await decrypt(connection.access_token_encrypted);
    
    if (!accessToken) {
      throw new Error("Failed to decrypt access token");
    }

    const attachmentUrl = "https://gmail.googleapis.com/gmail/v1/users/me/messages/" + messageId + "/attachments/" + attachmentId;
    
    console.log("[Download] Fetching from Gmail...");
    let response = await fetch(attachmentUrl, {
      headers: { Authorization: "Bearer " + accessToken }
    });

    if (response.status === 401) {
      console.log("[Download] Token expired, refreshing...");
      
      const refreshToken = connection.refresh_token_encrypted 
        ? await decrypt(connection.refresh_token_encrypted) 
        : null;
      
      if (!refreshToken) {
        throw new Error("Token expired and no refresh token");
      }

      accessToken = await refreshGoogleToken(refreshToken, connection, base44);
      
      response = await fetch(attachmentUrl, {
        headers: { Authorization: "Bearer " + accessToken }
      });
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Download] Gmail API error:", response.status, errorText);
      throw new Error("Gmail API error: " + response.status);
    }

    const attachmentData = await response.json();
    
    console.log("[Download] Success!");

    return new Response(
      JSON.stringify({ 
        success: true,
         attachmentData,
        filename: filename
      }), 
      { status: 200, headers }
    );

  } catch (err) {
    console.error("[Download] Error:", err.message);
    return new Response(
      JSON.stringify({ 
        error: err.message || "Unknown error"
      }), 
      { status: 500, headers }
    );
  }
});
