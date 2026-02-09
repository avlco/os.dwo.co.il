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

// =====================================================================
// UNIFIED EMAIL BRAND & LAYOUT (aligned across all execution paths)
// =====================================================================
const EMAIL_BRAND = {
  colors: {
    primary: '#b62f12',
    text: '#000000',
    textLight: '#545454',
    bg: '#f3f4f6',
    card: '#ffffff',
  },
  logoUrl: 'https://dwo.co.il/wp-content/uploads/2020/04/Drori-Stav-logo-2.png',
  footer: 'DWO - משרד עורכי דין | www.dwo.co.il'
};

function generateEmailLayout(contentHtml, title, language = 'he') {
  const dir = language === 'he' ? 'rtl' : 'ltr';
  const textAlign = language === 'he' ? 'right' : 'left';
  return `<!DOCTYPE html><html dir="${dir}" lang="${language}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${title}</title></head><body style="margin:0;padding:0;background-color:${EMAIL_BRAND.colors.bg};font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;"><div style="padding:20px;background-color:${EMAIL_BRAND.colors.bg};"><table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:600px;margin:0 auto;background-color:${EMAIL_BRAND.colors.card};border-radius:8px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.05);"><tr><td style="background-color:${EMAIL_BRAND.colors.card};padding:20px;text-align:center;border-bottom:3px solid ${EMAIL_BRAND.colors.primary};"><img src="${EMAIL_BRAND.logoUrl}" alt="DWO Logo" style="height:50px;width:auto;max-width:200px;object-fit:contain;display:block;margin:0 auto;" width="200" height="50" /></td></tr><tr><td style="padding:30px 25px;color:${EMAIL_BRAND.colors.text};line-height:1.6;text-align:${textAlign};direction:${dir};font-size:16px;">${contentHtml}</td></tr><tr><td style="background-color:#f8fafc;padding:20px;text-align:center;font-size:12px;color:${EMAIL_BRAND.colors.textLight};border-top:1px solid #e2e8f0;direction:${dir};"><p style="margin:0;">${EMAIL_BRAND.footer}</p></td></tr></table></div></body></html>`;
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

// =====================================================================
// UNIFIED BATCH EXECUTOR (v2 - aligned across all execution paths)
// Handles ALL 6 action types. Uses asServiceRole for entity operations.
// =====================================================================

async function executeBatchActions(base44, batch, context) {
  const startTime = Date.now();
  const actions = batch.actions_current || [];
  const results = [];
  let successCount = 0;
  let failCount = 0;
  let skippedCount = 0;

  console.log(`[Executor] Starting execution of ${actions.length} actions for Batch ${batch.id}`);

  for (const action of actions) {
    // Skip disabled actions
    if (action.enabled === false) {
      results.push({
        action_type: action.action_type || action.action || 'unknown',
        id: action.idempotency_key,
        status: 'skipped',
        reason: 'disabled'
      });
      skippedCount++;
      continue;
    }

    const type = action.action_type || action.action;
    const config = action.config || {};
    const actionLang = config.language || 'he';

    try {
      let result = null;

      switch (type) {
        case 'send_email': {
          const formattedBody = `<div style="white-space:pre-wrap;font-family:'Segoe UI',Arial,sans-serif;color:${EMAIL_BRAND.colors.text};">${config.body}</div>`;
          const brandedBody = generateEmailLayout(formattedBody, config.subject, actionLang);
          console.log(`[Executor] Sending email to ${config.to} (lang: ${actionLang})`);
          result = await base44.functions.invoke('sendEmail', {
            to: config.to,
            subject: config.subject,
            body: brandedBody
          });
          const resultData = result?.data || result;
          if (resultData?.error) throw new Error(resultData.error);
          break;
        }

        case 'create_task': {
          result = await base44.asServiceRole.entities.Task.create({
            title: config.title,
            description: config.description,
            case_id: config.case_id || batch.case_id,
            client_id: config.client_id || batch.client_id,
            mail_id: batch.mail_id || null,
            status: 'pending',
            due_date: config.due_date
          });
          break;
        }

        case 'billing': {
          const billingCaseId = config.case_id || batch.case_id;
          if (!billingCaseId) {
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
          const calResultData = result?.data || result;
          if (calResultData?.error) throw new Error(calResultData.error);
          try {
            await base44.asServiceRole.entities.Deadline.create({
              case_id: config.case_id || batch.case_id,
              deadline_type: 'hearing',
              description: config.title || config.description || 'אירוע מאוטומציה',
              due_date: config.start_date ? config.start_date.split('T')[0] : new Date().toISOString().split('T')[0],
              status: 'pending',
              is_critical: false,
              metadata: {
                google_event_id: calResultData?.google_event_id || null,
                html_link: calResultData?.htmlLink || null,
                meet_link: calResultData?.meetLink || null,
                source: 'automation_batch'
              }
            });
          } catch (e) { console.warn('[Executor] Failed to create local Deadline:', e.message); }
          break;
        }

        case 'save_file': {
          console.log(`[Executor] Uploading files to Dropbox`);
          result = await base44.functions.invoke('uploadToDropbox', {
            mailId: config.mailId || batch.mail_id,
            caseId: config.caseId || batch.case_id,
            clientId: config.clientId || batch.client_id,
            documentType: config.documentType || config.document_type || 'other',
            schema_id: config.schema_id || null,
            path_selections: config.path_selections || {},
            filename_template: config.filename_template || '{Original_Filename}'
          });
          const uploadResultData = result?.data || result;
          if (uploadResultData?.error) throw new Error(uploadResultData.error);
          break;
        }

        case 'create_alert': {
          console.log(`[Executor] Creating alert: ${config.description || config.message} (lang: ${actionLang})`);
          result = await base44.asServiceRole.entities.Deadline.create({
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
              source: 'automation_batch',
              language: actionLang
            }
          });
          break;
        }

        default:
          throw new Error(`Unknown action type: ${type}`);
      }

      results.push({
        action_type: type,
        id: action.idempotency_key,
        status: 'success',
        data: result?.data || result?.id || 'ok'
      });
      successCount++;
      console.log(`[Executor] ✅ ${type} succeeded`);
    } catch (error) {
      console.error(`[Executor] ❌ ${type} failed: ${error.message}`);
      results.push({
        action_type: type,
        id: action.idempotency_key,
        status: 'failed',
        error: error.message
      });
      failCount++;
    }
  }

  const executionTimeMs = Date.now() - startTime;
  console.log(`[Executor] 🏁 Done: ${successCount} success, ${failCount} failed, ${skippedCount} skipped (${executionTimeMs}ms)`);

  return {
    success: successCount,
    failed: failCount,
    skipped: skippedCount,
    total: actions.length,
    results,
    execution_time_ms: executionTimeMs,
    executed_at: new Date().toISOString()
  };
}
// =====================================================================
// END UNIFIED BATCH EXECUTOR
// =====================================================================

// =====================================================================
// EXECUTION SUMMARY EMAIL
// =====================================================================

const ACTION_TYPE_LABELS = {
  send_email: { he: 'שליחת מייל', en: 'Send Email' },
  create_task: { he: 'יצירת משימה', en: 'Create Task' },
  billing: { he: 'חיוב שעות', en: 'Billing' },
  calendar_event: { he: 'אירוע ביומן', en: 'Calendar Event' },
  save_file: { he: 'שמירת קובץ', en: 'Save File' },
  create_alert: { he: 'התרעה/דוקטינג', en: 'Alert/Docketing' },
};

function renderExecutionSummaryEmail(data) {
  const {
    ruleName, mailSubject, mailFrom,
    caseNumber, caseTitle, clientName,
    results, executionTimeMs,
    approvedBy, executionPath
  } = data;

  const successResults = results.filter(r => r.status === 'success');
  const failedResults = results.filter(r => r.status === 'failed');
  const skippedResults = results.filter(r => r.status === 'skipped');

  const allSuccess = failedResults.length === 0 && successResults.length > 0;
  const allFailed = successResults.length === 0 && failedResults.length > 0;
  const statusColor = allSuccess ? '#10b981' : allFailed ? '#ef4444' : '#f59e0b';
  const statusIcon = allSuccess ? '✅' : allFailed ? '❌' : '⚠️';
  const statusText = allSuccess ? 'בוצע בהצלחה' : allFailed ? 'נכשל' : 'בוצע עם שגיאות';

  const renderActionRow = (r, icon) => {
    const label = ACTION_TYPE_LABELS[r.action_type]?.he || r.action_type || r.action || 'פעולה';
    const detail = r.error ? `<span style="color:#ef4444;font-size:13px;"> - ${r.error}</span>` :
                   r.reason ? `<span style="color:#6b7280;font-size:13px;"> (${r.reason})</span>` : '';
    return `<tr><td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;font-size:14px;">${icon} ${label}${detail}</td></tr>`;
  };

  let actionsHtml = '';
  if (successResults.length > 0) {
    actionsHtml += `<div style="margin-top:16px;"><p style="font-weight:600;color:#10b981;margin:0 0 6px;">פעולות שבוצעו בהצלחה (${successResults.length})</p><table role="presentation" width="100%" style="border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;">`;
    actionsHtml += successResults.map(r => renderActionRow(r, '✅')).join('');
    actionsHtml += `</table></div>`;
  }
  if (failedResults.length > 0) {
    actionsHtml += `<div style="margin-top:16px;"><p style="font-weight:600;color:#ef4444;margin:0 0 6px;">פעולות שנכשלו (${failedResults.length})</p><table role="presentation" width="100%" style="border:1px solid #fecaca;border-radius:6px;overflow:hidden;background:#fef2f2;">`;
    actionsHtml += failedResults.map(r => renderActionRow(r, '❌')).join('');
    actionsHtml += `</table></div>`;
  }
  if (skippedResults.length > 0) {
    actionsHtml += `<div style="margin-top:16px;"><p style="font-weight:600;color:#6b7280;margin:0 0 6px;">פעולות שדולגו (${skippedResults.length})</p><table role="presentation" width="100%" style="border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;background:#f9fafb;">`;
    actionsHtml += skippedResults.map(r => renderActionRow(r, '⏭️')).join('');
    actionsHtml += `</table></div>`;
  }

  const metaRows = [
    { label: 'כלל אוטומציה', value: ruleName },
    { label: 'מייל מקור', value: mailSubject ? `${mailSubject}${mailFrom ? ` (מאת: ${mailFrom})` : ''}` : null },
    caseNumber ? { label: 'תיק', value: `${caseNumber}${caseTitle ? ` - ${caseTitle}` : ''}` } : null,
    clientName ? { label: 'לקוח', value: clientName } : null,
    approvedBy ? { label: 'אושר ע״י', value: approvedBy } : null,
  ].filter(Boolean);

  const metaHtml = metaRows.map(r =>
    `<tr><td style="padding:4px 10px;font-weight:600;color:#374151;font-size:14px;white-space:nowrap;">${r.label}:</td><td style="padding:4px 10px;color:#6b7280;font-size:14px;">${r.value}</td></tr>`
  ).join('');

  const executionSec = executionTimeMs ? (executionTimeMs / 1000).toFixed(1) : null;
  const footerMeta = executionSec ? `<p style="margin-top:16px;font-size:12px;color:#9ca3af;">זמן ביצוע: ${executionSec} שניות</p>` : '';

  const contentHtml = `
    <div style="text-align:center;margin-bottom:20px;">
      <div style="display:inline-block;width:48px;height:48px;border-radius:50%;background:${statusColor}15;text-align:center;line-height:48px;font-size:24px;">${statusIcon}</div>
      <h2 style="margin:10px 0 4px;color:#1f2937;font-size:20px;">סיכום ביצוע אוטומציה</h2>
      <p style="margin:0;color:${statusColor};font-weight:600;font-size:16px;">${statusText}</p>
    </div>
    <table role="presentation" width="100%" style="background:#f9fafb;border-radius:8px;padding:2px;margin-bottom:8px;">${metaHtml}</table>
    ${actionsHtml}
    ${footerMeta}
  `;

  return generateEmailLayout(contentHtml, `סיכום ביצוע: ${ruleName}`, 'he');
}

async function sendExecutionSummaryEmail(base44, summaryData) {
  const { recipientEmail, ruleName, executionSummary } = summaryData;
  if (!recipientEmail) {
    console.warn('[Summary] No recipient email for execution summary - skipping');
    return;
  }
  try {
    const emailHtml = renderExecutionSummaryEmail({
      ...summaryData,
      results: executionSummary?.results || [],
      executionTimeMs: executionSummary?.execution_time_ms
    });
    await base44.functions.invoke('sendEmail', {
      to: recipientEmail,
      subject: `סיכום ביצוע: ${ruleName}`,
      body: emailHtml
    });
    console.log(`[Summary] ✅ Execution summary sent to ${recipientEmail}`);
  } catch (e) {
    console.warn(`[Summary] Failed to send execution summary email: ${e.message}`);
  }
}
// =====================================================================
// END EXECUTION SUMMARY EMAIL
// =====================================================================

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

    // 8.2 שליחת מייל סיכום ביצוע לגורם המאשר
    try {
      let summaryCase = null;
      let summaryClient = null;
      if (freshBatch.case_id) {
        try { summaryCase = await base44.asServiceRole.entities.Case.get(freshBatch.case_id); } catch (e) {}
      }
      if (freshBatch.client_id) {
        try { summaryClient = await base44.asServiceRole.entities.Client.get(freshBatch.client_id); } catch (e) {}
      }
      await sendExecutionSummaryEmail(base44, {
        recipientEmail: payload.approver_email,
        ruleName: freshBatch.automation_rule_name || 'אוטומציה',
        mailSubject: freshBatch.mail_subject,
        mailFrom: freshBatch.mail_from,
        caseNumber: summaryCase?.case_number || null,
        caseTitle: summaryCase?.title || null,
        clientName: summaryClient?.name || null,
        approvedBy: payload.approver_email,
        executionPath: 'approval_email',
        executionSummary
      });
    } catch (summaryErr) {
      console.warn('[Approval] Failed to send execution summary:', summaryErr.message);
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