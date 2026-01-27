/**
 * Batch Executor - Executes approval batch actions with rollback support
 * 
 * Execution Order (to minimize damage on failure):
 * 1. Revertible actions first: Task, TimeEntry, Deadline, Activity
 * 2. Non-revertible actions last: send_email, save_file, calendar_event
 * 
 * Rollback Strategy:
 * - If revertible action fails → rollback all completed, mark batch as failed
 * - If non-revertible action fails → no rollback (data is consistent), mark action as failed
 */

// Action categories
const REVERTIBLE_ACTIONS = ['create_task', 'billing', 'create_alert', 'create_deadline'];
const NON_REVERTIBLE_ACTIONS = ['send_email', 'save_file', 'calendar_event'];
const BEST_EFFORT_ACTIONS = ['save_file', 'calendar_event']; // Won't block batch on failure

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
    
    // Check idempotency - skip if already executed
    const existingResult = await checkIdempotency(base44, action.idempotency_key);
    if (existingResult) {
      console.log(`[BatchExecutor] Skipping ${action.action_type} - already executed (idempotency)`);
      results.push({
        action_type: action.action_type,
        idempotency_key: action.idempotency_key,
        status: 'skipped',
        details: { reason: 'idempotency', existing_id: existingResult }
      });
      continue;
    }
    
    try {
      const result = await executeAction(base44, action, batch, context);
      
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
          idempotency_key: action.idempotency_key
        });
      }
      
      console.log(`[BatchExecutor] ✅ ${action.action_type} succeeded`);
      
    } catch (error) {
      console.error(`[BatchExecutor] ❌ ${action.action_type} failed:`, error.message);
      
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

/**
 * Check if action was already executed (idempotency)
 * Uses ExecutionLog entity with UNIQUE constraint on idempotency_key
 */
async function checkIdempotency(base44, idempotencyKey) {
  if (!idempotencyKey) return null;
  
  try {
    const logs = await base44.asServiceRole.entities.ExecutionLog.filter({
      idempotency_key: idempotencyKey
    });
    
    if (logs && logs.length > 0) {
      return logs[0].result_id || logs[0].id;
    }
  } catch (error) {
    console.log('[BatchExecutor] Idempotency check failed:', error.message);
  }
  
  return null;
}

/**
 * Execute a single action
 */
async function executeAction(base44, action, batch, context = {}) {
  const idempotencyKey = action.idempotency_key;
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
          idempotency_key: idempotencyKey,
          approval_batch_id: batch.id
        }
      };
      
      const task = await base44.asServiceRole.entities.Task.create(taskData);
      
      // Log for idempotency tracking - MUST succeed or throw
      await logExecution(base44, batch, action, task.id, context);
      
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
      
      // Log for idempotency tracking - MUST succeed or throw
      await logExecution(base44, batch, action, timeEntry.id, context);
      
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
      
      // Log for idempotency tracking - MUST succeed or throw
      await logExecution(base44, batch, action, deadline.id, context);
      
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
          idempotency_key: idempotencyKey,
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
      
      // Log for idempotency tracking - MUST succeed or throw
      await logExecution(base44, batch, action, emailResult.messageId || 'sent', context);
      
      return { id: emailResult.messageId, entity: 'Email', sent_to: config.to };
    }
    
    case 'save_file': {
      // Call Dropbox upload function
      const uploadResult = await base44.functions.invoke('downloadGmailAttachment', {
        mail_id: batch.mail_id,
        destination_path: config.path || config.dropbox_folder_path
      });
      
      // Log for idempotency tracking - MUST succeed or throw
      await logExecution(base44, batch, action, 'uploaded', context);
      
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
      
      // Log for idempotency tracking - MUST succeed or throw
      await logExecution(base44, batch, action, eventResult.google_event_id || 'created', context);
      
      return { id: eventResult.google_event_id, entity: 'CalendarEvent', link: eventResult.htmlLink };
    }
    
    default:
      throw new Error(`Unknown action type: ${action.action_type}`);
  }
}

/**
 * Log execution for idempotency tracking
 * CRITICAL: If this fails, we throw to prevent duplicate executions
 * Uses ExecutionLog entity with UNIQUE constraint on idempotency_key
 */
async function logExecution(base44, batch, action, resultId, context = {}) {
  // This MUST succeed - if it fails, we need to stop the action
  // The UNIQUE constraint on idempotency_key prevents duplicates
  await base44.asServiceRole.entities.ExecutionLog.create({
    idempotency_key: action.idempotency_key,
    batch_id: batch.id,
    action_type: action.action_type,
    result_id: String(resultId),
    result_entity: getEntityForActionType(action.action_type),
    executed_at: new Date().toISOString(),
    executed_by: context.userEmail || 'system',
    execution_context: {
      via: context.executedBy || 'unknown',
      mail_id: batch.mail_id || null,
      case_id: batch.case_id || null,
      client_id: batch.client_id || null
    }
  });
  
  console.log(`[BatchExecutor] Logged execution: ${action.idempotency_key} -> ${resultId}`);
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
    } catch (error) {
      console.error(`[Rollback] ❌ Failed to rollback ${item.action_type} ${item.id}:`, error.message);
    }
  }
}