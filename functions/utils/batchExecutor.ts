/**
 * Batch Executor - Executes approval batch actions with rollback support
 * 
 * Uses Reserve-First Idempotency Pattern:
 * 1. Try to CREATE ExecutionLog with status='pending' (this is the lock/reserve)
 * 2. If UNIQUE conflict → read existing record and return skipped based on status
 * 3. Only after successful reserve → execute the actual action
 * 4. Update ExecutionLog to 'completed' or 'failed'
 * 
 * Execution Order (to minimize damage on failure):
 * 1. Revertible actions first: Task, TimeEntry, Deadline, Activity
 * 2. Non-revertible actions last: send_email, save_file, calendar_event
 */

// Action categories
const REVERTIBLE_ACTIONS = ['create_task', 'billing', 'create_alert', 'create_deadline'];
const NON_REVERTIBLE_ACTIONS = ['send_email', 'save_file', 'calendar_event'];
const BEST_EFFORT_ACTIONS = ['save_file', 'calendar_event'];

/**
 * Execute all enabled actions in a batch
 * @param {object} base44 - Base44 SDK client
 * @param {object} batch - ApprovalBatch entity
 * @param {object} context - Execution context
 * @returns {Promise<object>} - Execution summary
 */
export async function executeBatchActions(base44, batch, context) {
  const startTime = Date.now();
  const results = [];
  const rollbackStack = [];
  
  // Sort actions: revertible first, then non-revertible
  const sortedActions = sortActionsByExecutionOrder(batch.actions_current);
  
  console.log(`[BatchExecutor] Starting execution of ${sortedActions.length} actions`);
  console.log(`[BatchExecutor] Order: ${sortedActions.map(a => a.action_type).join(' → ')}`);
  
  let hasRevertibleFailure = false;
  
  for (const action of sortedActions) {
    // Skip disabled actions
    if (!action.enabled) {
      results.push({
        action_type: action.action_type,
        idempotency_key: action.idempotency_key,
        status: 'skipped',
        details: { reason: 'disabled' }
      });
      continue;
    }
    
    // Fail actions without idempotency key - this is a critical error
    if (!action.idempotency_key) {
      const errorMessage = `Missing idempotency_key for action type: ${action.action_type}`;
      console.error(`[BatchExecutor] ❌ ${action.action_type} failed: ${errorMessage}`);
      results.push({
        action_type: action.action_type,
        status: 'failed',
        error: errorMessage,
        details: { reason: 'missing_idempotency_key' }
      });
      
      // Treat as revertible failure - rollback and stop
      hasRevertibleFailure = true;
      console.log(`[BatchExecutor] 🔄 Missing idempotency_key - initiating rollback`);
      await performRollback(base44, rollbackStack);
      break;
    }
    
    // RESERVE-FIRST: Try to create ExecutionLog with status='pending'
    const reserveResult = await tryReserveExecution(base44, action, batch, context);
    
    if (reserveResult.reserved === false) {
      // Already exists - check existing status
      console.log(`[BatchExecutor] Action ${action.action_type} already has ExecutionLog with status: ${reserveResult.existingStatus}`);
      
      if (reserveResult.existingStatus === 'completed') {
        results.push({
          action_type: action.action_type,
          idempotency_key: action.idempotency_key,
          status: 'skipped',
          details: { reason: 'already_completed', existing_id: reserveResult.existingResultId }
        });
        continue;
      }
      
      if (reserveResult.existingStatus === 'pending') {
        results.push({
          action_type: action.action_type,
          idempotency_key: action.idempotency_key,
          status: 'skipped',
          details: { reason: 'in_progress' }
        });
        continue;
      }
      
      if (reserveResult.existingStatus === 'failed') {
        results.push({
          action_type: action.action_type,
          idempotency_key: action.idempotency_key,
          status: 'skipped',
          details: { reason: 'previously_failed', error: reserveResult.existingError }
        });
        continue;
      }
    }
    
    // Reserve succeeded - now execute the action
    const executionLogId = reserveResult.executionLogId;
    
    try {
      const result = await executeAction(base44, action, batch, context);
      
      // Update ExecutionLog to 'completed'
      await base44.asServiceRole.entities.ExecutionLog.update(executionLogId, {
        status: 'completed',
        result_id: String(result.id || ''),
        result_entity: result.entity || getEntityForActionType(action.action_type),
        completed_at: new Date().toISOString()
      });
      
      results.push({
        action_type: action.action_type,
        idempotency_key: action.idempotency_key,
        status: 'success',
        result_id: result.id,
        details: result
      });
      
      // Register for rollback if revertible
      if (REVERTIBLE_ACTIONS.includes(action.action_type) && result.id) {
        rollbackStack.push({
          action_type: action.action_type,
          id: result.id,
          idempotency_key: action.idempotency_key,
          executionLogId: executionLogId
        });
      }
      
      console.log(`[BatchExecutor] ✅ ${action.action_type} succeeded`);
      
    } catch (error) {
      console.error(`[BatchExecutor] ❌ ${action.action_type} failed:`, error.message);
      
      // Update ExecutionLog to 'failed'
      await base44.asServiceRole.entities.ExecutionLog.update(executionLogId, {
        status: 'failed',
        error_message: error.message,
        completed_at: new Date().toISOString()
      });
      
      const isRevertible = REVERTIBLE_ACTIONS.includes(action.action_type);
      const isBestEffort = BEST_EFFORT_ACTIONS.includes(action.action_type);
      
      results.push({
        action_type: action.action_type,
        idempotency_key: action.idempotency_key,
        status: 'failed',
        error: error.message
      });
      
      if (isRevertible) {
        // Revertible action failed - rollback everything and stop
        hasRevertibleFailure = true;
        console.log(`[BatchExecutor] 🔄 Revertible action failed - initiating rollback`);
        await performRollback(base44, rollbackStack);
        break;
      } else if (!isBestEffort) {
        // Non-revertible, non-best-effort failed - continue but mark batch
        console.log(`[BatchExecutor] ⚠️ Non-revertible action failed - continuing`);
      } else {
        // Best effort - just log and continue
        console.log(`[BatchExecutor] ℹ️ Best-effort action failed - continuing`);
      }
    }
  }
  
  const executionTime = Date.now() - startTime;
  const summary = {
    total: batch.actions_current.length,
    success: results.filter(r => r.status === 'success').length,
    failed: results.filter(r => r.status === 'failed').length,
    skipped: results.filter(r => r.status === 'skipped').length,
    results,
    executed_at: new Date().toISOString(),
    execution_time_ms: executionTime,
    rollback_performed: hasRevertibleFailure
  };
  
  console.log(`[BatchExecutor] 🏁 Execution complete: ${summary.success} success, ${summary.failed} failed, ${summary.skipped} skipped (${executionTime}ms)`);
  
  return summary;
}

