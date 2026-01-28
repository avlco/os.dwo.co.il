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
// 2. HTML RESPONSE TEMPLATES (Success/Error Pages)
// ========================================

const BRAND = {
  logoUrl: 'https://dwo.co.il/wp-content/uploads/2020/04/Drori-Stav-logo-2.png',
  colors: { success: '#10b981', error: '#ef4444', text: '#1f2937', bg: '#f9fafb' }
};

function getHtmlPage(title, message, isError = false) {
  const color = isError ? BRAND.colors.error : BRAND.colors.success;
  const icon = isError ? '✕' : '✓';
  
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
// 3. EXECUTION ENGINE (Embedded)
// ========================================

async function executeBatchActions(base44, batch, context) {
  const actions = batch.actions_current || [];
  const results = [];
  let successCount = 0;
  let failCount = 0;

  console.log(`[Executor] Starting execution of ${actions.length} actions for Batch ${batch.id}`);

  for (const action of actions) {
    try {
      const type = action.action_type || action.action;
      const config = action.config || {};
      let result = null;

      // --- Execute based on type ---
      switch (type) {
        case 'send_email':
          result = await base44.functions.invoke('sendEmail', {
            to: config.to,
            subject: config.subject,
            body: config.body
          });
          if (result.error) throw new Error(result.error);
          break;

        case 'create_task':
          result = await base44.entities.Task.create({
            title: config.title,
            description: config.description,
            case_id: batch.case_id,
            client_id: batch.client_id,
            status: 'pending',
            due_date: config.due_date
          });
          break;

        case 'billing':
          result = await base44.entities.TimeEntry.create({
            case_id: batch.case_id,
            description: config.description || 'Automated billing',
            hours: config.hours,
            rate: config.rate || config.hourly_rate || 0,
            date_worked: new Date().toISOString().split('T')[0],
            is_billable: true
          });
          break;
          
        case 'calendar_event':
          // Re-use logic or call helper if available. For now, we assume simple success if logging works
          // Ideally, we would invoke 'createCalendarEvent'
           result = await base44.functions.invoke('createCalendarEvent', {
             ...config,
             case_id: batch.case_id
           });
           if (result.error) throw new Error(result.error);
           break;
      }

      results.push({ id: action.idempotency_key, status: 'success', data: result });
      successCount++;
    } catch (error) {
      console.error(`[Executor] Action failed: ${error.message}`);
      results.push({ id: action.idempotency_key, status: 'failed', error: error.message });
      failCount++;
    }
  }

  return {
    success: successCount,
    failed: failCount,
    total: actions.length,
    results,
    executed_at: new Date().toISOString()
  };
}

// ========================================
// 4. MAIN HANDLER
// ========================================

Deno.serve(async (req) => {
  // CORS Preflight
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // 1. Extract Token from URL (GET support)
    const url = new URL(req.url);
    const token = url.searchParams.get('token');

    // Prepare helper for HTML responses
    const respondHtml = (title, msg, isError = false, status = 200) => {
      return new Response(getHtmlPage(title, msg, isError), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' }
      });
    };

    if (!token) {
      return respondHtml('שגיאה', 'קישור לא תקין (חסר טוקן).', true, 400);
    }

    const base44 = createClientFromRequest(req);
    const secret = Deno.env.get('APPROVAL_HMAC_SECRET');
    if (!secret) return respondHtml('שגיאה טכנית', 'שגיאת הגדרות שרת.', true, 500);

    // 2. Verify Token
    const payload = await verifyApprovalToken(token, secret);
    if (!payload || payload.action !== 'approve') {
      return respondHtml('קישור פג תוקף', 'הקישור אינו תקין או שפג תוקפו.', true, 401);
    }

    // 3. Fetch & Validate Batch
    const batch = await base44.asServiceRole.entities.ApprovalBatch.get(payload.batch_id);
    if (!batch) return respondHtml('לא נמצא', 'בקשת האישור לא נמצאה.', true, 404);

    if (batch.status !== 'pending' && batch.status !== 'failed') {
      // If already approved, show success message (idempotency)
      if (batch.status === 'approved' || batch.status === 'executed') {
        return respondHtml('הפעולה כבר בוצעה', 'הבקשה אושרה ובוצעה כבר בעבר.');
      }
      return respondHtml('סטטוס שגוי', `הבקשה נמצאת בסטטוס ${batch.status} ולא ניתן לאשרה.`, true, 409);
    }

    // 4. Anti-Replay (Nonce Check)
    const nonceHash = await hashNonce(payload.nonce, secret);
    try {
      await base44.asServiceRole.entities.ApprovalNonce.create({
        batch_id: batch.id,
        nonce_hash: nonceHash,
        expires_at: new Date(payload.exp).toISOString(),
        used_at: new Date().toISOString()
      });
    } catch (e) {
      // If duplicate nonce, allow if it's a retry of a failed execution, otherwise block
      const exists = await base44.asServiceRole.entities.ApprovalNonce.filter({ nonce_hash: nonceHash });
      if (exists.length > 0 && batch.status !== 'failed') {
         return respondHtml('הקישור כבר נוצל', 'נעשה כבר שימוש בקישור זה.', true, 409);
      }
    }

    // 5. Update Status -> Approved
    await base44.asServiceRole.entities.ApprovalBatch.update(batch.id, {
      status: 'approved',
      approved_at: new Date().toISOString(),
      approved_via: 'email_quick_link',
      approved_by_email: payload.approver_email
    });

    // 6. Execute Actions
    await base44.asServiceRole.entities.ApprovalBatch.update(batch.id, { status: 'executing' });
    
    // Re-fetch to be safe
    const freshBatch = await base44.asServiceRole.entities.ApprovalBatch.get(batch.id);
    const executionSummary = await executeBatchActions(base44, freshBatch);
    
    const finalStatus = executionSummary.failed > 0 ? 'executed_with_errors' : 'executed';
    
    // 7. Final Update
    await base44.asServiceRole.entities.ApprovalBatch.update(batch.id, {
      status: finalStatus,
      execution_summary: executionSummary
    });

    // 8. Return Success Page
    if (executionSummary.failed > 0) {
      return respondHtml(
        'בוצע עם שגיאות', 
        `הפעולה אושרה, אך ${executionSummary.failed} מתוך ${executionSummary.total} פעולות נכשלו. אנא בדוק במערכת.`, 
        true // Show as warning/error style
      );
    }

    return respondHtml('בוצע בהצלחה', 'כל הפעולות אושרו ובוצעו בהצלחה!');

  } catch (error) {
    console.error('Critical Public Approval Error:', error);
    return new Response(
      getHtmlPage('שגיאה בלתי צפויה', 'אירעה שגיאה בעיבוד הבקשה. אנא נסה שנית.', true),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }
});