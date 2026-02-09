// @ts-nocheck
/**
 * Handle Approval Batch operations from UI
 * * Methods:
 * - get: Fetch batch details
 * - update_actions: Update actions_current (with validation)
 * - approve: Approve and execute the batch
 * - cancel: Cancel the batch
 * * Authorization: Only approver_email, owner (user_id) or admin can access
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// =====================================================================
// UNIFIED BATCH EXECUTOR (v2 - aligned across all execution paths)
// Handles ALL 6 action types. Uses asServiceRole for entity operations.
// =====================================================================

/** Returns today's date as YYYY-MM-DD in Israel timezone */
function getTodayIsrael() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
}
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
            date_worked: config.date_worked || getTodayIsrael(),
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
              due_date: config.start_date ? config.start_date.split('T')[0] : getTodayIsrael(),
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
            due_date: config.due_date || getTodayIsrael(),
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
// Sends a summary email after automation execution completes.
// Recipient: approver (if approval flow) or handling lawyer (if direct).
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

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const base44 = createClientFromRequest(req);
    
    // Authenticate user
    const user = await base44.auth.me();
    if (!user) {
      return Response.json(
        { success: false, code: 'UNAUTHORIZED', message: 'Login required' },
        { status: 401, headers: corsHeaders }
      );
    }

    const body = await req.json();
    const { method, batch_id, actions_current, reason } = body;

    if (!batch_id) {
      return Response.json(
        { success: false, code: 'MISSING_BATCH_ID', message: 'batch_id is required' },
        { status: 400, headers: corsHeaders }
      );
    }

    console.log(`[HandleBatch] Method: ${method}, Batch: ${batch_id}, User: ${user.email}`);

    // Fetch batch
    const batch = await base44.asServiceRole.entities.ApprovalBatch.get(batch_id);
    
    if (!batch) {
      return Response.json(
        { success: false, code: 'BATCH_NOT_FOUND', message: 'Batch not found' },
        { status: 404, headers: corsHeaders }
      );
    }

    // =========================================================
    // AUTHORIZATION LOGIC (UPDATED WITH SCHEMA FIELDS)
    // =========================================================
    
    // =========================================================
    // 🔍 DIAGNOSTIC AUTH BLOCK (עם הדפסות לוג)
    // =========================================================
    
    const currentUserEmail = (user.email || '').trim().toLowerCase();
    const batchApprover = (batch.approver_email || '').trim().toLowerCase();
    
    // בדיקות ישירות
    const isApprover = batchApprover === currentUserEmail;
    const isAdminOrPartner = ['admin'].includes(user.role);
    const isOwner = batch.user_id === user.id;

    let isCaseLawyer = false;
    let debugCaseInfo = "No Case";

    if (batch.case_id) {
      try {
        const c = await base44.asServiceRole.entities.Case.get(batch.case_id);
        if (c) {
          // נרמול נתונים להשוואה
          const lawyerId = c.assigned_lawyer_id ? String(c.assigned_lawyer_id) : '';
          const userId = String(user.id);
          const lawyerEmail = (c.assigned_attorney_email || '').trim().toLowerCase();
          const caseOwnerId = c.user_id ? String(c.user_id) : '';

          // בדיקות
          const isIdMatch = lawyerId === userId;
          const isEmailMatch = lawyerEmail === currentUserEmail;
          const isCreatorMatch = caseOwnerId === userId;

          if (isIdMatch || isEmailMatch || isCreatorMatch) {
            isCaseLawyer = true;
          }

          // שמירת מידע ללוג
          debugCaseInfo = JSON.stringify({
            case_id: c.id,
            assigned_lawyer_id_DB: lawyerId,
            assigned_attorney_email_DB: lawyerEmail,
            case_user_id_DB: caseOwnerId
          });
        }
      } catch (e) {
        debugCaseInfo = "Error fetching case: " + e.message;
      }
    }

    // =========================================================
    // 🛑 TRAP: הדפסת האמת ללוג אם החסימה עומדת לקרות
    // =========================================================
    if (!isApprover && !isAdminOrPartner && !isOwner && !isCaseLawyer) {
      console.log('🚨 ACCESS DENIED DIAGNOSIS 🚨');
      console.log('--------------------------------------------------');
      console.log(`User Email (You):    [${currentUserEmail}]`);
      console.log(`User ID (You):       [${user.id}]`);
      console.log(`User Role (You):     [${user.role}]`);
      console.log('--------------------------------------------------');
      console.log(`Batch Approver:      [${batchApprover}]`);
      console.log(`Batch Owner ID:      [${batch.user_id}]`);
      console.log('--------------------------------------------------');
      console.log(`Case Context Info:   ${debugCaseInfo}`);
      console.log('--------------------------------------------------');
      
      return Response.json(
        { success: false, code: 'FORBIDDEN', message: 'Not authorized' },
        { status: 403, headers: corsHeaders }
      );
    }
    // (Authorization already handled above)

    // Handle methods
    switch (method) {
      case 'get': {
        let caseName = null;
        let clientName = null;
        
        if (batch.case_id) {
          try {
            const caseData = await base44.asServiceRole.entities.Case.get(batch.case_id);
            caseName = caseData?.case_number || caseData?.title;
          } catch (e) { console.warn('[HandleBatch] Failed to fetch case:', e.message); }
        }
        
        if (batch.client_id) {
          try {
            const client = await base44.asServiceRole.entities.Client.get(batch.client_id);
            clientName = client?.name;
          } catch (e) { console.warn('[HandleBatch] Failed to fetch client:', e.message); }
        }

        return Response.json(
          { 
            success: true, 
            batch: {
              ...batch,
              case_name: caseName,
              client_name: clientName
            }
          },
          { status: 200, headers: corsHeaders }
        );
      }

      case 'update_actions': {
        if (!['pending', 'editing'].includes(batch.status)) {
          return Response.json(
            { success: false, code: 'INVALID_STATUS', message: `Cannot edit batch with status: ${batch.status}` },
            { status: 400, headers: corsHeaders }
          );
        }

        const validationErrors = validateActionsUpdate(batch.actions_original, actions_current);
        if (validationErrors.length > 0) {
          return Response.json(
            { success: false, code: 'VALIDATION_ERROR', errors: validationErrors },
            { status: 422, headers: corsHeaders }
          );
        }

        await base44.asServiceRole.entities.ApprovalBatch.update(batch_id, {
          actions_current,
          status: 'editing'
        });

        return Response.json(
          { success: true, batch_id, status: 'editing', message: 'Actions updated' },
          { status: 200, headers: corsHeaders }
        );
      }

      case 'approve': {
        if (!['pending', 'editing'].includes(batch.status)) {
          return Response.json(
            { success: false, code: 'INVALID_STATUS', message: `Cannot approve batch with status: ${batch.status}` },
            { status: 400, headers: corsHeaders }
          );
        }

        console.log(`[HandleBatch] Approving batch ${batch_id}`);

                await base44.asServiceRole.entities.ApprovalBatch.update(batch_id, {
          status: 'executing',
          approved_at: new Date().toISOString(),
          approved_via: 'ui',
          approved_by_email: user.email
        });

        const freshBatch = await base44.asServiceRole.entities.ApprovalBatch.get(batch_id);
        
        // Execute actions using the embedded function
        let executionSummary;
        let finalStatus = 'executed';
        
        try {
          executionSummary = await executeBatchActions(base44, freshBatch, {
            executedBy: 'ui',
            userEmail: user.email
          });
          
          // קביעת סטטוס מדויק: אם יש כישלונות חלקיים או מלאים
          if (executionSummary.failed > 0 && executionSummary.success > 0) {
            finalStatus = 'executed'; // הושלם עם שגיאות חלקיות - עדיין executed אבל יש מידע ב-execution_summary
          } else if (executionSummary.failed > 0 && executionSummary.success === 0) {
            finalStatus = 'failed';
          }
        } catch (execError) {
          console.error('[HandleBatch] Execution error:', execError);
          finalStatus = 'failed';
          executionSummary = {
            total: batch.actions_current.length,
            success: 0,
            failed: batch.actions_current.length,
            skipped: 0,
            results: [],
            error: execError.message,
            executed_at: new Date().toISOString()
          };
        }

        await base44.asServiceRole.entities.ApprovalBatch.update(batch_id, {
          status: finalStatus,
          execution_summary: executionSummary,
          error_message: finalStatus === 'failed' ? (executionSummary.error || 'Execution failed') : null
        });

        // עדכון סטטוס המייל המקורי
        if (batch.mail_id) {
          try {
            const mailStatus = finalStatus === 'executed' ? 'automation_complete' : 'automation_failed';
            await base44.asServiceRole.entities.Mail.update(batch.mail_id, {
              processing_status: mailStatus
            });
            console.log(`[HandleBatch] Updated Mail ${batch.mail_id} status to ${mailStatus}`);
          } catch (mailErr) {
            console.warn('[HandleBatch] Failed to update mail status:', mailErr.message);
          }
        }

        // עדכון Activity log הקיים
        try {
          const activities = await base44.asServiceRole.entities.Activity.filter({
            activity_type: 'automation_log',
            'metadata.mail_id': batch.mail_id
          }, '-created_date', 10);
          
          const relatedActivity = activities.find(a => 
            a.status === 'pending' && 
            a.metadata?.rule_id === batch.automation_rule_id
          );
          
          if (relatedActivity) {
            const activityStatus = finalStatus === 'executed' 
              ? (executionSummary.failed > 0 ? 'completed_with_errors' : 'completed')
              : 'failed';
            
            await base44.asServiceRole.entities.Activity.update(relatedActivity.id, {
              status: activityStatus,
              metadata: {
                ...relatedActivity.metadata,
                execution_status: finalStatus,
                actions_summary: executionSummary.results?.map(r => ({
                  action: r.id,
                  status: r.status,
                  error: r.error
                })) || [],
                approved_at: new Date().toISOString(),
                approved_by: user.email,
                execution_time_ms: executionSummary.execution_time_ms
              }
            });
            console.log(`[HandleBatch] Updated Activity ${relatedActivity.id} status to ${activityStatus}`);
          }
        } catch (actErr) {
          console.warn('[HandleBatch] Failed to update activity log:', actErr.message);
        }

        // שליחת מייל סיכום ביצוע לגורם המאשר
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
            recipientEmail: freshBatch.approver_email,
            ruleName: freshBatch.automation_rule_name || 'אוטומציה',
            mailSubject: freshBatch.mail_subject,
            mailFrom: freshBatch.mail_from,
            caseNumber: summaryCase?.case_number || null,
            caseTitle: summaryCase?.title || null,
            clientName: summaryClient?.name || null,
            approvedBy: user.email,
            executionPath: 'approval_ui',
            executionSummary
          });
        } catch (summaryErr) {
          console.warn('[HandleBatch] Failed to send execution summary:', summaryErr.message);
        }

        return Response.json(
          {
            success: finalStatus === 'executed',
            batch_id,
            status: finalStatus,
            execution_summary: executionSummary
          },
          { status: finalStatus === 'executed' ? 200 : 207, headers: corsHeaders }
        );
      }

      case 'cancel': {
        if (['executed', 'executing', 'cancelled'].includes(batch.status)) {
          return Response.json(
            { success: false, code: 'INVALID_STATUS', message: `Cannot cancel batch with status: ${batch.status}` },
            { status: 400, headers: corsHeaders }
          );
        }

        await base44.asServiceRole.entities.ApprovalBatch.update(batch_id, {
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          cancel_reason: reason || 'Cancelled by user'
        });

        // עדכון סטטוס המייל המקורי לביטול
        if (batch.mail_id) {
          try {
            await base44.asServiceRole.entities.Mail.update(batch.mail_id, {
              processing_status: 'automation_cancelled'
            });
            console.log(`[HandleBatch] Updated Mail ${batch.mail_id} status to automation_cancelled`);
          } catch (mailErr) {
            console.warn('[HandleBatch] Failed to update mail status on cancel:', mailErr.message);
          }
        }

        // עדכון Activity log הקיים לביטול
        try {
          const activities = await base44.asServiceRole.entities.Activity.filter({
            activity_type: 'automation_log',
            'metadata.mail_id': batch.mail_id
          }, '-created_date', 10);
          
          const relatedActivity = activities.find(a => 
            a.status === 'pending' && 
            a.metadata?.rule_id === batch.automation_rule_id
          );
          
          if (relatedActivity) {
            await base44.asServiceRole.entities.Activity.update(relatedActivity.id, {
              status: 'cancelled',
              metadata: {
                ...relatedActivity.metadata,
                execution_status: 'cancelled',
                cancelled_at: new Date().toISOString(),
                cancelled_by: user.email,
                cancel_reason: reason || 'Cancelled by user'
              }
            });
            console.log(`[HandleBatch] Updated Activity ${relatedActivity.id} status to cancelled`);
          }
        } catch (actErr) {
          console.warn('[HandleBatch] Failed to update activity log on cancel:', actErr.message);
        }

        return Response.json(
          { success: true, batch_id, status: 'cancelled', message: 'Batch cancelled' },
          { status: 200, headers: corsHeaders }
        );
      }

      default:
        return Response.json(
          { success: false, code: 'INVALID_METHOD', message: `Unknown method: ${method}` },
          { status: 400, headers: corsHeaders }
        );
    }

  } catch (error) {
    console.error('[HandleBatch] Error:', error);
    return Response.json(
      { success: false, code: 'INTERNAL_ERROR', message: error.message },
      { status: 500, headers: corsHeaders }
    );
  }
});

function validateActionsUpdate(original, updated) {
  const errors = [];
  if (!original || !updated) return [{ path: 'actions', message: 'Invalid actions data' }];
  if (original.length !== updated.length) return [{ path: 'actions_current', message: 'Cannot add or remove actions' }];

  for (let i = 0; i < original.length; i++) {
    const orig = original[i];
    const upd = updated[i];
    if (orig.action_type !== upd.action_type) {
      errors.push({ path: `actions_current[${i}].action_type`, message: 'Cannot change action type' });
    }
  }
  return errors;
}