/**
 * Sort actions by execution order (revertible first)
 */
function sortActionsByExecutionOrder(actions) {
  if (!actions || !Array.isArray(actions)) return [];
  
  return [...actions].sort((a, b) => {
    const aIsRevertible = REVERTIBLE_ACTIONS.includes(a.action_type);
    const bIsRevertible = REVERTIBLE_ACTIONS.includes(b.action_type);
    
    if (aIsRevertible && !bIsRevertible) return -1;
    if (!aIsRevertible && bIsRevertible) return 1;
    return 0;
  });
}

// Stale pending TTL in minutes
const STALE_PENDING_TTL_MINUTES = 10;

/**
 * Try to reserve execution slot (Reserve-First Pattern)
 * This is the idempotency check - the CREATE itself is the lock
 * 
 * @returns {Promise<{reserved: boolean, executionLogId?: string, existingStatus?: string, existingResultId?: string, existingError?: string}>}
 */
async function tryReserveExecution(base44, action, batch, context = {}) {
  try {
    // Try to create ExecutionLog with status='pending'
    // If UNIQUE constraint is violated, this will throw
    const executionLog = await base44.asServiceRole.entities.ExecutionLog.create({
      idempotency_key: action.idempotency_key,
      batch_id: batch.id,
      action_type: action.action_type,
      status: 'pending',
      executed_at: new Date().toISOString(),
      executed_by: context.userEmail || 'system',
      execution_context: {
        via: context.executedBy || 'unknown',
        mail_id: batch.mail_id || null,
        case_id: batch.case_id || null,
        client_id: batch.client_id || null
      }
    });
    
    console.log(`[BatchExecutor] Reserved execution slot: ${action.idempotency_key} -> ${executionLog.id}`);
    
    return {
      reserved: true,
      executionLogId: executionLog.id
    };
    
  } catch (error) {
    // UNIQUE constraint violation - record already exists
    console.log(`[BatchExecutor] Reserve failed for ${action.idempotency_key}: ${error.message}`);
    
    // Fetch the existing record to check its status
    try {
      const existingLogs = await base44.asServiceRole.entities.ExecutionLog.filter({
        idempotency_key: action.idempotency_key
      });
      
      if (existingLogs && existingLogs.length > 0) {
        const existing = existingLogs[0];
        
        // Handle stale pending - if pending for too long, mark as failed
        if (existing.status === 'pending') {
          const executedAt = new Date(existing.executed_at);
          const now = new Date();
          const ageMinutes = (now.getTime() - executedAt.getTime()) / (1000 * 60);
          
          if (ageMinutes > STALE_PENDING_TTL_MINUTES) {
            console.warn(`[BatchExecutor] ⚠️ Stale pending execution found for ${action.idempotency_key} (age: ${ageMinutes.toFixed(1)} min). Marking as failed.`);
            
            // Update the stale record to failed
            await base44.asServiceRole.entities.ExecutionLog.update(existing.id, {
              status: 'failed',
              error_message: `Stale pending execution (exceeded ${STALE_PENDING_TTL_MINUTES} min TTL)`,
              completed_at: now.toISOString()
            });
            
            return {
              reserved: false,
              existingStatus: 'failed',
              existingError: `Stale pending execution (exceeded ${STALE_PENDING_TTL_MINUTES} min TTL)`
            };
          }
        }
        
        return {
          reserved: false,
          existingStatus: existing.status,
          existingResultId: existing.result_id,
          existingError: existing.error_message
        };
      }
    } catch (fetchError) {
      console.error(`[BatchExecutor] Failed to fetch existing ExecutionLog:`, fetchError.message);
    }
    
    // If we can't fetch existing record, assume it's in progress
    return {
      reserved: false,
      existingStatus: 'pending'
    };
  }
}

