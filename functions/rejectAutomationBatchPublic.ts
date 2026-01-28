// @ts-nocheck
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ========================================
// 1. CRYPTO VERIFICATION (Embedded)
// ========================================

function base64UrlDecode(str) {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) base64 += '=';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function verifySignature(data, signature, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['verify']
  );
  const signatureBytes = base64UrlDecode(signature);
  return await crypto.subtle.verify(
    'HMAC', key, signatureBytes, encoder.encode(data)
  );
}

async function verifyApprovalToken(token, secret) {
  try {
    const [payloadB64, signature] = token.split('.');
    if (!payloadB64 || !signature) return null;

    // Verify signature
    const isValid = await verifySignature(payloadB64, signature, secret);
    if (!isValid) return null;

    // Decode payload
    const payloadJson = new TextDecoder().decode(base64UrlDecode(payloadB64));
    const payload = JSON.parse(payloadJson);

    // Check expiration
    if (Date.now() > payload.exp) return null;

    return payload;
  } catch (e) {
    console.error('Token verification failed:', e);
    return null;
  }
}

async function hashNonce(nonce, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign']
  );
  const signature = await crypto.subtle.sign(
    'HMAC', key, encoder.encode(nonce)
  );
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

// ========================================
// 2. HTML RESPONSE TEMPLATES (Cancel Pages)
// ========================================

const BRAND = {
  logoUrl: 'https://dwo.co.il/wp-content/uploads/2020/04/Drori-Stav-logo-2.png',
  colors: { success: '#10b981', error: '#ef4444', warning: '#f59e0b', text: '#1f2937', bg: '#f9fafb' }
};

function getHtmlPage(title, message, type = 'success') {
  let color = BRAND.colors.success;
  let icon = '✓';

  if (type === 'error') {
    color = BRAND.colors.error;
    icon = '✕';
  } else if (type === 'cancel') {
    color = BRAND.colors.warning; // Orange for cancellation
    icon = '⊘'; // Blocked/Cancelled icon
  }
  
  return `
    <!DOCTYPE html>
    <html dir="rtl" lang="he">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title}</title>
      <style>
        body { font-family: 'Segoe UI', system-ui, sans-serif; background-color: ${BRAND.colors.bg}; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
        .card { background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); text-align: center; max-width: 400px; width: 90%; }
        .icon-circle { width: 80px; height: 80px; border-radius: 50%; background-color: ${color}15; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; }
        .icon { font-size: 40px; color: ${color}; }
        h1 { color: ${BRAND.colors.text}; margin: 0 0 10px; font-size: 24px; }
        p { color: #6b7280; line-height: 1.5; margin-bottom: 25px; }
        .logo { height: 40px; margin-bottom: 30px; object-fit: contain; }
        .btn { background-color: ${BRAND.colors.text}; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-size: 14px; display: inline-block; }
      </style>
    </head>
    <body>
      <div class="card">
        <img src="${BRAND.logoUrl}" alt="DWO" class="logo">
        <div class="icon-circle"><span class="icon">${icon}</span></div>
        <h1>${title}</h1>
        <p>${message}</p>
        <a href="javascript:window.close()" class="btn">סגור חלונית</a>
      </div>
    </body>
    </html>
  `;
}

// ========================================
// 3. MAIN HANDLER
// ========================================

Deno.serve(async (req) => {
  // CORS Preflight
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // 1. Extract Token from URL (GET support)
    const url = new URL(req.url);
    const token = url.searchParams.get('token');

    // Prepare helper for HTML responses
    const respondHtml = (title, msg, type = 'success', status = 200) => {
      return new Response(getHtmlPage(title, msg, type), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' }
      });
    };

    if (!token) {
      return respondHtml('שגיאה', 'קישור לא תקין (חסר טוקן).', 'error', 400);
    }

    const base44 = createClientFromRequest(req);
    const secret = Deno.env.get('APPROVAL_HMAC_SECRET');
    if (!secret) return respondHtml('שגיאה טכנית', 'שגיאת הגדרות שרת.', 'error', 500);

    // 2. Verify Token
    const payload = await verifyApprovalToken(token, secret);
    
    // Ensure payload valid AND action is 'reject'
    if (!payload || payload.action !== 'reject') {
      return respondHtml('קישור פג תוקף', 'הקישור אינו תקין או שפג תוקפו.', 'error', 401);
    }

    // 3. Fetch & Validate Batch
    const batch = await base44.asServiceRole.entities.ApprovalBatch.get(payload.batch_id);
    if (!batch) return respondHtml('לא נמצא', 'בקשת האישור לא נמצאה.', 'error', 404);

    if (batch.status !== 'pending') {
      if (batch.status === 'cancelled') {
        return respondHtml('בוטל כבר', 'הבקשה כבר בוטלה בעבר.', 'cancel');
      }
      if (batch.status === 'approved' || batch.status === 'executed') {
        return respondHtml('מאוחר מדי', 'לא ניתן לבטל: הבקשה כבר אושרה ובוצעה.', 'error', 409);
      }
    }

    // 4. Anti-Replay (Nonce Check)
    const nonceHash = await hashNonce(payload.nonce, secret);
    try {
      await base44.asServiceRole.entities.ApprovalNonce.create({
        batch_id: batch.id,
        nonce_hash: nonceHash,
        expires_at: new Date(payload.exp).toISOString(),
        used_at: new Date().toISOString(),
        action: 'reject'
      });
    } catch (e) {
      // If nonce exists
      const exists = await base44.asServiceRole.entities.ApprovalNonce.filter({ nonce_hash: nonceHash });
      if (exists.length > 0) {
         return respondHtml('הקישור כבר נוצל', 'נעשה כבר שימוש בקישור זה.', 'error', 409);
      }
    }

    // 5. Update Status -> Cancelled
    await base44.asServiceRole.entities.ApprovalBatch.update(batch.id, {
      status: 'cancelled',
      metadata: {
        ...batch.metadata,
        cancelled_at: new Date().toISOString(),
        cancelled_via: 'email_quick_link',
        cancelled_by_email: payload.approver_email
      }
    });

    // 6. Return Cancellation Success Page
    return respondHtml('הפעולה בוטלה', 'הבקשה בוטלה בהצלחה. האוטומציה נעצרה ולא תבוצע.', 'cancel');

  } catch (error) {
    console.error('Critical Public Reject Error:', error);
    return new Response(
      getHtmlPage('שגיאה בלתי צפויה', 'אירעה שגיאה בעיבוד הבקשה.', 'error'),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }
});
