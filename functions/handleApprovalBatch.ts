/**
 * Handle Approval Batch operations from UI
 * 
 * Methods:
 * - get: Fetch batch details
 * - update_actions: Update actions_current (with validation)
 * - approve: Approve and execute the batch
 * - cancel: Cancel the batch
 * 
 * Authorization: Only approver_email or admin can access
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { executeBatchActions } from './utils/batchExecutor.js';

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

    // Authorization: only approver or admin
    const isApprover = batch.approver_email === user.email;
    const isAdmin = user.role === 'admin';
    
    if (!isApprover && !isAdmin) {
      return Response.json(
        { success: false, code: 'FORBIDDEN', message: 'Not authorized to access this batch' },
        { status: 403, headers: corsHeaders }
      );
    }

    // Handle methods
    switch (method) {
      // ============================================
      // GET - Fetch batch with enriched data
      // ============================================
      case 'get': {
        // Enrich with case and client names
        let caseName = null;
        let clientName = null;
        
        if (batch.case_id) {
          try {
            const caseData = await base44.entities.Case.get(batch.case_id);
            caseName = caseData?.case_number || caseData?.title;
          } catch (e) { /* ignore */ }
        }
        
        if (batch.client_id) {
          try {
            const client = await base44.entities.Client.get(batch.client_id);
            clientName = client?.name;
          } catch (e) { /* ignore */ }
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

      // ============================================
      // UPDATE_ACTIONS - Update actions with validation
      // ============================================
      case 'update_actions': {
        // Can only update pending or editing batches
        if (!['pending', 'editing'].includes(batch.status)) {
          return Response.json(
            { success: false, code: 'INVALID_STATUS', message: `Cannot edit batch with status: ${batch.status}` },
            { status: 400, headers: corsHeaders }
          );
        }

        if (!actions_current || !Array.isArray(actions_current)) {
          return Response.json(
            { success: false, code: 'INVALID_ACTIONS', message: 'actions_current must be an array' },
            { status: 400, headers: corsHeaders }
          );
        }

        // Validate the update
        const validationErrors = validateActionsUpdate(batch.actions_original, actions_current);
        
        if (validationErrors.length > 0) {
          return Response.json(
            { success: false, code: 'VALIDATION_ERROR', errors: validationErrors },
            { status: 422, headers: corsHeaders }
          );
        }

        // Update batch
        await base44.asServiceRole.entities.ApprovalBatch.update(batch_id, {
          actions_current,
          status: 'editing'
        });

        console.log(`[HandleBatch] Batch ${batch_id} actions updated`);

        return Response.json(
          { success: true, batch_id, status: 'editing', message: 'Actions updated' },
          { status: 200, headers: corsHeaders }
        );
      }

      // ============================================
      // APPROVE - Approve and execute
      // ============================================
      case 'approve': {
        // Can only approve pending or editing batches
        if (!['pending', 'editing'].includes(batch.status)) {
          return Response.json(
            { success: false, code: 'INVALID_STATUS', message: `Cannot approve batch with status: ${batch.status}` },
            { status: 400, headers: corsHeaders }
          );
        }

        console.log(`[HandleBatch] Approving batch ${batch_id}`);

        // Update to approved
        await base44.asServiceRole.entities.ApprovalBatch.update(batch_id, {
          status: 'approved',
          approved_at: new Date().toISOString(),
          approved_via: 'ui',
          approved_by_email: user.email
        });

        // Update to executing
        await base44.asServiceRole.entities.ApprovalBatch.update(batch_id, {
          status: 'executing'
        });

        // Re-fetch batch to get latest actions_current after any updates
        const freshBatch = await base44.asServiceRole.entities.ApprovalBatch.get(batch_id);
        
        // Execute actions
        let executionSummary;
        let finalStatus = 'executed';
        
        try {
          executionSummary = await executeBatchActions(base44, freshBatch, {
            executedBy: 'ui',
            userEmail: user.email
          });
          
          // If any action failed, status is failed (regardless of rollback)
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

        // Update final status
        await base44.asServiceRole.entities.ApprovalBatch.update(batch_id, {
          status: finalStatus,
          execution_summary: executionSummary,
          error_message: finalStatus === 'failed' ? (executionSummary.error || 'Execution failed') : null
        });

        console.log(`[HandleBatch] Batch ${batch_id} completed with status: ${finalStatus}`);

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

      // ============================================
      // CANCEL - Cancel the batch
      // ============================================
      case 'cancel': {
        // Can cancel pending, editing, or even approved (if not yet executing)
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

        console.log(`[HandleBatch] Batch ${batch_id} cancelled`);

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

/**
 * Validate actions update against original
 * Rules:
 * - Cannot add or remove actions
 * - Cannot change action_type
 * - Can only toggle enabled and edit config within limits
 */
function validateActionsUpdate(original, updated) {
  const errors = [];

  if (!original || !updated) {
    errors.push({ path: 'actions', message: 'Invalid actions data' });
    return errors;
  }

  if (original.length !== updated.length) {
    errors.push({ path: 'actions_current', message: 'Cannot add or remove actions' });
    return errors;
  }

  for (let i = 0; i < original.length; i++) {
    const orig = original[i];
    const upd = updated[i];

    // Must have same action_type
    if (orig.action_type !== upd.action_type) {
      errors.push({ 
        path: `actions_current[${i}].action_type`, 
        message: `Cannot change action type from ${orig.action_type} to ${upd.action_type}` 
      });
      continue;
    }

    // Must have same idempotency_key
    if (orig.idempotency_key !== upd.idempotency_key) {
      errors.push({ 
        path: `actions_current[${i}].idempotency_key`, 
        message: 'Cannot change idempotency_key' 
      });
    }

    // Validate specific action types
    const config = upd.config || {};
    
    switch (upd.action_type) {
      case 'send_email':
        // Cannot change recipients (security)
        if (orig.config?.to !== config.to) {
          errors.push({ 
            path: `actions_current[${i}].config.to`, 
            message: 'Cannot change email recipients' 
          });
        }
        // Subject max length
        if (config.subject && config.subject.length > 300) {
          errors.push({ 
            path: `actions_current[${i}].config.subject`, 
            message: 'Subject must be 300 characters or less' 
          });
        }
        break;

      case 'billing':
        // Hours validation: 0.25 - 24, in 0.25 increments
        if (config.hours !== undefined) {
          if (config.hours < 0.25 || config.hours > 24) {
            errors.push({ 
              path: `actions_current[${i}].config.hours`, 
              message: 'Hours must be between 0.25 and 24' 
            });
          }
          if (config.hours % 0.25 !== 0) {
            errors.push({ 
              path: `actions_current[${i}].config.hours`, 
              message: 'Hours must be in 0.25 increments' 
            });
          }
        }
        break;

      case 'create_task':
        // Title required
        if (!config.title || config.title.trim() === '') {
          errors.push({ 
            path: `actions_current[${i}].config.title`, 
            message: 'Task title is required' 
          });
        }
        break;

      case 'calendar_event':
        // Title required
        if (!config.title && !config.title_template) {
          errors.push({ 
            path: `actions_current[${i}].config.title`, 
            message: 'Event title is required' 
          });
        }
        break;
    }
  }

  return errors;
}