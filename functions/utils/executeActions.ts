/**
 * Execute Actions Utility
 * Executes individual actions from an ApprovalBatch
 * Includes rollback support for transactional integrity
 */

import { RollbackManager } from './rollbackManager.js';

/**
 * Execute a single action from an ApprovalBatch
 * 
 * @param {object} base44 - Base44 SDK client
 * @param {object} action - The action object from ApprovalBatch.actions
 * @param {object} context - Execution context (caseId, clientId, mailId, etc.)
 * @param {RollbackManager} rollbackManager - Rollback manager instance
 * @returns {Promise<{ status: string, result?: object, error?: string }>}
 */
export async function executeAction(base44, action, context, rollbackManager) {
  const { action_type, config, enabled } = action;
  
  if (!enabled) {
    return { status: 'skipped', reason: 'disabled' };
  }
  
  console.log(`[ExecuteAction] Starting: ${action_type}`);
  
  try {
    switch (action_type) {
      case 'send_email':
        return await executeSendEmail(base44, config, context);
        
      case 'create_task':
        return await executeCreateTask(base44, config, context, rollbackManager);
        
      case 'billing':
        return await executeBilling(base44, config, context, rollbackManager);
        
      case 'calendar_event':
        return await executeCalendarEvent(base44, config, context, rollbackManager);
        
      case 'save_file':
        return await executeSaveFile(base44, config, context);
        
      case 'create_alert':
        return await executeCreateAlert(base44, config, context, rollbackManager);
        
      default:
        return { status: 'failed', error: `Unknown action type: ${action_type}` };
    }
  } catch (error) {
    console.error(`[ExecuteAction] Error in ${action_type}:`, error.message);
    return { status: 'failed', error: error.message };
  }
}

/**
 * Execute all actions in a batch
 * 
 * @param {object} base44 - Base44 SDK client
 * @param {object} batch - The ApprovalBatch object
 * @returns {Promise<{ success: boolean, results: object[], summary: object }>}
 */
export async function executeBatchActions(base44, batch) {
  const startTime = Date.now();
  const rollbackManager = new RollbackManager(base44);
  
  const context = {
    batchId: batch.id,
    ruleId: batch.rule_id,
    mailId: batch.mail_id,
    caseId: batch.case_id,
    clientId: batch.client_id,
    mailSnapshot: batch.mail_snapshot
  };
  
  const results = [];
  let hasFailure = false;
  
  console.log(`[ExecuteBatch] Starting execution of ${batch.actions.length} actions`);
  
  for (const action of batch.actions) {
    if (!action.enabled) {
      results.push({
        actionId: action.id,
        actionType: action.action_type,
        status: 'skipped',
        reason: 'disabled'
      });
      continue;
    }
    
    const result = await executeAction(base44, action, context, rollbackManager);
    
    results.push({
      actionId: action.id,
      actionType: action.action_type,
      ...result
    });
    
    if (result.status === 'failed') {
      hasFailure = true;
      console.error(`[ExecuteBatch] Action ${action.action_type} failed: ${result.error}`);
      // Continue with other actions, don't stop on failure
    }
  }
  
  // If any action failed, attempt rollback
  if (hasFailure) {
    console.log('[ExecuteBatch] Failures detected, initiating rollback...');
    await rollbackManager.rollbackAll();
  }
  
  const executionTime = Date.now() - startTime;
  
  const summary = {
    total_actions: batch.actions.length,
    successful: results.filter(r => r.status === 'success').length,
    failed: results.filter(r => r.status === 'failed').length,
    skipped: results.filter(r => r.status === 'skipped').length,
    execution_time_ms: executionTime
  };
  
  console.log(`[ExecuteBatch] Completed in ${executionTime}ms:`, summary);
  
  return {
    success: !hasFailure,
    results,
    summary
  };
}

// ========================================
// Individual Action Executors
// ========================================

async function executeSendEmail(base44, config, context) {
  const { to, subject, body } = config;
  
  if (!to) {
    return { status: 'skipped', reason: 'no_recipients' };
  }
  
  const result = await base44.functions.invoke('sendEmail', {
    to,
    subject,
    body
  });
  
  if (result?.error) {
    return { status: 'failed', error: result.error };
  }
  
  return { status: 'success', result: { sent_to: to } };
}

