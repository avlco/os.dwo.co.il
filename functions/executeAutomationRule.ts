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
          case 'approval':
            if (action.id) await this.base44.entities.Activity.delete(action.id);
            console.log(`[Rollback] ✅ Deleted approval ${action.id}`);
            break;
        }
      } catch (error) {
        console.error(`[Rollback] ❌ Failed to rollback ${action.type}:`, error.message);
        errors.push({ action: action.type, id: action.id, error: error.message });
      }
    }
    
    if (errors.length > 0) {
      try {
        await this.base44.entities.Activity.create({
          activity_type: 'rollback_failed',
          status: 'failed',
          description: 'Rollback encountered errors',
          metadata: { errors, timestamp: new Date().toISOString() }
        });
      } catch (e) {
        console.error('[Rollback] Failed to log rollback errors:', e);
      }
    }
  }
}

// ========================================
// LOGGING HELPERS
// ========================================
async function logAutomationExecution(base44, logData) {
  try {
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
        actions_summary: JSON.stringify(logData.actions_summary || []),
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
    
    console.log(`[Stats] Updated: ${stats.total_executions} total, ${stats.success_rate.toFixed(1)}% success`);
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
        if (client?.email) {
          emails.push(client.email);
          console.log(`[Recipient] Resolved 'client' → ${client.email}`);
        }
      }
      else if (recipient === 'lawyer' && context.caseId) {
        const caseData = await base44.entities.Case.get(context.caseId);
        if (caseData?.assigned_lawyer_id) {
          const lawyer = await base44.entities.User.get(caseData.assigned_lawyer_id);
          if (lawyer?.email) {
            emails.push(lawyer.email);
            console.log(`[Recipient] Resolved 'lawyer' → ${lawyer.email}`);
          }
        }
      }
      else if (recipient && recipient.includes('@')) {
        emails.push(recipient);
        console.log(`[Recipient] Direct email → ${recipient}`);
      }
    } catch (e) { 
      console.error(`[Recipient] Error resolving ${recipient}:`, e.message); 
    }
  }
  
  const uniqueEmails = [...new Set(emails)];
  console.log(`[Recipient] Total resolved: ${uniqueEmails.length} emails`);
  return uniqueEmails;
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
  
  // Regex extraction
  if (config.regex) {
    try {
      const regex = new RegExp(config.regex, 'i');
      const match = text.match(regex);
      const extracted = match ? (match[1] || match[0]) : null;
      if (extracted) {
        console.log(`[Extract] Regex "${config.regex}" found: "${extracted}"`);
      }
      return extracted;
    } catch (e) { 
      console.error(`[Extract] Invalid regex: ${config.regex}`, e.message);
      return null; 
    }
  }
  
  // Anchor text extraction
  if (config.anchor_text) {
    const index = text.indexOf(config.anchor_text);
    if (index === -1) return null;
    
    const afterAnchor = text.substring(index + config.anchor_text.length).trim();
    const extracted = afterAnchor.split(/[\s,;]+/)[0] || null;
    if (extracted) {
      console.log(`[Extract] Anchor "${config.anchor_text}" found: "${extracted}"`);
    }
    return extracted;
  }
  
  return null;
}

async function replaceTokens(template, context, base44) {
  if (!template) return '';
  let result = template;
  
  // Mail tokens
  result = result.replace(/{Mail_Subject}/g, context.mail?.subject || '');
  result = result.replace(/{Mail_From}/g, context.mail?.sender_email || '');
  result = result.replace(/{Mail_Body}/g, context.mail?.body_plain || '');
  
  // Case tokens
  if (context.caseId) {
    try {
      const caseData = await base44.entities.Case.get(context.caseId);
      if (caseData) {
        result = result.replace(/{Case_No}/g, caseData.case_number || '');
        result = result.replace(/{Case_Title}/g, caseData.title || '');
        result = result.replace(/{Official_No}/g, caseData.application_number || '');
      }
    } catch (e) {
      console.error('[Tokens] Failed to load case data:', e.message);
    }
  }
  
  // Client tokens
  if (context.clientId) {
    try {
      const client = await base44.entities.Client.get(context.clientId);
      if (client) {
        result = result.replace(/{Client_Name}/g, client.name || '');
      }
    } catch (e) {
      console.error('[Tokens] Failed to load client data:', e.message);
    }
  }
  
  // Remove unresolved tokens
  result = result.replace(/{[^}]+}/g, '');
  
  return result;
}

