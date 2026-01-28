// @ts-nocheck
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ========================================
// DWO EMAIL DESIGN SYSTEM (EMBEDDED)
// ========================================

const BRAND = {
  colors: {
    primary: '#b62f12',    // DWO Red
    secondary: '#545454',  // DWO Dark Gray
    bg: '#f3f4f6',         // Light Grey Background
    card: '#ffffff',       // White Card
    text: '#000000',       // Black Text
    textLight: '#545454',  // Metadata Text
    success: '#10b981',    // Green
    link: '#b62f12'        // Link
  },
  logoUrl: 'https://dwo.co.il/wp-content/uploads/2020/04/Drori-Stav-logo-2.png', 
  appUrl: 'https://os.dwo.co.il' // URL of your application
};

const translations = {
  he: {
    title: 'בקשת אישור אוטומציה',
    rule: 'כלל אוטומציה',
    mail: 'נושא המייל',
    from: 'מאת',
    case: 'תיק',
    client: 'לקוח',
    actions: 'פעולות לביצוע',
    approveBtn: '✅ אשר אוטומציה',
    editBtn: '✏️ ערוך או דחה',
    expiry: 'הקישור תקף ל-7 ימים.',
    footer_disclaimer: 'הודעה זו נשלחה אוטומטית ממערכת OS.DWO.',
    footer_contact: 'DWO - משרד עורכי דין | www.dwo.co.il',
    actionLabels: {
      send_email: 'שליחת מייל',
      create_task: 'יצירת משימה',
      billing: 'חיוב שעות',
      calendar_event: 'אירוע ביומן',
      save_file: 'שמירת קבצים',
      create_alert: 'יצירת התרעה'
    }
  }
};

function generateEmailLayout(contentHtml, title) {
  const t = translations.he;
  return `
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body { margin: 0; padding: 0; background-color: ${BRAND.colors.bg}; font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
    .email-wrapper { padding: 20px; }
    .email-container { max-width: 600px; margin: 0 auto; background-color: ${BRAND.colors.card}; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }
    .header { background-color: ${BRAND.colors.card}; padding: 20px; text-align: center; border-bottom: 3px solid ${BRAND.colors.primary}; }
    .content { padding: 30px 25px; color: ${BRAND.colors.text}; line-height: 1.6; text-align: right; }
    .footer { background-color: #f8fafc; padding: 20px; text-align: center; font-size: 12px; color: ${BRAND.colors.textLight}; border-top: 1px solid #e2e8f0; }
    a { color: ${BRAND.colors.link}; text-decoration: none; }
    .logo { height: 50px; width: auto; max-width: 200px; object-fit: contain; }
    .info-box { background-color: #f8f9fa; border: 1px solid #e2e8f0; border-radius: 6px; padding: 15px; margin-bottom: 25px; }
    .info-row { margin-bottom: 8px; font-size: 14px; }
    .label { color: ${BRAND.colors.textLight}; font-weight: normal; }
    .value { color: ${BRAND.colors.text}; font-weight: 600; }
    .btn-primary { display: inline-block; background-color: ${BRAND.colors.primary}; color: #ffffff !important; padding: 12px 32px; border-radius: 6px; font-weight: bold; text-decoration: none; margin: 5px; }
    .btn-secondary { display: inline-block; color: ${BRAND.colors.secondary}; font-size: 14px; text-decoration: underline; margin-top: 10px; }
  </style>
</head>
<body dir="rtl">
  <div class="email-wrapper">
    <div class="email-container">
      <div class="header">
         <img src="${BRAND.logoUrl}" alt="DWO Logo" class="logo" />
      </div>
      <div class="content">
        ${contentHtml}
      </div>
      <div class="footer">
        <p style="margin: 0 0 10px 0;">${t.footer_contact}</p>
        <p style="margin: 0; opacity: 0.7;">${t.footer_disclaimer}</p>
      </div>
    </div>
  </div>
</body>
</html>`.trim();
}