async function executeCreateTask(base44, config, context, rollbackManager) {
  const taskData = {
    title: config.title || 'משימה מאוטומציה',
    description: config.description || '',
    case_id: context.caseId,
    client_id: context.clientId,
    mail_id: context.mailId,
    status: 'pending',
    priority: config.priority || 'medium',
    due_date: config.due_date
  };
  
  const task = await base44.entities.Task.create(taskData);
  rollbackManager.register({ type: 'create_task', id: task.id });
  
  return { status: 'success', result: { id: task.id } };
}

async function executeBilling(base44, config, context, rollbackManager) {
  const { hours, rate, description } = config;
  
  if (!hours || hours <= 0) {
    return { status: 'skipped', reason: 'invalid_hours' };
  }
  
  const billingData = {
    case_id: context.caseId,
    description: description || 'חיוב מאוטומציה',
    hours,
    rate: rate || 800,
    date_worked: new Date().toISOString().split('T')[0],
    is_billable: true,
    billed: false
  };
  
  const timeEntry = await base44.entities.TimeEntry.create(billingData);
  rollbackManager.register({ type: 'billing', id: timeEntry.id });
  
  // Sync to Google Sheets if available
  try {
    await base44.functions.invoke('syncBillingToSheets', {
      timeEntryId: timeEntry.id
    });
  } catch (e) {
    console.warn('[Billing] Google Sheets sync failed:', e.message);
  }
  
  return { 
    status: 'success', 
    result: { 
      id: timeEntry.id, 
      hours, 
      amount: hours * (rate || 800) 
    } 
  };
}

async function executeCalendarEvent(base44, config, context, rollbackManager) {
  const eventData = {
    title: config.title || 'אירוע מאוטומציה',
    description: config.description || '',
    start_date: config.start_date,
    duration_minutes: config.duration_minutes || 60,
    case_id: context.caseId,
    client_id: context.clientId,
    reminder_minutes: config.reminder_minutes || 1440,
    create_meet_link: config.create_meet_link || false,
    attendees: config.attendees || []
  };
  
  const result = await base44.functions.invoke('createCalendarEvent', eventData);
  
  if (result?.error) {
    return { status: 'failed', error: result.error };
  }
  
  rollbackManager.register({ 
    type: 'calendar_event', 
    id: result?.google_event_id,
    metadata: result 
  });
  
  // Create deadline in system
  if (context.caseId) {
    try {
      const deadline = await base44.entities.Deadline.create({
        case_id: context.caseId,
        deadline_type: 'custom',
        description: eventData.title,
        due_date: eventData.start_date,
        status: 'pending',
        is_critical: false
      });
      rollbackManager.register({ type: 'create_deadline', id: deadline.id });
    } catch (e) {
      console.warn('[Calendar] Deadline creation failed:', e.message);
    }
  }
  
  return { 
    status: 'success', 
    result: { 
      google_event_id: result?.google_event_id,
      link: result?.htmlLink 
    } 
  };
}

async function executeSaveFile(base44, config, context) {
  const { path, mail_id } = config;
  
  if (!path || !mail_id) {
    return { status: 'skipped', reason: 'missing_config' };
  }
  
  try {
    const result = await base44.functions.invoke('downloadGmailAttachment', {
      mail_id,
      destination_path: path
    });
    
    if (result?.error) {
      return { status: 'failed', error: result.error };
    }
    
    return { status: 'success', result: { path, files_uploaded: result?.uploaded || 0 } };
  } catch (error) {
    return { status: 'failed', error: error.message };
  }
}

async function executeCreateAlert(base44, config, context, rollbackManager) {
  const alertData = {
    activity_type: 'automation_log',
    title: config.message || 'התרעה מאוטומציה',
    case_id: context.caseId,
    client_id: context.clientId,
    status: 'pending',
    metadata: {
      alert_type: config.alert_type || 'reminder',
      batch_id: context.batchId,
      rule_id: context.ruleId
    }
  };
  
  const activity = await base44.entities.Activity.create(alertData);
  rollbackManager.register({ type: 'create_alert', id: activity.id });
  
  return { status: 'success', result: { id: activity.id } };
}