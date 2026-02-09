import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

async function getCryptoKey() {
  const envKey = Deno.env.get("ENCRYPTION_SECRET_KEY");
  if (!envKey) {
    throw new Error("ENCRYPTION_SECRET_KEY is missing");
  }
  const encoder = new TextEncoder();
  const keyString = envKey.padEnd(32, '0').slice(0, 32);
  const keyBuffer = encoder.encode(keyString);
  const key = await crypto.subtle.importKey("raw", keyBuffer, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  return key;
}

async function decrypt(text) {
  try {
    if (!text) {
      console.error("[Decrypt] Text is null");
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
    
    const ivBytes = [];
    for (let i = 0; i < ivHex.length; i += 2) {
      ivBytes.push(parseInt(ivHex.substr(i, 2), 16));
    }
    const iv = new Uint8Array(ivBytes);
    
    const encBytes = [];
    for (let i = 0; i < encryptedHex.length; i += 2) {
      encBytes.push(parseInt(encryptedHex.substr(i, 2), 16));
    }
    const encrypted = new Uint8Array(encBytes);
    
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv }, key, encrypted);
    const decoder = new TextDecoder();
    const decryptedText = decoder.decode(decrypted);
    
    console.log("[Decrypt] Success");
    return decryptedText;
  } catch (e) {
    console.error("[Decrypt] Error:", e.message);
    throw new Error("Failed to decrypt: " + e.message);
  }
}

async function encrypt(text) {
  const key = await getCryptoKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();
  const encoded = encoder.encode(text);
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, key, encoded);
  
  const ivBytes = Array.from(iv);
  let ivHex = '';
  for (let i = 0; i < ivBytes.length; i++) {
    ivHex = ivHex + ivBytes[i].toString(16).padStart(2, '0');
  }
  
  const encBytes = Array.from(new Uint8Array(encrypted));
  let encHex = '';
  for (let i = 0; i < encBytes.length; i++) {
    encHex = encHex + encBytes[i].toString(16).padStart(2, '0');
  }
  
  return ivHex + ':' + encHex;
}

async function refreshGoogleToken(refreshToken, connection, base44) {
  console.log("[Refresh] Starting...");
  
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    throw new Error("Missing GOOGLE env vars");
  }
  
  const params = new URLSearchParams();
  params.append('client_id', clientId);
  params.append('client_secret', clientSecret);
  params.append('refresh_token', refreshToken);
  params.append('grant_type', 'refresh_token');
  
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });

  const data = await res.json();
  if (data.error) {
    throw new Error("Token refresh failed");
  }

  const newAccessToken = data.access_token;
  const encryptedAccess = await encrypt(newAccessToken);
  const expiresIn = data.expires_in || 3600;
  const expiresAt = Date.now() + (expiresIn * 1000);

  await base44.entities.IntegrationConnection.update(connection.id, {
    access_token_encrypted: encryptedAccess,
    expires_at: expiresAt,
    is_active: true
  });
  
  console.log("[Refresh] Success");
  return newAccessToken;
}

Deno.serve(async function(req) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Content-Type": "application/json"
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: headers });
  }

  try {
    console.log("[Download] Starting...");
    
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      const errorResponse = JSON.stringify({ error: 'Unauthorized' });
      return new Response(errorResponse, { status: 401, headers: headers });
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
    let items = [];
    if (Array.isArray(allConnections)) {
      items = allConnections;
    } else if (allConnections.data) {
      items = allConnections.data;
    }
    
    let connection = null;
    for (let i = 0; i < items.length; i++) {
      const c = items[i];
      if (c.provider === 'google' && c.is_active !== false) {
        connection = c;
        break;
      }
    }

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
      
      let refreshToken = null;
      if (connection.refresh_token_encrypted) {
        refreshToken = await decrypt(connection.refresh_token_encrypted);
      }
      
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
      console.error("[Download] Gmail error:", response.status, errorText);
      throw new Error("Gmail API error: " + response.status);
    }

    const attachmentData = await response.json();
    const base64String = attachmentData.data || null;
    const hasData = !!base64String;
    console.log("[Download] Success! has data:", hasData);

    // ✅ מחזיר רק את ה-base64 string, לא את כל האובייקט
    const result = JSON.stringify({ 
      success: true,
      data: base64String,
      filename: filename
    });
    
    return new Response(result, { status: 200, headers: headers });

  } catch (err) {
    console.error("[Download] Error:", err.message);
    const errorResult = JSON.stringify({ 
      error: err.message || "Unknown error"
    });
    return new Response(errorResult, { status: 500, headers: headers });
  }
});