function renderApprovalEmail(data) {
  const t = translations.he;
  const label = t.actionLabels[data.action_type] || data.action_type;
  
  const innerContent = `
    <h1 style="color: ${BRAND.colors.primary}; font-size: 22px; margin-top: 0; margin-bottom: 20px; text-align: center;">${t.title}</h1>
    
    <div class="info-box">
      <div class="info-row"><span class="label">${t.rule}:</span> <span class="value">${data.rule_name || '-'}</span></div>
      <div class="info-row"><span class="label">${t.mail}:</span> <span class="value">${data.mail_subject || '-'}</span></div>
      <div class="info-row"><span class="label">${t.from}:</span> <span class="value">${data.mail_from || '-'}</span></div>
      ${data.case_id ? `<div class="info-row"><span class="label">${t.case}:</span> <span class="value">${data.case_id}</span></div>` : ''}
    </div>

    <div style="margin-bottom: 25px; text-align: center;">
      <h3 style="color: ${BRAND.colors.secondary}; font-size: 18px; margin-bottom: 10px;">
        ${t.actions}: <span style="color: ${BRAND.colors.primary}">${label}</span>
      </h3>
    </div>

    <div style="text-align: center; margin-top: 30px; margin-bottom: 20px;">
      <a href="${data.approveUrl}" class="btn-primary">${t.approveBtn}</a>
      <br>
      <a href="${data.editUrl}" class="btn-secondary">${t.editBtn}</a>
    </div>

    <p style="text-align: center; font-size: 13px; color: ${BRAND.colors.textLight}; margin-top: 20px;">
      ⏳ ${t.expiry}
    </p>
  `;

  return generateEmailLayout(innerContent, t.title);
}

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
    const actionsSummaryStrings = (logData.actions_summary || []).map(action => {
      if (typeof action === 'string') return action;
      const status = action.status === 'success' ? '✅' :
                     action.status === 'failed' ? '❌' :
                     action.status === 'pending_approval' ? '⏸️' : '⏭️';
      let detail = '';
      if (action.sent_to) detail = ` (${action.sent_to.join(', ')})`;
      if (action.id) detail = ` (ID: ${action.id})`;
      if (action.amount) detail += ` ₪${action.amount}`;
      if (action.hours) detail = ` ${action.hours}h${detail}`;
      if (action.error) detail = `: ${action.error}`;
      if (action.reason) detail = ` (${action.reason})`;
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
        }
      }
      else if (recipient === 'lawyer' && context.caseId) {
        const caseData = await base44.entities.Case.get(context.caseId);
        if (caseData?.assigned_lawyer_id) {
          const lawyer = await base44.entities.User.get(caseData.assigned_lawyer_id);
          if (lawyer?.email) {
            emails.push(lawyer.email);
          }
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
  const text = source === 'body' ? (mail.body_plain || mail.body_html || '') : mail.subject;
  if (!text) return null;
  
  if (config.regex) {
    try {
      const regex = new RegExp(config.regex, 'i');
      const match = text.match(regex);
      return match ? (match[1] || match[0]) : null;
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
      if (client) result = result.replace(/{Client_Name}/g, client.name || '');
    } catch (e) {}
  }
  return result.replace(/{[^}]+}/g, '');
}

function calculateDueDate(offsetDays) {
  const date = new Date();
  date.setDate(date.getDate() + (offsetDays || 0));
  return date.toISOString().split('T')[0];
}

