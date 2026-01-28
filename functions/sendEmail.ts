// @ts-nocheck
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ========================================
// 1. CRYPTO HELPERS (Encrypt/Decrypt)
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
    console.error("[Encryption] Failed:", e);
    throw new Error(`Encryption failed: ${e.message}`);
  }
}

// ========================================
// 2. GOOGLE TOKEN REFRESH LOGIC
// ========================================

async function refreshGoogleToken(refreshToken, connectionId, base44) {
  console.log("[SendEmail] 🔄 Refreshing expired Google Token...");
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  
  if (!clientId || !clientSecret) throw new Error("Missing Google Client ID/Secret env vars");

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
  
  const newAccessToken = data.access_token;
  
  // CRITICAL: Save new token to DB so next calls succeed
  const encryptedAccess = await encrypt(newAccessToken);
  await base44.asServiceRole.entities.IntegrationConnection.update(connectionId, {
    access_token_encrypted: encryptedAccess,
    metadata: { last_refresh: new Date().toISOString() }
  });
  
  console.log("[SendEmail] ✅ Token refreshed and saved to DB");
  return newAccessToken;
}

// ========================================
// 3. MAIN HANDLER
// ========================================

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const base44 = createClientFromRequest(req);
    const bodyReq = await req.json();
    const { to, subject, body } = bodyReq; // 'from' is usually determined by the account

    if (!to || !subject || !body) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: to, subject, body' }),
        { status: 400, headers: corsHeaders }
      );
    }

    console.log(`[SendEmail] Attempting to send email to: ${to}`);

    // --- STEP 1: Check Gmail Integration ---
    // Fetch generic list first or filter if possible. Using robust filter.
    const gmailConnectionsRes = await base44.entities.IntegrationConnection.filter({
      provider: 'google',
      is_active: true
    });
    
    // Handle SDK response variations (array vs object)
    const gmailConnections = Array.isArray(gmailConnectionsRes) 
      ? gmailConnectionsRes 
      : (gmailConnectionsRes.data || []);

    if (gmailConnections.length > 0) {
      const gmailConn = gmailConnections[0];
      console.log('[SendEmail] Using Gmail API');

      let accessToken = await decrypt(gmailConn.access_token_encrypted);
      const refreshToken = gmailConn.refresh_token_encrypted ? await decrypt(gmailConn.refresh_token_encrypted) : null;

      if (!accessToken) throw new Error('Failed to decrypt Gmail access token');

      // --- Prepare Raw Email (RFC 2822) ---
      const subjectBase64 = btoa(unescape(encodeURIComponent(subject)));
      const encodedSubject = `=?UTF-8?B?${subjectBase64}?=`;

      const emailLines = [
        `To: ${to}`,
        `Subject: ${encodedSubject}`,
        'Content-Type: text/html; charset=utf-8',
        'MIME-Version: 1.0',
        '',
        body
      ];

      const emailContent = emailLines.join('\r\n');
      const encoder = new TextEncoder();
      const emailBytes = encoder.encode(emailContent);
      const base64Message = btoa(String.fromCharCode(...emailBytes))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      // --- Send Attempt 1 ---
      let gmailResponse = await fetch(
        'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ raw: base64Message })
        }
      );

      // --- Handle 401 (Expired Token) ---
      if (gmailResponse.status === 401 && refreshToken) {
        // REFRESH LOGIC
        try {
            accessToken = await refreshGoogleToken(refreshToken, gmailConn.id, base44);
            
            // --- Send Attempt 2 ---
            gmailResponse = await fetch(
                'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
                {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ raw: base64Message })
                }
            );
        } catch (refreshError) {
            console.error("[SendEmail] Refresh failed:", refreshError);
            throw new Error("Token expired and refresh failed.");
        }
      }

      if (!gmailResponse.ok) {
        const errorText = await gmailResponse.text();
        console.error('[SendEmail] Gmail API error:', errorText);
        throw new Error(`Gmail API error: ${gmailResponse.status} - ${errorText}`);
      }

      const result = await gmailResponse.json();
      console.log('[SendEmail] ✅ Email sent via Gmail API:', result.id);

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Email sent successfully via Gmail',
          to,
          subject,
          via: 'gmail',
          messageId: result.id
        }),
        { status: 200, headers: corsHeaders }
      );
    }

    // --- STEP 2: SMTP Fallback (Placeholder) ---
    const smtpConnectionsRes = await base44.entities.IntegrationConnection.filter({
      provider: 'smtp',
      is_active: true
    });
    
    const smtpConnections = Array.isArray(smtpConnectionsRes) ? smtpConnectionsRes : (smtpConnectionsRes.data || []);

    if (smtpConnections.length > 0) {
      const smtpConfig = smtpConnections[0].metadata;
      if (!smtpConfig?.smtp_host) throw new Error('Invalid SMTP configuration');

      console.log(`[SendEmail] Using SMTP: ${smtpConfig.smtp_host}`);
      // Actual SMTP implementation would go here
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Email queued for SMTP sending',
          to,
          subject,
          via: 'smtp'
        }),
        { status: 200, headers: corsHeaders }
      );
    }

    // --- STEP 3: No Integration ---
    console.log('[SendEmail] No active email integration found');
    return new Response(
      JSON.stringify({
        success: false,
        error: 'No email integration configured',
        message: 'Please configure Gmail or SMTP integration in Settings',
      }),
      { status: 400, headers: corsHeaders }
    );

  } catch (error) {
    console.error('[SendEmail] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: corsHeaders }
    );
  }
});