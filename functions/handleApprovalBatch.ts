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

// --- EMBEDDED EXECUTOR START (To fix "Module not found") ---
const EMAIL_BRAND = {
  colors: { primary: '#b62f12', bg: '#f3f4f6', card: '#ffffff', text: '#000000', textLight: '#545454' },
  logoUrl: 'https://dwo.co.il/wp-content/uploads/2020/04/Drori-Stav-logo-2.png'
};

function generateEmailLayout(contentHtml, title, language = 'he') {
  const dir = language === 'he' ? 'rtl' : 'ltr';
  return `<!DOCTYPE html>
<html dir="${dir}" lang="${language}">
<head><meta charset="UTF-8"><title>${title}</title></head>
<body style="margin:0;padding:0;background-color:${EMAIL_BRAND.colors.bg};font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="padding:20px;background-color:${EMAIL_BRAND.colors.bg};">
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:600px;margin:0 auto;background-color:${EMAIL_BRAND.colors.card};border-radius:8px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.05);">
      <tr><td style="background-color:${EMAIL_BRAND.colors.card};padding:20px;text-align:center;border-bottom:3px solid ${EMAIL_BRAND.colors.primary};">
        <img src="${EMAIL_BRAND.logoUrl}" alt="DWO" style="height:50px;width:auto;max-width:200px;" />
      </td></tr>
      <tr><td style="padding:30px 25px;color:${EMAIL_BRAND.colors.text};line-height:1.6;font-size:16px;" dir="${dir}">
        ${contentHtml}
      </td></tr>
      <tr><td style="background-color:#f8fafc;padding:20px;text-align:center;font-size:12px;color:${EMAIL_BRAND.colors.textLight};border-top:1px solid #e2e8f0;">
        <p style="margin:0;">DWO - משרד עורכי דין | www.dwo.co.il</p>
      </td></tr>
    </table>
  </div>
</body></html>`;
}
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

      // --- Execute based on type ---
      switch (type) {
                case 'send_email':
          const brandedBody = generateEmailLayout(
            `<div style="direction:rtl;text-align:right;">${config.body}</div>`,
            config.subject
          );
          result = await base44.functions.invoke('sendEmail', {
            to: config.to,
            subject: config.subject,
            body: brandedBody
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
// --- EMBEDDED EXECUTOR END ---

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
    // חסימה סופית אם אף אחד מהתנאים לא התקיים
    if (!isApprover && !isAdminOrPartner && !isOwner && !isCaseLawyer) {
      return Response.json(
        { success: false, code: 'FORBIDDEN', message: 'Not authorized to access this batch' },
        { status: 403, headers: corsHeaders }
      );
    }

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
          
          if (executionSummary.failed > 0) {
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