function calculateDueDate(offsetDays) {
  const date = new Date();
  date.setDate(date.getDate() + (offsetDays || 0));
  return date.toISOString().split('T')[0];
}

async function createApprovalActivity(base44, data) {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  const activity = await base44.entities.Activity.create({
    activity_type: 'approval_request',
    title: `אישור: ${data.action_type} - ${data.mail_subject || 'ללא נושא'}`,
    case_id: data.case_id || null,
    client_id: data.client_id || null,
    status: 'pending',
    description: `בקשת אישור: ${data.action_type}`,
    metadata: {
      automation_rule_id: data.automation_rule_id,
      mail_id: data.mail_id,
      action_type: data.action_type,
      action_config: data.action_config,
      approver_email: data.approver_email,
      mail_subject: data.mail_subject,
      mail_from: data.mail_from,
      expires_at: expiresAt.toISOString(),
    }
  });

  console.log(`[Approval] Created approval request: ${activity.id}`);
  
  if (data.approver_email) {
    try {
      await base44.functions.invoke('sendEmail', {
        to: data.approver_email,
        subject: `אישור נדרש: ${data.action_type}`,
        body: `
          <h2>בקשת אישור לאוטומציה</h2>
          <p><strong>פעולה:</strong> ${data.action_type}</p>
          <p><strong>מייל:</strong> ${data.mail_subject}</p>
          <p><strong>מאת:</strong> ${data.mail_from}</p>
          <hr>
          <pre>${JSON.stringify(data, null, 2)}</pre>
        `,
      });
      console.log(`[Approval] ✅ Email sent to ${data.approver_email}`);
    } catch (emailError) {
      console.error('[Approval] ❌ Failed to send email:', emailError.message);
    }
  }
  
  return activity;
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
  let userEmail = null; // ⭐ הגדרה גלובלית של userEmail
  
  try {
    const base44 = createClientFromRequest(req);
    rollbackManager = new RollbackManager(base44);
    
    const rawBody = await req.json();
    console.log(`[AutoRule] 🔍 RAW REQUEST:`, JSON.stringify(rawBody));

    const params = rawBody.body || rawBody;
    const { mailId, ruleId, testMode = false } = params;

    console.log(`[AutoRule] 🔍 PARSED PARAMS:`, { 
      mailId, 
      ruleId, 
      testMode, 
      testModeType: typeof testMode 
    });

    if (!mailId || !ruleId) {
      throw new Error('mailId and ruleId are required');
    }

    console.log(`\n[AutoRule] 🚀 Starting execution`);
    console.log(`[AutoRule] Mail ID: ${mailId}`);
    console.log(`[AutoRule] Rule ID: ${ruleId}`);
    console.log(`[AutoRule] Test Mode: ${testMode}`);

    console.log('[AutoRule] 📧 Fetching mail...');
    const mail = await base44.entities.Mail.get(mailId);
    if (!mail) {
      throw new Error(`Mail not found: ${mailId}`);
    }
    mailData = mail;
    console.log(`[AutoRule] ✅ Mail found: "${mail.subject}"`);

    // ⭐ חלץ userEmail מייד אחרי שליפת Mail
    if (mail.sender_email) {
      let rawEmail = mail.sender_email;
      const emailMatch = rawEmail.match(/<(.+?)>/);
      userEmail = emailMatch ? emailMatch[1] : rawEmail;
      console.log(`[AutoRule] 👤 User email: ${userEmail}`);
    }

    console.log('[AutoRule] 📋 Fetching rule...');
    const rule = await base44.entities.AutomationRule.get(ruleId);
    if (!rule) {
      throw new Error(`Rule not found: ${ruleId}`);
    }
    ruleData = rule;
    console.log(`[AutoRule] ✅ Rule found: "${rule.name}"`);

    // --- MAP: Extract Information ---
    let caseId = null;
    let clientId = null;
    let extractedInfo = {};

    console.log('[AutoRule] 🗺️ Starting MAP phase...');
    if (rule.map_config && Array.isArray(rule.map_config)) {
      for (const mapRule of rule.map_config) {
        const extracted = extractFromMail(mail, mapRule);
        if (extracted) {
          extractedInfo[mapRule.target_field] = extracted;
          
          if (mapRule.target_field === 'case_no') {
            try {
              const cases = await base44.entities.Case.filter({ case_number: extracted });
              if (cases && cases.length > 0) {
                const matchedCase = cases[0];
                caseId = matchedCase.id;
                clientId = matchedCase.client_id;
                console.log(`[MAP] ✅ Matched Case: ${matchedCase.case_number} (ID: ${caseId})`);
              }
            } catch (e) {
              console.error('[MAP] Failed to find case:', e.message);
            }
          }
          
          if (mapRule.target_field === 'official_no' && !caseId) {
            try {
              const cases = await base44.entities.Case.filter({ application_number: extracted });
              if (cases && cases.length > 0) {
                const matchedCase = cases[0];
                caseId = matchedCase.id;
                clientId = matchedCase.client_id;
                console.log(`[MAP] ✅ Matched Case by official no: ${extracted} (ID: ${caseId})`);
              }
            } catch (e) {
              console.error('[MAP] Failed to find case by official no:', e.message);
            }
          }
        }
      }
    }
    console.log(`[MAP] Extracted info:`, extractedInfo);
    console.log(`[MAP] Case ID: ${caseId || 'N/A'}, Client ID: ${clientId || 'N/A'}`);

    // --- DISPATCH: Execute Actions ---
    const results = [];
    const actions = rule.action_bundle || {};

    console.log('[AutoRule] 🎬 Starting DISPATCH phase...');

    // ✅ Action 1: Send Email
    if (actions.send_email?.enabled) {
      console.log('[Action] 📧 Processing send_email...');
      
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
        
        console.log(`[Action] Email config:`, emailConfig);
        
        if (testMode) {
          results.push({ action: 'send_email', status: 'test_skipped', data: emailConfig });
          console.log('[Action] ⏭️ Skipped (test mode)');
        } else if (rule.require_approval) {
          const approvalActivity = await createApprovalActivity(base44, { 
            ...emailConfig, 
            automation_rule_id: ruleId, 
            mail_id: mailId, 
            case_id: caseId, 
            client_id: clientId, 
            action_type: 'send_email', 
            action_config: emailConfig, 
            approver_email: rule.approver_email, 
            mail_subject: mail.subject, 
            mail_from: mail.sender_email 
          });
          rollbackManager.register({ type: 'approval', id: approvalActivity.id });
          results.push({ action: 'send_email', status: 'pending_approval', approval_id: approvalActivity.id });
          console.log('[Action] ⏸️ Pending approval');
        } else {
          const emailResult = await base44.functions.invoke('sendEmail', {
            to: emailConfig.to,
            subject: emailConfig.subject,
            body: emailConfig.body
          });

          if (emailResult.error) {
            throw new Error(`sendEmail failed: ${emailResult.error}`);
          }

          results.push({ action: 'send_email', status: 'success', sent_to: to });
          console.log('[Action] ✅ Email sent successfully');
        }
      } else {
        results.push({ action: 'send_email', status: 'skipped', reason: 'no_recipients' });
        console.log('[Action] ⏭️ Skipped (no recipients)');
      }
    }

    // ✅ Action 2: Create Task
    if (actions.create_task?.enabled) {
      console.log('[Action] 📝 Processing create_task...');
      
      const taskData = {
        title: await replaceTokens(actions.create_task.title, { mail, caseId, clientId }, base44),
        description: await replaceTokens(actions.create_task.description, { mail, caseId, clientId }, base44),
        case_id: caseId,
        client_id: clientId,
        mail_id: mailId,
        status: 'pending',
        due_date: calculateDueDate(actions.create_task.due_offset_days)
      };
      
      console.log(`[Action] Task data:`, taskData);
      
      if (testMode) {
        results.push({ action: 'create_task', status: 'test_skipped', data: taskData });
        console.log('[Action] ⏭️ Skipped (test mode)');
      } else if (rule.require_approval) {
        const approvalActivity = await createApprovalActivity(base44, { 
          automation_rule_id: ruleId, 
          mail_id: mailId, 
          case_id: caseId, 
          client_id: clientId, 
          action_type: 'create_task', 
          action_config: taskData, 
          approver_email: rule.approver_email, 
          mail_subject: mail.subject, 
          mail_from: mail.sender_email 
        });
        rollbackManager.register({ type: 'approval', id: approvalActivity.id });
        results.push({ action: 'create_task', status: 'pending_approval', approval_id: approvalActivity.id });
        console.log('[Action] ⏸️ Pending approval');
      } else {
        const task = await base44.entities.Task.create(taskData);
        rollbackManager.register({ type: 'create_task', id: task.id });
        results.push({ action: 'create_task', status: 'success', id: task.id });
        console.log(`[Action] ✅ Task created: ${task.id}`);
      }
    }

    // ✅ Action 3: Billing
    if (actions.billing?.enabled) {
      console.log('[Action] 💰 Processing billing...');
      
      let rate = actions.billing.hourly_rate || 800;
      
      if (caseId) {
        try {
          const caseData = await base44.entities.Case.get(caseId);
          if (caseData?.hourly_rate) {
            rate = caseData.hourly_rate;
            console.log(`[Action] Using case hourly rate: ${rate}`);
          }
        } catch (e) {
          console.error('[Action] Failed to get case rate:', e.message);
        }
      }
      
      // בנה description מפורט
      let description = actions.billing.description_template 
        ? await replaceTokens(actions.billing.description_template, { mail, caseId, clientId }, base44)
        : mail.subject;

      // ⭐ userEmail כבר מוגדר בהתחלה של הפונקציה
      const billingData = {
        case_id: caseId,
        client_id: clientId,
        description: description,
        hours: actions.billing.hours,
        rate: rate,
        date_worked: new Date().toISOString().split('T')[0],
        is_billable: true,
        billed: false,
        user_email: userEmail,
        task_id: null
      };
      
      console.log(`[Action] Billing data:`, billingData);
      
      if (testMode) {
        results.push({ action: 'billing', status: 'test_skipped', data: billingData });
        console.log('[Action] ⏭️ Skipped (test mode)');
      } else if (rule.require_approval) {
        const approvalActivity = await createApprovalActivity(base44, { 
          automation_rule_id: ruleId, 
          mail_id: mailId, 
          case_id: caseId, 
          client_id: clientId, 
          action_type: 'billing', 
          action_config: billingData, 
          approver_email: rule.approver_email, 
          mail_subject: mail.subject, 
          mail_from: mail.sender_email 
        });
        rollbackManager.register({ type: 'approval', id: approvalActivity.id });
        results.push({ action: 'billing', status: 'pending_approval', approval_id: approvalActivity.id });
        console.log('[Action] ⏸️ Pending approval');
      } else {
        const timeEntry = await base44.entities.TimeEntry.create(billingData);

        // סנכרן לגוגל שיטס
        try {
          const sheetsResult = await base44.functions.invoke('syncBillingToSheets', {
            timeEntryId: timeEntry.id
          });
          
          if (sheetsResult.error) {
            console.error('[Action] Google Sheets sync failed:', sheetsResult.error);
          } else {
            console.log('[Action] ✅ Synced to Google Sheets successfully');
          }
        } catch (sheetsError) {
          console.error('[Action] Google Sheets API error:', sheetsError.message);
        }

        rollbackManager.register({ type: 'billing', id: timeEntry.id });
        results.push({ 
          action: 'billing', 
          status: 'success', 
          id: timeEntry.id, 
          hours: billingData.hours, 
          amount: billingData.hours * rate 
        });
        console.log(`[Action] ✅ Time entry created: ${timeEntry.id}`);
      }
    }

    // ✅ Action 4: Save File (Dropbox)
    if (actions.save_file?.enabled) {
      console.log('[Action] 💾 Processing save_file...');
      
      if (!mail.attachments || mail.attachments.length === 0) {
        results.push({ action: 'save_file', status: 'skipped', reason: 'no_attachments' });
        console.log('[Action] ⏭️ Skipped (no attachments)');
      } else if (testMode) {
        const folderPath = await replaceTokens(actions.save_file.path_template, { mail, caseId, clientId }, base44);
        results.push({ action: 'save_file', status: 'test_skipped', data: { path: folderPath, files: mail.attachments.length } });
        console.log('[Action] ⏭️ Skipped (test mode)');
      } else {
        const folderPath = await replaceTokens(actions.save_file.path_template, { mail, caseId, clientId }, base44);
        console.log(`[Action] Saving ${mail.attachments.length} file(s) to: ${folderPath}`);
        
        try {
          const supabaseUrl = Deno.env.get('SUPABASE_URL');
          const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
          
          const downloadResponse = await fetch(`${supabaseUrl}/functions/v1/downloadGmailAttachment`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseServiceKey}`
            },
            body: JSON.stringify({
              mail_id: mailId,
              destination_path: folderPath
            })
          });
          
          if (!downloadResponse.ok) {
            throw new Error(`downloadGmailAttachment failed: ${await downloadResponse.text()}`);
          }
          
          results.push({ action: 'save_file', status: 'success', uploaded: mail.attachments.length, path: folderPath });
          console.log(`[Action] ✅ Files saved successfully`);
        } catch (error) {
          results.push({ action: 'save_file', status: 'failed', error: error.message });
          console.error('[Action] ❌ Failed to save files:', error.message);
        }
      }
    }

    // --- Finalize ---
    const executionTime = Date.now() - startTime;
    
    console.log(`\n[AutoRule] 📊 Execution Summary:`);
    console.log(`[AutoRule] Total actions: ${results.length}`);
    console.log(`[AutoRule] Successful: ${results.filter(r => r.status === 'success').length}`);
    console.log(`[AutoRule] Pending approval: ${results.filter(r => r.status === 'pending_approval').length}`);
    console.log(`[AutoRule] Failed: ${results.filter(r => r.status === 'failed').length}`);
    console.log(`[AutoRule] Execution time: ${executionTime}ms`);

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
        metadata: {
          case_id: caseId,
          client_id: clientId,
          extracted: extractedInfo
        }
      });
      
      await updateRuleStats(base44, ruleId, true);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        results, 
        summary: { 
          total: results.length,
          successful: results.filter(r => r.status === 'success').length,
          pending_approval: results.filter(r => r.status === 'pending_approval').length,
          failed: results.filter(r => r.status === 'failed').length
        }, 
        execution_time_ms: executionTime, 
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
    console.error('\n[AutoRule] ❌ Error:', error);
    console.error('[AutoRule] Stack:', error.stack);
    
    if (rollbackManager && !testMode) {
      await rollbackManager.rollbackAll();
    }
    
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
    } catch (logError) {
      console.error('[AutoRule] Failed to log error:', logError.message);
    }

    return new Response(
      JSON.stringify({ 
        error: error.message, 
        stack: error.stack,
        mail_id: mailData?.id,
        rule_id: ruleData?.id
      }), 
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