/**
 * Execute a single action (called only after successful reserve)
 */
async function executeAction(base44, action, batch, context = {}) {
  const config = action.config || {};
  
  switch (action.action_type) {
    case 'create_task': {
      const taskData = {
        title: config.title || `משימה מבאטש ${batch.id}`,
        description: config.description || '',
        case_id: batch.case_id || null,
        client_id: batch.client_id || null,
        mail_id: batch.mail_id || null,
        status: 'pending',
        priority: config.priority || 'medium',
        due_date: config.due_date || null,
        extracted_data: {
          approval_batch_id: batch.id
        }
      };
      
      const task = await base44.asServiceRole.entities.Task.create(taskData);
      return { id: task.id, entity: 'Task' };
    }
    
    case 'billing': {
      const timeEntryData = {
        case_id: batch.case_id || null,
        description: config.description || batch.mail_subject || 'חיוב אוטומטי',
        hours: config.hours || 0.25,
        rate: config.rate || config.hourly_rate || 800,
        date_worked: new Date().toISOString(),
        is_billable: true,
        billed: false
      };
      
      const timeEntry = await base44.asServiceRole.entities.TimeEntry.create(timeEntryData);
      return { id: timeEntry.id, entity: 'TimeEntry', amount: timeEntryData.hours * timeEntryData.rate };
    }
    
    case 'create_deadline': {
      const deadlineData = {
        case_id: batch.case_id || null,
        deadline_type: config.deadline_type || 'custom',
        description: config.description || config.title || 'מועד מבאטש אישור',
        due_date: config.due_date,
        status: 'pending',
        is_critical: config.is_critical || false
      };
      
      const deadline = await base44.asServiceRole.entities.Deadline.create(deadlineData);
      return { id: deadline.id, entity: 'Deadline' };
    }
    
    case 'create_alert': {
      const activityData = {
        activity_type: 'other',
        title: config.message || config.title || 'התרעה',
        description: config.description || '',
        case_id: batch.case_id || null,
        client_id: batch.client_id || null,
        status: 'active',
        metadata: {
          alert_type: config.alert_type || 'reminder',
          approval_batch_id: batch.id
        }
      };
      
      const activity = await base44.asServiceRole.entities.Activity.create(activityData);
      return { id: activity.id, entity: 'Activity' };
    }
    
    case 'send_email': {
      const emailResult = await base44.functions.invoke('sendEmail', {
        to: config.to,
        subject: config.subject,
        body: config.body
      });
      
      if (emailResult.error) {
        throw new Error(emailResult.error);
      }
      
      return { id: emailResult.messageId || 'sent', entity: 'Email', sent_to: config.to };
    }
    
    case 'save_file': {
      const uploadResult = await base44.functions.invoke('downloadGmailAttachment', {
        mail_id: batch.mail_id,
        destination_path: config.path || config.dropbox_folder_path
      });
      
      if (uploadResult.error) {
        throw new Error(uploadResult.error);
      }
      
      return { id: 'dropbox', entity: 'Dropbox', path: config.path };
    }
    
    case 'calendar_event': {
      const eventResult = await base44.functions.invoke('createCalendarEvent', {
        title: config.title || config.title_template,
        description: config.description || '',
        start_date: config.start_date || config.due_date,
        duration_minutes: config.duration_minutes || 60,
        case_id: batch.case_id,
        client_id: batch.client_id,
        create_meet_link: config.create_meet_link || false,
        attendees: config.attendees || []
      });
      
      if (eventResult.error) {
        throw new Error(eventResult.error);
      }
      
      return { id: eventResult.google_event_id || 'created', entity: 'CalendarEvent', link: eventResult.htmlLink };
    }
    
    default:
      throw new Error(`Unknown action type: ${action.action_type}`);
  }
}

