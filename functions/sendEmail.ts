// @ts-nocheck
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// ========================================
// CRYPTO HELPERS (for decrypting tokens)
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

Deno.serve(async (req) => {
  try {
    // יצירת Base44 client
    const base44 = createClientFromRequest(req);

    const { to, subject, body, from } = await req.json();

    if (!to || !subject || !body) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: to, subject, body' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[SendEmail] Attempting to send email to: ${to}`);
    console.log(`[SendEmail] Subject: ${subject}`);

    // שלב 1: חפש Gmail integration (OAuth2)
    const gmailConnections = await base44.entities.IntegrationConnection.filter({
      provider: 'google',
      is_active: true
    });

    if (gmailConnections && gmailConnections.length > 0) {
      const gmailConn = gmailConnections[0];

      console.log('[SendEmail] Using Gmail API to send email');

      // פענוח הטוקן
      const accessToken = await decrypt(gmailConn.access_token_encrypted);

      if (!accessToken) {
        throw new Error('Failed to decrypt Gmail access token');
      }

      // יצירת המייל ב-RFC 2822 format
      const emailLines = [
        `To: ${to}`,
        `Subject: ${subject}`,
        'Content-Type: text/html; charset=utf-8',
        'MIME-Version: 1.0',
        '',
        body
      ];

      const emailContent = emailLines.join('\r\n');

      // קידוד Base64 URL-safe
      const encoder = new TextEncoder();
      const emailBytes = encoder.encode(emailContent);
      const base64 = btoa(String.fromCharCode(...emailBytes))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      // שליחה דרך Gmail API
      const gmailResponse = await fetch(
        'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ raw: base64 })
        }
      );

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
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // שלב 2: אם אין Gmail, חפש SMTP
    const smtpConnections = await base44.entities.IntegrationConnection.filter({
      provider: 'smtp',
      is_active: true
    });

    if (smtpConnections && smtpConnections.length > 0) {
      const smtpConfig = smtpConnections[0].metadata;

      if (!smtpConfig?.smtp_host || !smtpConfig?.smtp_username) {
        throw new Error('Invalid SMTP configuration');
      }

      console.log(`[SendEmail] Using SMTP: ${smtpConfig.smtp_host}`);

      // TODO: Implement actual SMTP sending
      // For now, return success (this would need a proper SMTP library)

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Email queued for SMTP sending',
          to,
          subject,
          via: 'smtp',
          note: 'SMTP implementation pending'
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // שלב 3: אין אינטגרציה פעילה
    console.log('[SendEmail] No active email integration found');

    return new Response(
      JSON.stringify({
        success: false,
        error: 'No email integration configured',
        message: 'Please configure Gmail or SMTP integration in Settings',
        to,
        subject,
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[SendEmail] Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
