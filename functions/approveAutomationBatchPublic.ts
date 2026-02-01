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

const EMAIL_BRAND = {
  logoUrl: 'https://dwo.co.il/wp-content/uploads/2020/04/Drori-Stav-logo-2.png',
  footer: '© DWO – דרורי, שטב ושות׳ | משרד עורכי דין',
  color: '#1a3c5e'
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

  for (const action of actions.filter(a => a.enabled !== false)) {
    try {
      const type = action.action_type || action.action;
      const config = action.config || {};
      let result = null;

      switch (type) {
        case 'send_email': {
          result = await base44.functions.invoke('sendEmail', {
            to: config.to,
            subject: config.subject,
            body: config.body
          });
          const resultData = result?.data || result;
          if (resultData?.error) throw new Error(resultData.error);
          break;
        }

        case 'create_task':
          result = await base44.asServiceRole.entities.Task.create({
            title: config.title,
            description: config.description,
            case_id: batch.case_id,
            client_id: batch.client_id,
            status: 'pending',
            due_date: config.due_date
          });
          break;

        case 'billing': {
          result = await base44.asServiceRole.entities.TimeEntry.create({
            case_id: config.case_id || batch.case_id,
            client_id: config.client_id || batch.client_id,
            description: config.description || 'Automated billing',
            hours: config.hours,
            rate: config.rate || config.hourly_rate || 0,
            date_worked: config.date_worked || new Date().toISOString().split('T')[0],
            is_billable: true,
            billed: false,
            user_email: config.user_email || null
          });
          try {
            const entryId = result?.id || result?.data?.id;
            if (entryId) {
              await base44.functions.invoke('syncBillingToSheets', { timeEntryId: entryId });
            }
          } catch (e) { console.warn('[Executor] Sheets sync failed:', e.message); }
          break;
        }
          
        case 'calendar_event': {
          result = await base44.functions.invoke('createCalendarEvent', {
            ...config,
            case_id: batch.case_id
          });
          const resultData = result?.data || result;
          if (resultData?.error) throw new Error(resultData.error);
          try {
            await base44.asServiceRole.entities.Deadline.create({
              case_id: config.case_id || batch.case_id,
              deadline_type: 'hearing',
              description: config.title || config.description || 'אירוע מאוטומציה',
              due_date: config.start_date || new Date().toISOString().split('T')[0],
              status: 'pending',
              is_critical: false,
              metadata: {
                google_event_id: resultData?.google_event_id || null,
                html_link: resultData?.htmlLink || null,
                meet_link: resultData?.meetLink || null,
                source: 'automation_batch_public'
              }
            });
          } catch (e) { console.warn('[Executor] Failed to create local Deadline:', e.message); }
          break;
        }
      }

      results.push({ id: action.idempotency_key, status: 'success', data: result?.data || 'ok' });
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
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // 1. Extract Token - from URL (GET/browser) or POST body (SDK)
    const url = new URL(req.url);
    let token = url.searchParams.get('token');
    const isApiCall = req.method === 'POST';

    if (!token && isApiCall) {
      try {
        const body = await req.json();
        token = body?.token;
      } catch (e) { /* no body */ }
    }

    // Prepare HTML response helper (for browser/GET)
    const respondHtml = (title, msg, isError = false, status = 200) => {
      return new Response(getHtmlPage(title, msg, isError), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' }
      });
    };

    // Dual response: JSON for SDK/POST, HTML for browser/GET
    const respond = (data, status = 200) => {
      if (isApiCall) {
        return new Response(JSON.stringify(data), {
          status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      return respondHtml(
        data.title || (data.success ? 'הצלחה' : 'שגיאה'),
        data.message || (data.success ? 'הפעולה בוצעה' : 'אירעה שגיאה'),
        !data.success,
        status
      );
    };

    if (!token) {
      return respond({ success: false, code: 'MISSING_TOKEN', title: 'שגיאה', message: 'קישור לא תקין (חסר טוקן).' }, 400);
    }

    const base44 = createClientFromRequest(req);
    const secret = Deno.env.get('APPROVAL_HMAC_SECRET');
    if (!secret) {
      return respond({ success: false, code: 'SERVER_ERROR', title: 'שגיאה טכנית', message: 'שגיאת הגדרות שרת.' }, 500);
    }

    // 2. Verify Token
    const payload = await verifyApprovalToken(token, secret);
        if (!payload || !['approve', 'reject'].includes(payload.action)) {
      return respond({ success: false, code: 'INVALID_TOKEN', title: 'קישור פג תוקף', message: 'הקישור אינו תקין או שפג תוקפו.' }, 401);
    }

    // 3. Fetch & Validate Batch
    const batch = await base44.asServiceRole.entities.ApprovalBatch.get(payload.batch_id);
    if (!batch) {
      return respond({ success: false, code: 'NOT_FOUND', title: 'לא נמצא', message: 'בקשת האישור לא נמצאה.' }, 404);
    }

    if (batch.status !== 'pending' && batch.status !== 'failed') {
      if (batch.status === 'approved' || batch.status === 'executed') {
        return respond({ success: true, code: 'ALREADY_PROCESSED', status: batch.status, batch_id: batch.id, title: 'הפעולה כבר בוצעה', message: 'הבקשה אושרה ובוצעה כבר בעבר.' });
      }
      return respond({ success: false, code: 'ALREADY_PROCESSED', status: batch.status, batch_id: batch.id, title: 'סטטוס שגוי', message: `הבקשה נמצאת בסטטוס ${batch.status} ולא ניתן לאשרה.` }, 409);
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
      const exists = await base44.asServiceRole.entities.ApprovalNonce.filter({ nonce_hash: nonceHash });
      if (exists.length > 0 && batch.status !== 'failed') {
        return respond({ success: false, code: 'TOKEN_ALREADY_USED', batch_id: batch.id, title: 'הקישור כבר נוצל', message: 'נעשה כבר שימוש בקישור זה.' }, 409);
      }
    }

        // 5. Handle Reject Action
    if (payload.action === 'reject') {
      await base44.asServiceRole.entities.ApprovalBatch.update(batch.id, {
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancel_reason: 'Rejected via email link',
        approved_by_email: payload.approver_email
      });
      
      // עדכון סטטוס המייל ל-automation_cancelled
      if (batch.mail_id) {
        try {
          await base44.asServiceRole.entities.Mail.update(batch.mail_id, {
            processing_status: 'automation_cancelled'
          });
        } catch (e) {
          console.warn('[Approval] Failed to update mail status to cancelled:', e.message);
        }
      }

      // עדכון ה-Activity log לסטטוס cancelled
      try {
        const activities = await base44.asServiceRole.entities.Activity.filter({
          'metadata.mail_id': batch.mail_id,
          activity_type: 'automation_log',
          status: 'pending'
        });
        for (const activity of activities) {
          await base44.asServiceRole.entities.Activity.update(activity.id, {
            status: 'cancelled'
          });
        }
      } catch (e) {
        console.warn('[Approval] Failed to update Activity log to cancelled:', e.message);
      }
      
      return respond({
        success: true,
        batch_id: batch.id,
        status: 'cancelled',
        title: 'הבקשה בוטלה',
        message: 'בקשת האישור בוטלה בהצלחה.'
      });
    }

    // 6. Update Status -> Approved
    await base44.asServiceRole.entities.ApprovalBatch.update(batch.id, {
      status: 'approved',
      approved_at: new Date().toISOString(),
      approved_via: 'email_quick_link',
      approved_by_email: payload.approver_email
    });

    // 7. Execute Actions
    await base44.asServiceRole.entities.ApprovalBatch.update(batch.id, { status: 'executing' });
    
    const freshBatch = await base44.asServiceRole.entities.ApprovalBatch.get(batch.id);
    const executionSummary = await executeBatchActions(base44, freshBatch);
    
    // קביעת סטטוס מדויק
    let finalStatus = 'executed';
    if (executionSummary.failed > 0 && executionSummary.success === 0) {
      finalStatus = 'failed';
    } else if (executionSummary.failed > 0 && executionSummary.success > 0) {
      finalStatus = 'executed'; // הושלם עם שגיאות חלקיות
    }
    
    // 8. Final Update
    await base44.asServiceRole.entities.ApprovalBatch.update(batch.id, {
      status: finalStatus,
      execution_summary: executionSummary
    });
    
    // 8.1 עדכון סטטוס המייל המקורי
    if (batch.mail_id) {
      try {
        let mailProcessingStatus = 'automation_complete';
        if (finalStatus === 'failed') {
          mailProcessingStatus = 'automation_failed';
        } else if (finalStatus === 'cancelled') {
          mailProcessingStatus = 'automation_cancelled';
        }
        await base44.asServiceRole.entities.Mail.update(batch.mail_id, {
          processing_status: mailProcessingStatus
        });
      } catch (e) {
        console.warn('[Approval] Failed to update mail status:', e.message);
      }
    }

    // 9. Return Result
    if (executionSummary.failed > 0) {
      return respond({
        success: true,
        batch_id: batch.id,
        status: finalStatus,
        execution_summary: executionSummary,
        title: 'בוצע עם שגיאות',
        message: `הפעולה אושרה, אך ${executionSummary.failed} מתוך ${executionSummary.total} פעולות נכשלו. אנא בדוק במערכת.`
      });
    }

    return respond({
      success: true,
      batch_id: batch.id,
      status: finalStatus,
      execution_summary: executionSummary,
      title: 'בוצע בהצלחה',
      message: 'כל הפעולות אושרו ובוצעו בהצלחה!'
    });

  } catch (error) {
    console.error('Critical Public Approval Error:', error);
    const isApiCall = req.method === 'POST';
    if (isApiCall) {
      return new Response(JSON.stringify({ success: false, code: 'INTERNAL_ERROR', message: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    return new Response(
      getHtmlPage('שגיאה בלתי צפויה', 'אירעה שגיאה בעיבוד הבקשה. אנא נסה שנית.', true),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }
});