/**
 * Get entity name for action type
 */
function getEntityForActionType(actionType) {
  const mapping = {
    'create_task': 'Task',
    'billing': 'TimeEntry',
    'create_deadline': 'Deadline',
    'create_alert': 'Activity',
    'send_email': 'Email',
    'save_file': 'Dropbox',
    'calendar_event': 'CalendarEvent'
  };
  return mapping[actionType] || 'Unknown';
}

/**
 * Perform rollback of completed actions
 */
async function performRollback(base44, rollbackStack) {
  console.log(`[BatchExecutor] 🔄 Rolling back ${rollbackStack.length} action(s)`);
  
  // Rollback in reverse order (LIFO)
  for (let i = rollbackStack.length - 1; i >= 0; i--) {
    const item = rollbackStack[i];
    
    try {
      switch (item.action_type) {
        case 'create_task':
          await base44.asServiceRole.entities.Task.delete(item.id);
          console.log(`[Rollback] ✅ Deleted Task ${item.id}`);
          break;
        
        case 'billing':
          await base44.asServiceRole.entities.TimeEntry.delete(item.id);
          console.log(`[Rollback] ✅ Deleted TimeEntry ${item.id}`);
          break;
        
        case 'create_deadline':
          await base44.asServiceRole.entities.Deadline.delete(item.id);
          console.log(`[Rollback] ✅ Deleted Deadline ${item.id}`);
          break;
        
        case 'create_alert':
          await base44.asServiceRole.entities.Activity.delete(item.id);
          console.log(`[Rollback] ✅ Deleted Activity ${item.id}`);
          break;
      }
      
      // Update ExecutionLog to reflect rollback
      if (item.executionLogId) {
        await base44.asServiceRole.entities.ExecutionLog.update(item.executionLogId, {
          status: 'failed',
          error_message: 'Rolled back due to subsequent failure',
          completed_at: new Date().toISOString()
        });
      }
      
    } catch (error) {
      console.error(`[Rollback] ❌ Failed to rollback ${item.action_type} ${item.id}:`, error.message);
    }
  }
}