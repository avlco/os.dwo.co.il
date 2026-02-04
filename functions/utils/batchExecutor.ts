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

// Email brand configuration
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
  const dir = language === 'he' ? 'rtl' : 'ltr';
  const t = {
    footer_contact: 'DWO - משרד עורכי דין | www.dwo.co.il',
    footer_disclaimer: 'הודעה זו מכילה מידע סודי ומוגן. אם קיבלת הודעה זו בטעות, אנא מחק אותה ודווח לשולח.'
  };

  const s = {
    body: `margin: 0; padding: 0; background-color: ${EMAIL_BRAND.colors.bg}; font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;`,
    wrapper: `padding: 20px; background-color: ${EMAIL_BRAND.colors.bg};`,
    container: `max-width: 600px; margin: 0 auto; background-color: ${EMAIL_BRAND.colors.card}; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);`,
    header: `background-color: ${EMAIL_BRAND.colors.card}; padding: 20px; text-align: center; border-bottom: 3px solid ${EMAIL_BRAND.colors.primary};`,
    logo: `height: 50px; width: auto; max-width: 200px; object-fit: contain; display: block; margin: 0 auto;`,
    content: `padding: 30px 25px; color: ${EMAIL_BRAND.colors.text}; line-height: 1.6; text-align: ${language === 'he' ? 'right' : 'left'}; direction: ${dir}; font-size: 16px;`,
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
  
  // Get client language for proper execution (fallback only - should already be in action config)
  let clientLanguage = 'he';
  if (batch.client_id) {
    try {
      const client = await base44.asServiceRole.entities.Client.get(batch.client_id);
      if (client?.communication_language) clientLanguage = client.communication_language;
    } catch (e) { console.warn('[BatchExecutor] Failed to fetch client language'); }
  }
  
  // Sort actions: revertible first, then non-revertible
  const sortedActions = sortActionsByExecutionOrder(batch.actions_current);
  
  console.log(`[BatchExecutor] Starting execution of ${sortedActions.length} actions`);
  console.log(`[BatchExecutor] Client language fallback: ${clientLanguage}`);
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
    
    // Fail actions without idempotency key - this is a critical error (fail-fast)
    if (!action.idempotency_key) {
      const errorMessage = `Missing idempotency_key for action type: ${action.action_type}`;
      console.error(`[BatchExecutor] ❌ ${action.action_type} failed: ${errorMessage}`);
      
      // Rollback any completed actions before throwing
      if (rollbackStack.length > 0) {
        console.log(`[BatchExecutor] 🔄 Missing idempotency_key - initiating rollback`);
        await performRollback(base44, rollbackStack);
      }
      
      // Throw to fail-fast - caller must handle this error
      throw new Error(errorMessage);
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
      
      // Default continue for any unhandled existingStatus (safety net)
      console.warn(`[BatchExecutor] ⚠️ Unhandled existingStatus: ${reserveResult.existingStatus} for ${action.action_type}`);
      results.push({
        action_type: action.action_type,
        idempotency_key: action.idempotency_key,
        status: 'skipped',
        details: { reason: 'unhandled_existing_status', existing_status: reserveResult.existingStatus }
      });
      continue;
    }
    
    // Reserve succeeded - now execute the action
    const executionLogId = reserveResult.executionLogId;
    
    // Defensive guard - should never happen if reserve returned true
    if (!executionLogId) {
      throw new Error(`Missing executionLogId after successful reserve for ${action.action_type}`);
    }
    
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
 * Language is already embedded in action.config.language by executeAutomationRule
 */
async function executeAction(base44, action, batch, context = {}) {
  const config = action.config || {};
  // Language is already determined and embedded in config by executeAutomationRule
  const actionLang = config.language || 'he';
  
  switch (action.action_type) {
    case 'create_task': {
      const taskData = {
        title: config.title || `משימה מבאטש ${batch.id}`,
        description: config.description || '',
        case_id: config.case_id || batch.case_id || null,
        client_id: config.client_id || batch.client_id || null,
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
      // Validate required fields for billing
      const billingCaseId = config.case_id || batch.case_id;
      if (!billingCaseId) {
        console.warn(`[BatchExecutor] Billing action: missing case_id`);
        throw new Error('Billing requires case_id - no case associated with this email');
      }
      
      const timeEntryData = {
        case_id: billingCaseId,
        client_id: config.client_id || batch.client_id || null,
        description: config.description || batch.mail_subject || 'חיוב אוטומטי',
        hours: config.hours || 0.25,
        rate: config.rate || config.hourly_rate || 800,
        date_worked: config.date_worked || new Date().toISOString().split('T')[0],
        is_billable: true,
        billed: false,
        user_email: config.user_email || null
      };
      
      const timeEntry = await base44.asServiceRole.entities.TimeEntry.create(timeEntryData);
      return { id: timeEntry.id, entity: 'TimeEntry', amount: timeEntryData.hours * timeEntryData.rate };
    }
    
    case 'create_deadline': {
      const deadlineData = {
        case_id: config.case_id || batch.case_id || null,
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
      // Message/description in config is already in the correct language
      console.log(`[BatchExecutor] Creating alert/deadline: ${config.description || config.message} (lang: ${actionLang})`);
      
      const deadlineData = {
        case_id: config.case_id || batch.case_id || null,
        deadline_type: config.alert_type || config.deadline_type || 'reminder',
        description: config.description || config.message || 'התרעה מאוטומציה',
        due_date: config.due_date || new Date().toISOString().split('T')[0],
        status: 'pending',
        is_critical: config.is_critical || config.alert_type === 'urgent' || config.alert_type === 'deadline',
        assigned_to_email: config.recipients?.[0] || null,
        metadata: {
          execution_time: config.time_of_day,
          recipients: config.recipients || [],
          source: 'batch_executor',
          approval_batch_id: batch.id,
          language: actionLang
        }
      };
      
      const deadline = await base44.asServiceRole.entities.Deadline.create(deadlineData);
      return { id: deadline.id, entity: 'Deadline' };
    }
    
    case 'send_email': {
      // Subject and body in config are already in the correct language (determined by executeAutomationRule)
      const formattedBody = `<div style="white-space: pre-wrap; font-family: 'Segoe UI', Arial, sans-serif;">${config.body}</div>`;
      const brandedBody = generateEmailLayout(formattedBody, config.subject, actionLang);
      
      console.log(`[BatchExecutor] Sending email to ${config.to} in language: ${actionLang}`);
      
      const emailResult = await base44.functions.invoke('sendEmail', {
        to: config.to,
        subject: config.subject,
        body: brandedBody
      });
      
      if (emailResult.error) {
        throw new Error(emailResult.error);
      }
      
      return { id: emailResult.messageId || 'sent', entity: 'Email', sent_to: config.to };
    }
    
    case 'save_file': {
      console.log(`[BatchExecutor] Uploading files to Dropbox`);
      
      const uploadResult = await base44.functions.invoke('uploadToDropbox', {
        mailId: config.mailId || batch.mail_id,
        caseId: config.caseId || batch.case_id,
        clientId: config.clientId || batch.client_id,
        documentType: config.documentType || config.document_type || 'other',
        subfolder: config.subfolder || ''
      });
      
      const resultData = uploadResult?.data || uploadResult;
      if (resultData?.error) {
        throw new Error(resultData.error);
      }
      
      return { id: 'dropbox', entity: 'Dropbox', path: resultData?.dropbox_path || config.path };
    }
    
    case 'calendar_event': {
      // Title and description in config are already in the correct language
      console.log(`[BatchExecutor] Creating calendar event: ${config.title} (lang: ${actionLang})`);
      
      const eventResult = await base44.functions.invoke('createCalendarEvent', {
        title: config.title || config.title_template,
        description: config.description || '',
        start_date: config.start_date || config.due_date,
        duration_minutes: config.duration_minutes || 60,
        case_id: config.case_id || batch.case_id,
        client_id: config.client_id || batch.client_id,
        reminder_minutes: config.reminder_minutes || 1440,
        create_meet_link: config.create_meet_link || false,
        attendees: config.attendees || []
      });
      
      const resultData = eventResult?.data || eventResult;
      if (resultData?.error) {
        throw new Error(resultData.error);
      }
      
      // Also create a local Deadline record
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
            source: 'batch_executor',
            language: actionLang
          }
        });
      } catch (e) { console.warn('[BatchExecutor] Failed to create local Deadline:', e.message); }
      
      return { id: resultData?.google_event_id || 'created', entity: 'CalendarEvent', link: resultData?.htmlLink };
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
    'create_alert': 'Deadline', // create_alert creates Deadline entities
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
          await base44.asServiceRole.entities.Deadline.delete(item.id);
          console.log(`[Rollback] ✅ Deleted Deadline (alert) ${item.id}`);
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