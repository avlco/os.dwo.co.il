// @ts-nocheck
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ========================================
// ROLLBACK MANAGER
// ========================================
class RollbackManager {
  constructor(base44) {
    this.base44 = base44;
    this.actions = [];
  }
  
  register(action) {
    this.actions.push(action);
    console.log(`[Rollback] Registered: ${action.type} (ID: ${action.id || 'N/A'})`);
  }
  
  async rollbackAll() {
    if (this.actions.length === 0) return;
    
    console.log(`[Rollback] 🔄 Rolling back ${this.actions.length} action(s)`);
    const errors = [];
    
    for (let i = this.actions.length - 1; i >= 0; i--) {
      const action = this.actions[i];
      try {
        switch (action.type) {
          case 'create_task':
            if (action.id) await this.base44.entities.Task.delete(action.id);
            console.log(`[Rollback] ✅ Deleted task ${action.id}`);
            break;
          case 'billing':
            if (action.id) await this.base44.entities.TimeEntry.delete(action.id);
            console.log(`[Rollback] ✅ Deleted time entry ${action.id}`);
            break;
          case 'create_alert':
            if (action.id) await this.base44.entities.Activity.delete(action.id);
            console.log(`[Rollback] ✅ Deleted activity ${action.id}`);
            break;
        }
      } catch (error) {
        console.error(`[Rollback] ❌ Failed to rollback ${action.type}:`, error.message);
        errors.push({ action: action.type, id: action.id, error: error.message });
      }
    }
  }
}

// ========================================
// LOGGING HELPERS
// ========================================
async function logAutomationExecution(base44, logData) {
  try {
    const actionsSummaryStrings = (logData.actions_summary || []).map(action => {
      if (typeof action === 'string') return action;
      
      const statusIcons = {
        'success': '✅',
        'failed': '❌',
        'pending_batch': '⏳', // New icon for batching
        'skipped': '⏭️'
      };
      
      const status = statusIcons[action.status] || '❓';
      let detail = '';
      
      if (action.status === 'pending_batch') detail = ' (Queued for approval)';
      else if (action.sent_to) detail = ` (${action.sent_to.join(', ')})`;
      else if (action.id) detail = ` (ID: ${action.id})`;
      else if (action.error) detail = `: ${action.error}`;
      else if (action.reason) detail = ` (${action.reason})`;
      
      return `${action.action}: ${status}${detail}`;
    });

    await base44.entities.Activity.create({
      activity_type: 'automation_log',
      type: 'automation_log',
      case_id: logData.metadata?.case_id || null,
      client_id: logData.metadata?.client_id || null,
      status: logData.execution_status === 'completed' ? 'completed' : 'failed',
      title: `${logData.rule_name} - ${logData.execution_status}`,
      description: `${logData.rule_name} → ${logData.mail_subject}`,
      user_email: logData.user_email || null,
      metadata: {
        rule_id: logData.rule_id,
        rule_name: logData.rule_name,
        mail_id: logData.mail_id,
        mail_subject: logData.mail_subject,
        execution_status: logData.execution_status,
        actions_summary: actionsSummaryStrings,
        execution_time_ms: logData.execution_time_ms,
        error_message: logData.error_message,
        case_id_ref: logData.metadata?.case_id,
        client_id_ref: logData.metadata?.client_id,
        logged_at: new Date().toISOString()
      }
    });

    console.log('[Logger] ✅ Execution logged successfully');
  } catch (error) {
    console.error('[Logger] ❌ Failed to log execution:', error.message);
  }
}

async function updateRuleStats(base44, ruleId, success) {
  try {
    const rule = await base44.entities.AutomationRule.get(ruleId);
    if (!rule) return;
    
    const metadata = rule.metadata || {};
    const stats = metadata.stats || { 
      total_executions: 0, 
      successful_executions: 0, 
      failed_executions: 0, 
      success_rate: 0 
    };
    
    stats.total_executions += 1;
    if (success) {
      stats.successful_executions += 1;
    } else {
      stats.failed_executions += 1;
    }
    stats.success_rate = (stats.successful_executions / stats.total_executions) * 100;
    stats.last_execution = new Date().toISOString();
    
    await base44.entities.AutomationRule.update(ruleId, { 
      metadata: { ...metadata, stats } 
    });
  } catch (error) {
    console.error('[Stats] ❌ Failed to update stats:', error.message);
  }
}

