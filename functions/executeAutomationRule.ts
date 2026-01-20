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
  constructor(supabase) {
    this.supabase = supabase;
    this.actions = [];
  }
  
  register(action) {
    this.actions.push(action);
    console.log(`[Rollback] Registered: ${action.type} (ID: ${action.id || 'N/A'})`);
  }
  
  async rollbackAll() {
    if (this.actions.length === 0) return;
    
    console.log(`[Rollback] 🔄 Rolling back ${this.actions.length} action(s)`);
    
    for (let i = this.actions.length - 1; i >= 0; i--) {
      const action = this.actions[i];
      try {
        switch (action.type) {
          case 'create_task':
            if (action.id) await this.supabase.from('Task').delete().eq('id', action.id);
            break;
          case 'billing':
            if (action.id) await this.supabase.from('TimeEntry').delete().eq('id', action.id);
            break;
          case 'create_alert':
            if (action.id) await this.supabase.from('Activity').delete().eq('id', action.id);
            break;
          case 'approval':
            if (action.id) await this.supabase.from('Activity').delete().eq('id', action.id);
            break;
        }
      } catch (error) {
        console.error(`[Rollback] ❌ Failed to rollback ${action.type}:`, error.message);
      }
    }
  }
}

// ========================================
// LOGGING HELPERS
// ========================================
async function logAutomationExecution(supabase, logData) {
  try {
    await supabase.from('Activity').insert({
      activity_type: 'automation_log',
      status: logData.execution_status === 'completed' ? 'completed' : 'failed',
      description: `${logData.rule_name} → ${logData.mail_subject}`,
      metadata: {
        rule_id: logData.rule_id,
        rule_name: logData.rule_name,
        mail_id: logData.mail_id,
        mail_subject: logData.mail_subject,
        execution_status: logData.execution_status,
        actions_summary: logData.actions_summary,
        execution_time_ms: logData.execution_time_ms,
        error_message: logData.error_message,
        case_id: logData.metadata?.case_id,
        client_id: logData.metadata?.client_id,
        logged_at: new Date().toISOString(),
      }
    });
  } catch (error) {
    console.error('[Logger] ❌ Failed to log execution:', error.message);
  }
}

async function updateRuleStats(supabase, ruleId, success) {
  try {
    const { data: rule } = await supabase.from('AutomationRule').select('metadata').eq('id', ruleId).maybeSingle();
    if (!rule) return;
    
    const metadata = rule.metadata || {};
    const stats = metadata.stats || { total_executions: 0, successful_executions: 0, failed_executions: 0, success_rate: 0 };
    
    stats.total_executions += 1;
    if (success) stats.successful_executions += 1; else stats.failed_executions += 1;
    stats.success_rate = (stats.successful_executions / stats.total_executions) * 100;
    stats.last_execution = new Date().toISOString();
    
    await supabase.from('AutomationRule').update({ metadata: { ...metadata, stats } }).eq('id', ruleId);
  } catch (error) {
    console.error('[Logger] ❌ Failed to update stats:', error.message);
  }
}

// ========================================
// RECIPIENT RESOLUTION
// ========================================
async function resolveRecipients(recipients, context, supabase) {
  if (!Array.isArray(recipients)) return [];
  const emails = [];
  
  for (const recipient of recipients) {
    try {
      if (recipient === 'client' && context.clientId) {
        const { data: client } = await supabase.from('Client').select('email').eq('id', context.clientId).maybeSingle();
        if (client?.email) emails.push(client.email);
      }
      else if (recipient === 'lawyer' && context.caseId) {
        const { data: caseData } = await supabase.from('Case').select('assigned_lawyer_id').eq('id', context.caseId).maybeSingle();
        if (caseData?.assigned_lawyer_id) {
          const { data: lawyer } = await supabase.from('User').select('email').eq('id', caseData.assigned_lawyer_id).maybeSingle();
          if (lawyer?.email) emails.push(lawyer.email);
        }
      }
      else if (recipient && recipient.includes('@')) {
        emails.push(recipient);
      }
    } catch (e) { console.error('Recipient resolution error:', e); }
  }
  return [...new Set(emails)];
}

// ========================================
// HELPER FUNCTIONS
// ========================================
function extractFromMail(mail, config) {
  if (!config) return null;
  const source = config.source || 'subject';
  const text = source === 'body' ? (mail.body_plain || mail.body_html || '') : mail.subject;
  if (!text) return null;
  
  if (config.regex) {
    try {
      const match = text.match(new RegExp(config.regex));
      return match ? match[1] || match[0] : null;
    } catch (e) { return null; }
  }
  
  if (config.anchor_text) {
    const index = text.indexOf(config.anchor_text);
    if (index === -1) return null;
    const afterAnchor = text.substring(index + config.anchor_text.length).trim();
    return afterAnchor.split(/[\s,;]+/)[0] || null;
  }
  return null;
}