async function createApprovalActivity(base44, data) {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  // 1. Create the Activity in DB
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
      rule_name: data.rule_name // Add rule name for the template
    }
  });

  console.log(`[Approval] Created approval request: ${activity.id}`);
  
  // 2. Generate Designed Email
  if (data.approver_email) {
    try {
      // Construct URLs
      const approveUrl = `${BRAND.appUrl}/approve-batch/${activity.id}`;
      const editUrl = `${BRAND.appUrl}/approval-queue`;

      // Render HTML using embedded Design System
      const htmlBody = renderApprovalEmail({
        action_type: data.action_type,
        rule_name: data.rule_name || 'אוטומציה',
        mail_subject: data.mail_subject,
        mail_from: data.mail_from,
        case_id: data.case_id,
        approveUrl: approveUrl,
        editUrl: editUrl
      });

      await base44.functions.invoke('sendEmail', {
        to: data.approver_email,
        subject: `אישור נדרש: ${data.action_type} - ${data.mail_subject}`,
        body: htmlBody, // Use the designed HTML
      });
      console.log(`[Approval] ✅ Designed Email sent to ${data.approver_email}`);
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
  let userEmail = null;
  
  try {
    const base44 = createClientFromRequest(req);
    rollbackManager = new RollbackManager(base44);
    
    const rawBody = await req.json();
    const params = rawBody.body || rawBody;
    const { mailId, ruleId, testMode = false } = params;

    if (!mailId || !ruleId) throw new Error('mailId and ruleId are required');

    const mail = await base44.entities.Mail.get(mailId);
    if (!mail) throw new Error(`Mail not found: ${mailId}`);
    mailData = mail;

    if (mail.sender_email) {
      let rawEmail = mail.sender_email;
      const emailMatch = rawEmail.match(/<(.+?)>/);
      userEmail = emailMatch ? emailMatch[1] : rawEmail;
    }

    const rule = await base44.entities.AutomationRule.get(ruleId);
    if (!rule) throw new Error(`Rule not found: ${ruleId}`);
    ruleData = rule;

    // --- MAP: Extract Information ---
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

    // --- DISPATCH: Execute Actions ---
    const results = [];
    const actions = rule.action_bundle || {};

    // Helper for approval flow
    const handleApprovalOrExecute = async (actionType, config, executeFn) => {
      if (testMode) {
        results.push({ action: actionType, status: 'test_skipped', data: config });
        return;
      }
      
      if (rule.require_approval) {
        const approvalActivity = await createApprovalActivity(base44, { 
          automation_rule_id: ruleId, 
          rule_name: rule.name, // Pass rule name for email
          mail_id: mailId, 
          case_id: caseId, 
          client_id: clientId, 
          action_type: actionType, 
          action_config: config, 
          approver_email: rule.approver_email, 
          mail_subject: mail.subject, 
          mail_from: mail.sender_email 
        });
        rollbackManager.register({ type: 'approval', id: approvalActivity.id });
        results.push({ action: actionType, status: 'pending_approval', approval_id: approvalActivity.id });
      } else {
        await executeFn();
      }
    };

    // Action 1: Send Email
    if (actions.send_email?.enabled) {
      const to = await resolveRecipients(actions.send_email.recipients, { caseId, clientId }, base44);
      if (to.length > 0) {
        const emailConfig = {
          to: to.join(','),
          subject: await replaceTokens(actions.send_email.subject_template, { mail, caseId, clientId }, base44),
          body: await replaceTokens(actions.send_email.body_template, { mail, caseId, clientId }, base44)
        };
        
        await handleApprovalOrExecute('send_email', emailConfig, async () => {
          const emailResult = await base44.functions.invoke('sendEmail', emailConfig);
          if (emailResult.error) throw new Error(`sendEmail failed: ${emailResult.error}`);
          results.push({ action: 'send_email', status: 'success', sent_to: to });
        });
      } else {
        results.push({ action: 'send_email', status: 'skipped', reason: 'no_recipients' });
      }
    }

    // Action 2: Create Task
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
      
      await handleApprovalOrExecute('create_task', taskData, async () => {
        const task = await base44.entities.Task.create(taskData);
        rollbackManager.register({ type: 'create_task', id: task.id });
        results.push({ action: 'create_task', status: 'success', id: task.id });
      });
    }

    // Action 3: Billing
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
        user_email: userEmail,
        task_id: null
      };
      
      await handleApprovalOrExecute('billing', billingData, async () => {
        const timeEntry = await base44.entities.TimeEntry.create(billingData);
        try {
          await base44.functions.invoke('syncBillingToSheets', { timeEntryId: timeEntry.id });
        } catch (e) {}

        rollbackManager.register({ type: 'billing', id: timeEntry.id });
        results.push({ action: 'billing', status: 'success', id: timeEntry.id, hours: billingData.hours, amount: billingData.hours * rate });
      });
    }

    // Action 4: Save File
    if (actions.save_file?.enabled) {
      if (!mail.attachments || mail.attachments.length === 0) {
        results.push({ action: 'save_file', status: 'skipped', reason: 'no_attachments' });
      } else {
        const folderPath = await replaceTokens(actions.save_file.path_template, { mail, caseId, clientId }, base44);
        
        // Save File doesn't usually require approval in the same way, or it's implicitly approved
        // Assuming testMode check is enough for now based on original code
        if (testMode) {
          results.push({ action: 'save_file', status: 'test_skipped', data: { path: folderPath, files: mail.attachments.length } });
        } else {
           try {
              const supabaseUrl = Deno.env.get('SUPABASE_URL');
              const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
              const downloadResponse = await fetch(`${supabaseUrl}/functions/v1/downloadGmailAttachment`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseServiceKey}` },
                body: JSON.stringify({ mail_id: mailId, destination_path: folderPath })
              });
              if (!downloadResponse.ok) throw new Error(`downloadGmailAttachment failed`);
              results.push({ action: 'save_file', status: 'success', uploaded: mail.attachments.length, path: folderPath });
           } catch (error) {
              results.push({ action: 'save_file', status: 'failed', error: error.message });
           }
        }
      }
    }

    // Action 5: Calendar Event
    if (actions.calendar_event?.enabled) {
      const eventData = {
        title: await replaceTokens(actions.calendar_event.title_template || 'תזכורת', { mail, caseId, clientId }, base44),
        description: await replaceTokens(actions.calendar_event.description_template || '', { mail, caseId, clientId }, base44),
        start_date: calculateDueDate(actions.calendar_event.timing_offset || 7),
        duration_minutes: actions.calendar_event.duration_minutes || 60,
        case_id: caseId,
        client_id: clientId,
        reminder_minutes: actions.calendar_event.reminder_minutes || 1440,
        create_meet_link: actions.calendar_event.create_meet_link || false,
        attendees: actions.calendar_event.attendees || []
      };
      
      await handleApprovalOrExecute('calendar_event', eventData, async () => {
         const calendarResult = await base44.functions.invoke('createCalendarEvent', eventData);
         if (calendarResult?.error) {
            results.push({ action: 'calendar_event', status: 'failed', error: calendarResult.error });
         } else {
            results.push({ action: 'calendar_event', status: 'success', google_event_id: calendarResult?.google_event_id });
            rollbackManager.register({ type: 'calendar_event', id: calendarResult?.google_event_id });
         }
      });
    }

    // --- Finalize ---
    const executionTime = Date.now() - startTime;
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

    return new Response(JSON.stringify({ 
      success: true, 
      results, 
      execution_time_ms: executionTime 
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('[AutoRule] ❌ Error:', error);
    if (rollbackManager && !testMode && params && params.ruleId) {
        // Attempt rollback only if we have context
        try { await rollbackManager.rollbackAll(); } catch (e) {}
    }
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});