// ========================================
// RECIPIENT RESOLUTION
// ========================================
async function resolveRecipients(recipients, context, base44) {
  if (!Array.isArray(recipients)) return [];
  const emails = [];
  
  for (const recipient of recipients) {
    try {
      if (recipient === 'client' && context.clientId) {
        const client = await base44.entities.Client.get(context.clientId);
        if (client?.email) emails.push(client.email);
      }
      else if (recipient === 'lawyer' && context.caseId) {
        const caseData = await base44.entities.Case.get(context.caseId);
        if (caseData?.assigned_lawyer_id) {
          const lawyer = await base44.entities.User.get(caseData.assigned_lawyer_id);
          if (lawyer?.email) emails.push(lawyer.email);
        }
      }
      else if (recipient && recipient.includes('@')) {
        emails.push(recipient);
      }
    } catch (e) { 
      console.error(`[Recipient] Error resolving ${recipient}:`, e.message); 
    }
  }
  
  return [...new Set(emails)];
}

// ========================================
// HELPER FUNCTIONS
// ========================================
function extractFromMail(mail, config) {
  if (!config) return null;
  
  const source = config.source || 'subject';
  const text = source === 'body' 
    ? (mail.body_plain || mail.body_html || '') 
    : mail.subject;
  
  if (!text) return null;
  
  if (config.regex) {
    try {
      const regex = new RegExp(config.regex, 'i');
      const match = text.match(regex);
      return match ? (match[1] || match[0]) : null;
    } catch (e) { 
      return null; 
    }
  }
  
  if (config.anchor_text) {
    const index = text.indexOf(config.anchor_text);
    if (index === -1) return null;
    const afterAnchor = text.substring(index + config.anchor_text.length).trim();
    return afterAnchor.split(/[\s,;]+/)[0] || null;
  }
  
  return null;
}

async function replaceTokens(template, context, base44) {
  if (!template) return '';
  let result = template;
  
  result = result.replace(/{Mail_Subject}/g, context.mail?.subject || '');
  result = result.replace(/{Mail_From}/g, context.mail?.sender_email || '');
  result = result.replace(/{Mail_Body}/g, context.mail?.body_plain || '');
  
  if (context.caseId) {
    try {
      const caseData = await base44.entities.Case.get(context.caseId);
      if (caseData) {
        result = result.replace(/{Case_No}/g, caseData.case_number || '');
        result = result.replace(/{Case_Title}/g, caseData.title || '');
        result = result.replace(/{Official_No}/g, caseData.application_number || '');
      }
    } catch (e) {}
  }
  
  if (context.clientId) {
    try {
      const client = await base44.entities.Client.get(context.clientId);
      if (client) {
        result = result.replace(/{Client_Name}/g, client.name || '');
      }
    } catch (e) {}
  }
  
  result = result.replace(/{[^}]+}/g, '');
  return result;
}

function calculateDueDate(offsetDays) {
  const date = new Date();
  date.setDate(date.getDate() + (offsetDays || 0));
  return date.toISOString().split('T')[0];
}