async function replaceTokens(template, context, supabase) {
  if (!template) return '';
  let result = template;
  
  result = result.replace(/{Mail_Subject}/g, context.mail?.subject || '');
  result = result.replace(/{Mail_From}/g, context.mail?.sender_email || '');
  result = result.replace(/{Mail_Body}/g, context.mail?.body_plain || '');
  
  if (context.caseId) {
    const { data: caseData } = await supabase.from('Case').select('case_number, title, case_type, application_number').eq('id', context.caseId).maybeSingle();
    if (caseData) {
      result = result.replace(/{Case_No}/g, caseData.case_number || '');
      result = result.replace(/{Case_Title}/g, caseData.title || '');
      result = result.replace(/{Official_No}/g, caseData.application_number || '');
    }
  }
  
  if (context.clientId) {
    const { data: client } = await supabase.from('Client').select('name, email').eq('id', context.clientId).maybeSingle();
    if (client) {
      result = result.replace(/{Client_Name}/g, client.name || '');
    }
  }
  
  return result.replace(/{[^}]+}/g, '');
}

function calculateDueDate(offsetDays) {
  const date = new Date();
  date.setDate(date.getDate() + (offsetDays || 0));
  return date.toISOString().split('T')[0];
}

function calculateEventDate(baseDate, timing) {
  const date = new Date(baseDate || Date.now());
  const offset = timing?.timing_offset || 0;
  const unit = timing?.timing_unit || 'days';
  const direction = timing?.timing_direction || 'after';
  
  let daysToAdd = unit === 'weeks' ? offset * 7 : offset;
  if (direction === 'before') daysToAdd = -daysToAdd;
  
  date.setDate(date.getDate() + daysToAdd);
  date.setHours(10, 0, 0, 0);
  return date;
}

async function createApprovalActivity(supabase, data) {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);
  const { data: activity, error } = await supabase.from('Activity').insert({
    activity_type: 'approval_request',
    case_id: data.case_id,
    status: 'pending',
    description: `בקשת אישור: ${data.action_type}`,
    metadata: { ...data, expires_at: expiresAt.toISOString() }
  }).select().single();
  if (error) throw error;
  
  if (data.approver_email) {
    // שימוש ב-invoke במקום fetch ישיר
    supabase.functions.invoke('sendEmail', {
      body: { to: data.approver_email, subject: `נדרש אישור: ${data.action_type}`, body: `אנא אשר את הפעולה במערכת.` }
    }).catch(console.error);
  }
  return activity;
}

