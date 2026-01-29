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

    // Authorization: only approver, owner or admin
    // NORMALIZED EMAIL CHECK (LOWERCASE)
    const isApprover = (batch.approver_email || '').toLowerCase() === (user.email || '').toLowerCase();
    const isAdmin = user.role === 'admin';
    const isOwner = batch.user_id === user.id; // CHECK OWNERSHIP
    let isCaseLawyer = false;
    if (batch.case_id && !isApprover && !isAdmin && !isOwner) {
      try {
        // שולפים את התיק עם הרשאות מערכת כדי לבדוק מי העו"ד המטפל
        const connectedCase = await base44.asServiceRole.entities.Case.get(batch.case_id);
        // נניח ששדה העו"ד בתיק נקרא 'assigned_lawyer_id' או 'user_id'
        // התאם את שם השדה למבנה הנתונים שלך ב-Case
        if (connectedCase && (connectedCase.assigned_lawyer_id === user.id || connectedCase.user_id === user.id)) {
          isCaseLawyer = true;
        }
      } catch (e) {
        console.log('Error checking case permissions:', e);
      }
    }
    if (!isApprover && !isAdmin && !isOwner && !isCaseLawyer) {
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
          status: 'approved',
          approved_at: new Date().toISOString(),
          approved_via: 'ui',
          approved_by_email: user.email,
          status: 'executing' // Set to executing immediately
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