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
  colors: {
    primary: '#b62f12',
    secondary: '#545454',
    bg: '#f3f4f6',
    card: '#ffffff',
    text: '#000000',
    textLight: '#545454',
    link: '#b62f12'
  },
  logoUrl: 'https://dwo.co.il/wp-content/uploads/2020/04/Drori-Stav-logo-2.png'
};

function generateEmailLayout(contentHtml, title, language = 'he') {
  const isHebrew = language === 'he';
  const dir = isHebrew ? 'rtl' : 'ltr';
  const textAlign = isHebrew ? 'right' : 'left';
  
  const t = {
    footer_contact: 'DWO - משרד עורכי דין | www.dwo.co.il',
    footer_disclaimer: isHebrew 
      ? 'הודעה זו מכילה מידע סודי ומוגן. אם קיבלת הודעה זו בטעות, אנא מחק אותה ודווח לשולח.'
      : 'This message contains confidential information. If you received it in error, please delete it and notify the sender.'
  };

  const s = {
    body: `margin: 0; padding: 0; background-color: ${EMAIL_BRAND.colors.bg}; font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;`,
    wrapper: `padding: 20px; background-color: ${EMAIL_BRAND.colors.bg};`,
    container: `max-width: 600px; margin: 0 auto; background-color: ${EMAIL_BRAND.colors.card}; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);`,
    header: `background-color: ${EMAIL_BRAND.colors.card}; padding: 20px; text-align: center; border-bottom: 3px solid ${EMAIL_BRAND.colors.primary};`,
    logo: `height: 50px; width: auto; max-width: 200px; object-fit: contain; display: block; margin: 0 auto;`,
    content: `padding: 30px 25px; color: ${EMAIL_BRAND.colors.text}; line-height: 1.6; text-align: ${textAlign}; direction: ${dir}; font-size: 16px;`,
    footer: `background-color: #f8fafc; padding: 20px; text-align: center; font-size: 12px; color: ${EMAIL_BRAND.colors.textLight}; border-top: 1px solid #e2e8f0; direction: ${dir};`,
    link: `color: ${EMAIL_BRAND.colors.link}; text-decoration: none; font-weight: bold;`
  };

  return `
<!DOCTYPE html>
<html dir="${dir}" lang="${language}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="${s.body}">
  <div style="${s.wrapper}">
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="${s.container}">
      <tr>
        <td style="${s.header}">
           <img src="${EMAIL_BRAND.logoUrl}" alt="DWO Logo" style="${s.logo}" width="200" height="50" />
        </td>
      </tr>
      <tr>
        <td style="${s.content}">
          ${contentHtml}
        </td>
      </tr>
      <tr>
        <td style="${s.footer}">
          <p style="margin: 0 0 10px 0;">${t.footer_contact}</p>
          <p style="margin: 0; opacity: 0.7;">${t.footer_disclaimer}</p>
        </td>
      </tr>
    </table>
  </div>
</body>
</html>`.trim();
}
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
  
  // Get client language for proper execution (fallback only - should already be in action config)
  let clientLanguage = 'he';
  if (batch.client_id) {
    try {
      const client = await base44.asServiceRole.entities.Client.get(batch.client_id);
      if (client?.communication_language) clientLanguage = client.communication_language;
    } catch (e) { console.warn('[Executor] Failed to fetch client language'); }
  }

  console.log(`[Executor] Starting execution of ${actions.length} actions for Batch ${batch.id}`);
  console.log(`[Executor] Client language fallback: ${clientLanguage}`);

  for (const action of actions.filter(a => a.enabled !== false)) {
    try {
      const type = action.action_type || action.action;
      const config = action.config || {};
      
      // Language is already determined and embedded in config by executeAutomationRule
      // Use config.language if available, otherwise fall back to client language
      const actionLang = config.language || clientLanguage;
      
      let result = null;

      switch (type) {
        case 'send_email': {
          // Subject and body in config are already in the correct language (determined by executeAutomationRule)
          const formattedBody = `<div style="white-space: pre-wrap; font-family: 'Segoe UI', Arial, sans-serif; color: ${EMAIL_BRAND.colors.text};">${config.body}</div>`;
          const brandedBody = generateEmailLayout(formattedBody, config.subject, actionLang);
          console.log(`[Executor] Sending email to ${config.to} in language: ${actionLang}`);
          result = await base44.functions.invoke('sendEmail', {
            to: config.to,
            subject: config.subject,
            body: brandedBody
          });
          if (result.error) throw new Error(result.error);
          break;
        }

        case 'create_task':
          result = await base44.asServiceRole.entities.Task.create({
            title: config.title,
            description: config.description,
            case_id: config.case_id || batch.case_id,
            client_id: config.client_id || batch.client_id,
            status: 'pending',
            due_date: config.due_date
          });
          break;

        case 'billing': {
          // Validate required fields for billing
          const billingCaseId = config.case_id || batch.case_id;
          if (!billingCaseId) {
            console.warn(`[Executor] Billing action skipped: missing case_id`);
            throw new Error('Billing requires case_id - no case associated with this email');
          }
          
          result = await base44.asServiceRole.entities.TimeEntry.create({
            case_id: billingCaseId,
            client_id: config.client_id || batch.client_id,
            description: config.description || 'Automated billing',
            hours: config.hours || 0.25,
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
          // Title and description in config are already in the correct language
          console.log(`[Executor] Creating calendar event: ${config.title} (lang: ${actionLang})`);
          result = await base44.functions.invoke('createCalendarEvent', {
            title: config.title,
            description: config.description,
            start_date: config.start_date,
            duration_minutes: config.duration_minutes || 60,
            case_id: config.case_id || batch.case_id,
            client_id: config.client_id || batch.client_id,
            reminder_minutes: config.reminder_minutes || 1440,
            create_meet_link: config.create_meet_link || false,
            attendees: config.attendees || []
          });
          const resultData = result?.data || result;
          if (resultData?.error) throw new Error(resultData.error);
          try {
            await base44.asServiceRole.entities.Deadline.create({
              case_id: config.case_id || batch.case_id,
              deadline_type: 'hearing',
              description: config.title || config.description || 'אירוע מאוטומציה',
              due_date: config.start_date ? config.start_date.split('T')[0] : new Date().toISOString().split('T')[0],
              status: 'pending',
              is_critical: false,
              metadata: {
                google_event_id: resultData?.google_event_id || null,
                html_link: resultData?.htmlLink || null,
                meet_link: resultData?.meetLink || null,
                source: 'automation_batch_public',
                language: actionLang
              }
            });
          } catch (e) { console.warn('[Executor] Failed to create local Deadline:', e.message); }
          break;
        }
        
        case 'create_alert': {
          // Message/description in config is already in the correct language
          console.log(`[Executor] Creating alert: ${config.description || config.message} (lang: ${actionLang})`);
          try {
            const deadline = await base44.asServiceRole.entities.Deadline.create({
              case_id: config.case_id || batch.case_id,
              deadline_type: config.alert_type || config.deadline_type || 'reminder',
              description: config.description || config.message || 'התרעה מאוטומציה',
              due_date: config.due_date || new Date().toISOString().split('T')[0],
              status: 'pending',
              is_critical: config.is_critical || config.alert_type === 'urgent' || config.alert_type === 'deadline',
              assigned_to_email: config.recipients?.[0] || null,
              metadata: {
                execution_time: config.time_of_day,
                recipients: config.recipients || [],
                source: 'automation_batch_public',
                language: actionLang
              }
            });
            result = { id: deadline.id };
          } catch (e) {
            throw new Error(`Failed to create alert: ${e.message}`);
          }
          break;
        }
        
        case 'save_file': {
          console.log(`[Executor] Uploading files to Dropbox`);
          result = await base44.functions.invoke('uploadToDropbox', {
            mailId: config.mailId || batch.mail_id,
            caseId: config.caseId || batch.case_id,
            clientId: config.clientId || batch.client_id,
            documentType: config.documentType || config.document_type || 'other',
            subfolder: config.subfolder || ''
          });
          const uploadResult = result?.data || result;
          if (uploadResult?.error) throw new Error(uploadResult.error);
          break;
        }
        
        default:
          console.warn(`[Executor] Unknown action type: ${type}`);
          throw new Error(`Unknown action type: ${type}`);
      }

      results.push({ id: action.idempotency_key, status: 'success', data: result?.data || result?.id || 'ok' });
      successCount++;
    } catch (error) {
      console.error(`[Executor] Action ${action.action_type || action.action} failed: ${error.message}`);
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

    if (!['pending', 'editing', 'failed'].includes(batch.status)) {
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