// ========================================
// MAIN HANDLER
// ========================================
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();
  let rollbackManager = null;
  let mailData = null;
  let ruleData = null;
  let userEmail = null;
  
  try {
    const base44 = createClientFromRequest(req);
    rollbackManager = new RollbackManager(base44);
    
    const rawBody = await req.json();
    const params = rawBody.body || rawBody;
    const { mailId, ruleId, testMode = false } = params;

    if (!mailId || !ruleId) {
      throw new Error('mailId and ruleId are required');
    }

    // 1. Fetch Mail
    const mail = await base44.entities.Mail.get(mailId);
    if (!mail) throw new Error(`Mail not found: ${mailId}`);
    mailData = mail;

    if (mail.sender_email) {
      let rawEmail = mail.sender_email;
      const emailMatch = rawEmail.match(/<(.+?)>/);
      userEmail = emailMatch ? emailMatch[1] : rawEmail;
    }

    // 2. Fetch Rule
    const rule = await base44.entities.AutomationRule.get(ruleId);
    if (!rule) throw new Error(`Rule not found: ${ruleId}`);
    ruleData = rule;

    // 3. MAP Phase (Extract Info)
    let caseId = null;
    let clientId = null;
    let extractedInfo = {};

    if (rule.map_config && Array.isArray(rule.map_config)) {
      for (const mapRule of rule.map_config) {
        const extracted = extractFromMail(mail, mapRule);
        if (extracted) {
          extractedInfo[mapRule.target_field] = extracted;
          
          if (mapRule.target_field === 'case_no') {
            try {
              const cases = await base44.entities.Case.filter({ case_number: extracted });
              if (cases && cases.length > 0) {
                caseId = cases[0].id;
                clientId = cases[0].client_id;
              }
            } catch (e) {}
          }
          
          if (mapRule.target_field === 'official_no' && !caseId) {
            try {
              const cases = await base44.entities.Case.filter({ application_number: extracted });
              if (cases && cases.length > 0) {
                caseId = cases[0].id;
                clientId = cases[0].client_id;
              }
            } catch (e) {}
          }
        }
      }
    }

    // 4. DISPATCH Phase (Execute or Queue Actions)
    const results = [];
    const actions = rule.action_bundle || {};
    const requireApproval = rule.require_approval && !testMode;

    console.log(`[AutoRule] Rule "${rule.name}" | Require Approval: ${requireApproval}`);

    // --- Helper to Queue Action for Batching ---
    function queueForBatch(actionType, config) {
      const payload = {
        action: actionType,
        action_type: actionType,
        status: 'pending_batch',
        rule_id: ruleId,
        rule_name: rule.name,
        approver_email: rule.approver_email,
        config: config,
        enabled: true,
        catch_snapshot: rule.catch_config,
        map_snapshot: rule.map_config
      };
      results.push(payload);
      console.log(`[AutoRule] ⏳ Action "${actionType}" queued for batch approval`);
    }

    // ✅ Action 1: Send Email
    if (actions.send_email?.enabled) {
      const to = await resolveRecipients(
        actions.send_email.recipients, 
        { caseId, clientId }, 
        base44
      );
      
      if (to.length > 0) {
        const emailConfig = {
          to: to.join(','),
          subject: await replaceTokens(actions.send_email.subject_template, { mail, caseId, clientId }, base44),
          body: await replaceTokens(actions.send_email.body_template, { mail, caseId, clientId }, base44)
        };
        
        if (testMode) {
          results.push({ action: 'send_email', status: 'test_skipped', data: emailConfig });
        } else if (requireApproval) {
          queueForBatch('send_email', emailConfig);
        } else {
          // Execute Immediately
          const emailResult = await base44.functions.invoke('sendEmail', emailConfig);
          if (emailResult.error) throw new Error(`sendEmail failed: ${emailResult.error}`);
          results.push({ action: 'send_email', status: 'success', sent_to: to });
        }
      } else {
        results.push({ action: 'send_email', status: 'skipped', reason: 'no_recipients' });
      }
    }

    // ✅ Action 2: Create Task
    if (actions.create_task?.enabled) {
      const taskData = {
        title: await replaceTokens(actions.create_task.title, { mail, caseId, clientId }, base44),
        description: await replaceTokens(actions.create_task.description, { mail, caseId, clientId }, base44),
        case_id: caseId,
        client_id: clientId,
        mail_id: mailId,
        status: 'pending',
        due_date: calculateDueDate(actions.create_task.due_offset_days)
      };
      
      if (testMode) {
        results.push({ action: 'create_task', status: 'test_skipped', data: taskData });
      } else if (requireApproval) {
        queueForBatch('create_task', taskData);
      } else {
        const task = await base44.entities.Task.create(taskData);
        rollbackManager.register({ type: 'create_task', id: task.id });
        results.push({ action: 'create_task', status: 'success', id: task.id });
      }
    }

    // ✅ Action 3: Billing
    if (actions.billing?.enabled) {
      let rate = actions.billing.hourly_rate || 800;
      if (caseId) {
        try {
          const caseData = await base44.entities.Case.get(caseId);
          if (caseData?.hourly_rate) rate = caseData.hourly_rate;
        } catch (e) {}
      }
      
      let description = actions.billing.description_template 
        ? await replaceTokens(actions.billing.description_template, { mail, caseId, clientId }, base44)
        : mail.subject;

      const billingData = {
        case_id: caseId,
        client_id: clientId,
        description: description,
        hours: actions.billing.hours,
        rate: rate,
        date_worked: new Date().toISOString(),
        is_billable: true,
        billed: false,
        user_email: userEmail
      };
      
      if (testMode) {
        results.push({ action: 'billing', status: 'test_skipped', data: billingData });
      } else if (requireApproval) {
        queueForBatch('billing', billingData);
      } else {
        const timeEntry = await base44.entities.TimeEntry.create(billingData);
        
        // Sync to sheets (async/fire-and-forget for speed)
        base44.functions.invoke('syncBillingToSheets', { timeEntryId: timeEntry.id }).catch(console.error);

        rollbackManager.register({ type: 'billing', id: timeEntry.id });
        results.push({ action: 'billing', status: 'success', id: timeEntry.id });
      }
    }

    // ✅ Action 4: Save File
    if (actions.save_file?.enabled) {
      if (!mail.attachments || mail.attachments.length === 0) {
        results.push({ action: 'save_file', status: 'skipped', reason: 'no_attachments' });
      } else {
        const folderPath = await replaceTokens(actions.save_file.path_template, { mail, caseId, clientId }, base44);
        const fileConfig = { path: folderPath, files: mail.attachments.length };

        if (testMode) {
          results.push({ action: 'save_file', status: 'test_skipped', data: fileConfig });
        } else if (requireApproval) {
          queueForBatch('save_file', fileConfig);
        } else {
          // Note: downloadGmailAttachment is an external function call
          const supabaseUrl = Deno.env.get('SUPABASE_URL');
          const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
          
          const downloadResponse = await fetch(`${supabaseUrl}/functions/v1/downloadGmailAttachment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseServiceKey}` },
            body: JSON.stringify({ mail_id: mailId, destination_path: folderPath })
          });
          
          if (!downloadResponse.ok) throw new Error(`downloadGmailAttachment failed`);
          results.push({ action: 'save_file', status: 'success', uploaded: mail.attachments.length });
        }
      }
    }

    // ✅ Action 5: Calendar Event
    if (actions.calendar_event?.enabled) {
      const eventData = {
        title: await replaceTokens(actions.calendar_event.title_template || 'תזכורת', { mail, caseId, clientId }, base44),
        description: await replaceTokens(actions.calendar_event.description_template || '', { mail, caseId, clientId }, base44),
        start_date: calculateDueDate(actions.calendar_event.timing_offset || 7),
        duration_minutes: actions.calendar_event.duration_minutes || 60,
        case_id: caseId,
        client_id: clientId,
        create_meet_link: actions.calendar_event.create_meet_link || false,
        attendees: actions.calendar_event.attendees || []
      };
      
      if (testMode) {
        results.push({ action: 'calendar_event', status: 'test_skipped', data: eventData });
      } else if (requireApproval) {
        queueForBatch('calendar_event', eventData);
      } else {
        const calendarResult = await base44.functions.invoke('createCalendarEvent', eventData);
        if (calendarResult?.error) throw new Error(calendarResult.error);
        
        // Optional: Create Deadline in system
        if (caseId) {
          try {
            await base44.entities.Deadline.create({
              case_id: caseId,
              deadline_type: 'custom',
              description: eventData.title,
              due_date: eventData.start_date,
              status: 'pending',
              assigned_to_email: userEmail
            });
          } catch(e) { console.error('Deadline creation failed', e); }
        }

        results.push({ action: 'calendar_event', status: 'success', google_event_id: calendarResult?.google_event_id });
      }
    }

    // --- Finalize ---
    const executionTime = Date.now() - startTime;
    
    // Log result regardless of status (success/pending_batch)
    if (!testMode) {
      await logAutomationExecution(base44, {
        rule_id: ruleId,
        rule_name: rule.name,
        mail_id: mailId,
        mail_subject: mail.subject,
        execution_status: 'completed',
        actions_summary: results,
        execution_time_ms: executionTime,
        user_email: userEmail,
        metadata: { case_id: caseId, client_id: clientId, extracted: extractedInfo }
      });
      
      await updateRuleStats(base44, ruleId, true);
    }

    // Return extended info for the ProcessIncomingMail orchestrator
    return new Response(
      JSON.stringify({ 
        success: true, 
        results, 
        extracted_info: extractedInfo,
        case_id: caseId,
        client_id: clientId
      }), 
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error) {
    console.error('[AutoRule] ❌ Error:', error);
    if (rollbackManager && !testMode) await rollbackManager.rollbackAll();
    
    // Log Failure
    try {
      if (mailData && ruleData) {
        const base44 = createClientFromRequest(req);
        await logAutomationExecution(base44, {
          rule_id: ruleData.id, 
          rule_name: ruleData.name, 
          mail_id: mailData.id, 
          mail_subject: mailData.subject,
          execution_status: 'failed', 
          actions_summary: [], 
          execution_time_ms: Date.now() - startTime, 
          error_message: error.message,
          user_email: userEmail
        });
        await updateRuleStats(base44, ruleData.id, false);
      }
    } catch (e) {}

    return new Response(
      JSON.stringify({ error: error.message }), 
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});