// ========================================
// MAIN HANDLER
// ========================================
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const startTime = Date.now();
  let rollbackManager = null;
  let mailData = null;
  let ruleData = null;
  
  // שימוש ב-SDK ליצירת קליינט (פותר את בעיית ה-ENV)
  const supabaseClient = createClientFromRequest(req);

  try {
    rollbackManager = new RollbackManager(supabaseClient);
    const { mailId, ruleId, testMode = false } = await req.json();

    if (!mailId || !ruleId) throw new Error('mailId and ruleId are required');

    // Fetch Data
    const { data: mail } = await supabaseClient.from('Mail').select('*').eq('id', mailId).single();
    const { data: rule } = await supabaseClient.from('AutomationRule').select('*').eq('id', ruleId).single();
    
    if (!mail || !rule) throw new Error('Mail or Rule not found');
    
    mailData = mail;
    ruleData = rule;

    // --- Logic ---
    let caseId = null;
    let clientId = null;
    let extractedInfo = {};

    if (rule.map_config) {
      for (const mapRule of rule.map_config) {
        const extracted = extractFromMail(mail, mapRule);
        if (extracted) {
          extractedInfo[mapRule.target_field] = extracted;
          
          if (mapRule.target_field === 'case_no') {
            const { data: c } = await supabaseClient.from('Case').select('id, client_id, case_number').eq('case_number', extracted).maybeSingle();
            if (c) { caseId = c.id; clientId = c.client_id; }
          }
          
          if (mapRule.target_field === 'official_no' && !caseId) {
            const { data: c } = await supabaseClient.from('Case').select('id, client_id').eq('application_number', extracted).maybeSingle();
            if (c) { caseId = c.id; clientId = c.client_id; }
          }
        }
      }
    }

    const results = [];
    const actions = rule.action_bundle || {};

    // Actions
    if (actions.send_email?.enabled) {
      const to = await resolveRecipients(actions.send_email.recipients, { caseId, clientId }, supabaseClient);
      if (to.length > 0) {
        const emailConfig = {
          to: to.join(','),
          subject: await replaceTokens(actions.send_email.subject_template, { mail, caseId, clientId }, supabaseClient),
          body: await replaceTokens(actions.send_email.body_template, { mail, caseId, clientId }, supabaseClient)
        };
        
        if (testMode) results.push({ action: 'send_email', status: 'test_skipped', data: emailConfig });
        else if (rule.require_approval) {
          const act = await createApprovalActivity(supabaseClient, { ...emailConfig, automation_rule_id: ruleId, mail_id: mailId, case_id: caseId, client_id: clientId, action_type: 'send_email', action_config: emailConfig, approver_email: rule.approver_email, mail_subject: mail.subject, mail_from: mail.sender_email });
          rollbackManager.register({ type: 'approval', id: act.id });
          results.push({ action: 'send_email', status: 'pending_approval' });
        } else {
          await supabaseClient.functions.invoke('sendEmail', { body: emailConfig });
          results.push({ action: 'send_email', status: 'success' });
        }
      }
    }

    if (actions.create_task?.enabled) {
      const taskData = {
        title: await replaceTokens(actions.create_task.title, { mail, caseId, clientId }, supabaseClient),
        description: await replaceTokens(actions.create_task.description, { mail, caseId, clientId }, supabaseClient),
        case_id: caseId,
        client_id: clientId,
        status: 'pending',
        due_date: calculateDueDate(actions.create_task.due_offset_days)
      };
      
      if (testMode) results.push({ action: 'create_task', status: 'test_skipped', data: taskData });
      else if (rule.require_approval) {
        const act = await createApprovalActivity(supabaseClient, { automation_rule_id: ruleId, mail_id: mailId, case_id: caseId, client_id: clientId, action_type: 'create_task', action_config: taskData, approver_email: rule.approver_email, mail_subject: mail.subject, mail_from: mail.sender_email });
        rollbackManager.register({ type: 'approval', id: act.id });
        results.push({ action: 'create_task', status: 'pending_approval' });
      } else {
        const { data: task } = await supabaseClient.from('Task').insert(taskData).select().single();
        rollbackManager.register({ type: 'create_task', id: task.id });
        results.push({ action: 'create_task', status: 'success', id: task.id });
      }
    }

    if (actions.billing?.enabled) {
      const { data: c } = await supabaseClient.from('Case').select('hourly_rate').eq('id', caseId).maybeSingle();
      const rate = c?.hourly_rate || actions.billing.hourly_rate || 800;
      const billingData = {
        case_id: caseId,
        description: await replaceTokens(actions.billing.description_template, { mail, caseId, clientId }, supabaseClient),
        hours: actions.billing.hours,
        hourly_rate: rate,
        total_amount: actions.billing.hours * rate,
        date: new Date().toISOString().split('T')[0],
        billable: true
      };
      
      if (testMode) results.push({ action: 'billing', status: 'test_skipped', data: billingData });
      else if (rule.require_approval) {
        const act = await createApprovalActivity(supabaseClient, { automation_rule_id: ruleId, mail_id: mailId, case_id: caseId, client_id: clientId, action_type: 'billing', action_config: billingData, approver_email: rule.approver_email, mail_subject: mail.subject, mail_from: mail.sender_email });
        rollbackManager.register({ type: 'approval', id: act.id });
        results.push({ action: 'billing', status: 'pending_approval' });
      } else {
        const { data: te } = await supabaseClient.from('TimeEntry').insert(billingData).select().single();
        rollbackManager.register({ type: 'billing', id: te.id });
        results.push({ action: 'billing', status: 'success' });
      }
    }

    // 4. Save File (Dropbox)
    if (actions.save_file?.enabled) {
      if (!mail.attachments || mail.attachments.length === 0) {
        results.push({ action: 'save_file', status: 'skipped', reason: 'no_attachments' });
      } else if (testMode) {
        const folderPath = await replaceTokens(actions.save_file.path_template, { mail, caseId, clientId }, supabaseClient);
        results.push({ action: 'save_file', status: 'test_skipped', data: { path: folderPath } });
      } else {
        const folderPath = await replaceTokens(actions.save_file.path_template, { mail, caseId, clientId }, supabaseClient);
        // שימוש ב-invoke ללא צורך ב-env vars
        const { error: dlError } = await supabaseClient.functions.invoke('downloadGmailAttachment', {
          body: {
            mail_id: mailId,
            destination_path: folderPath
          }
        });
        
        if (dlError) throw new Error(`downloadGmailAttachment failed: ${dlError.message}`);
        results.push({ action: 'save_file', status: 'success', uploaded: mail.attachments.length });
      }
    }

    const executionTime = Date.now() - startTime;
    if (!testMode) {
      await logAutomationExecution(supabaseClient, { rule_id: ruleId, rule_name: rule.name, mail_id: mailId, mail_subject: mail.subject, execution_status: 'completed', actions_summary: results, execution_time_ms: executionTime, metadata: { case_id: caseId, extracted: extractedInfo } });
      await updateRuleStats(supabaseClient, ruleId, true);
    }

    return new Response(JSON.stringify({ success: true, results, summary: { total: results.length }, execution_time_ms: executionTime, extracted_info: extractedInfo }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('[AutoRule] ❌ Error:', error);
    if (rollbackManager && !req.json().then(b => b.testMode).catch(() => false)) await rollbackManager.rollbackAll();
    
    // נסיון לוג ללא קריסה נוספת
    try {
      if (mailData && ruleData && supabaseClient) {
        await logAutomationExecution(supabaseClient, {
          rule_id: ruleData.id, rule_name: ruleData.name, mail_id: mailData.id, mail_subject: mailData.subject,
          execution_status: 'failed', actions_summary: [], execution_time_ms: Date.now() - startTime, error_message: error.message
        });
      }
    } catch (e) { /* ignore log error */ }

    return new Response(JSON.stringify({ error: error.message, stack: error.stack }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});