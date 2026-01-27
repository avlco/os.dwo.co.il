// @ts-nocheck
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { signApprovalToken, createTokenPayload, generateNonce } from './utils/approvalToken.js';
import { renderApprovalEmail } from './utils/approvalEmailTemplates.js';

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
    // ✅ FIX: Convert action objects to strings for Base44 schema
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
    } catch (e) {
      console.error('[Tokens] Failed to load case data:', e.message);
    }
  }
  
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
  
  result = result.replace(/{[^}]+}/g, '');
  
  return result;
}

function calculateDueDate(offsetDays) {
  const date = new Date();
  date.setDate(date.getDate() + (offsetDays || 0));
  return date.toISOString().split('T')[0];
}

/**
 * Build actions array from action_bundle for ApprovalBatch
 */
async function buildActionsArray(actionBundle, context) {
  const actions = [];
  const { mail, caseId, clientId, mailId, base44, userEmail } = context;

  // send_email
  if (actionBundle.send_email?.enabled) {
    const recipients = await resolveRecipients(
      actionBundle.send_email.recipients,
      { caseId, clientId },
      base44
    );
    
    if (recipients.length > 0) {
      actions.push({
        action_type: 'send_email',
        enabled: true,
        config: {
          to: recipients.join(','),
          subject: await replaceTokens(actionBundle.send_email.subject_template, { mail, caseId, clientId }, base44),
          body: await replaceTokens(actionBundle.send_email.body_template, { mail, caseId, clientId }, base44)
        }
      });
    }
  }

  // create_task
  if (actionBundle.create_task?.enabled) {
    actions.push({
      action_type: 'create_task',
      enabled: true,
      config: {
        title: await replaceTokens(actionBundle.create_task.title, { mail, caseId, clientId }, base44),
        description: await replaceTokens(actionBundle.create_task.description, { mail, caseId, clientId }, base44),
        due_date: calculateDueDate(actionBundle.create_task.due_offset_days),
        priority: 'medium'
      }
    });
  }

  // billing
  if (actionBundle.billing?.enabled) {
    let rate = actionBundle.billing.hourly_rate || 800;
    
    if (caseId) {
      try {
        const caseData = await base44.entities.Case.get(caseId);
        if (caseData?.hourly_rate) rate = caseData.hourly_rate;
      } catch (e) { /* ignore */ }
    }
    
    actions.push({
      action_type: 'billing',
      enabled: true,
      config: {
        hours: actionBundle.billing.hours || 0.25,
        rate: rate,
        description: actionBundle.billing.description_template 
          ? await replaceTokens(actionBundle.billing.description_template, { mail, caseId, clientId }, base44)
          : mail.subject
      }
    });
  }

  // save_file (Dropbox)
  if (actionBundle.save_file?.enabled && mail.attachments && mail.attachments.length > 0) {
    actions.push({
      action_type: 'save_file',
      enabled: true,
      config: {
        path: await replaceTokens(actionBundle.save_file.path_template, { mail, caseId, clientId }, base44),
        mail_id: mailId,
        attachment_count: mail.attachments.length
      }
    });
  }

  // calendar_event
  if (actionBundle.calendar_event?.enabled) {
    actions.push({
      action_type: 'calendar_event',
      enabled: true,
      config: {
        title: await replaceTokens(actionBundle.calendar_event.title_template || 'תזכורת אוטומטית', { mail, caseId, clientId }, base44),
        description: await replaceTokens(actionBundle.calendar_event.description_template || '', { mail, caseId, clientId }, base44),
        start_date: calculateDueDate(actionBundle.calendar_event.timing_offset || 7),
        duration_minutes: actionBundle.calendar_event.duration_minutes || 60,
        create_meet_link: actionBundle.calendar_event.create_meet_link || false,
        attendees: actionBundle.calendar_event.attendees || []
      }
    });
  }

  // create_alert
  if (actionBundle.create_alert?.enabled) {
    actions.push({
      action_type: 'create_alert',
      enabled: true,
      config: {
        alert_type: actionBundle.create_alert.alert_type || 'reminder',
        message: await replaceTokens(actionBundle.create_alert.message_template, { mail, caseId, clientId }, base44),
        timing_offset: actionBundle.create_alert.timing_offset,
        timing_unit: actionBundle.create_alert.timing_unit
      }
    });
  }

  return actions;
}

/**
 * Create an ApprovalBatch for the entire action bundle
 * This replaces the old per-action Activity-based approval system
 */
async function createApprovalBatch(base44, data) {
  const { rule, mail, caseId, clientId, actions, extractedInfo, userEmail } = data;
  
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 60 minutes for quick approval
  
  // Build actions array with idempotency keys
  const actionsWithKeys = actions.map((action, index) => ({
    ...action,
    idempotency_key: `${Date.now()}_${index}_${action.action_type}`
  }));

  // Create the batch
  const batch = await base44.asServiceRole.entities.ApprovalBatch.create({
    status: 'pending',
    automation_rule_id: rule.id,
    automation_rule_name: rule.name,
    mail_id: mail.id,
    mail_subject: mail.subject,
    mail_from: mail.sender_email,
    case_id: caseId || null,
    client_id: clientId || null,
    approver_email: rule.approver_email,
    expires_at: expiresAt.toISOString(),
    catch_snapshot: rule.catch_config || {},
    map_snapshot: rule.map_config || [],
    extracted_info: extractedInfo || {},
    actions_original: actionsWithKeys,
    actions_current: JSON.parse(JSON.stringify(actionsWithKeys)) // deep copy
  });

  console.log(`[ApprovalBatch] ✅ Created batch: ${batch.id} with ${actionsWithKeys.length} actions`);

  // Generate signed token for quick approval
  const secret = Deno.env.get('APPROVAL_HMAC_SECRET');
  if (!secret) {
    console.error('[ApprovalBatch] ⚠️ APPROVAL_HMAC_SECRET not set, cannot generate quick approval link');
  }

  let approveUrl = null;
  let editUrl = null;
  const appUrl = Deno.env.get('APP_BASE_URL') || 'https://app.base44.com';

  if (secret) {
    const tokenPayload = createTokenPayload({
      batchId: batch.id,
      approverEmail: rule.approver_email,
      expiresInMinutes: 60
    });
    
    const token = await signApprovalToken(tokenPayload, secret);
    approveUrl = `${appUrl}/ApproveBatch?token=${encodeURIComponent(token)}`;
  }
  
  editUrl = `${appUrl}/ApprovalBatchEdit?batchId=${batch.id}`;

  // Detect language for email
  let language = 'he';
  if (clientId) {
    try {
      const client = await base44.entities.Client.get(clientId);
      if (client?.communication_language === 'en') {
        language = 'en';
      }
    } catch (e) { /* ignore */ }
  }

  // Get case and client names for email
  let caseName = null;
  let clientName = null;
  
  if (caseId) {
    try {
      const caseData = await base44.entities.Case.get(caseId);
      caseName = caseData?.case_number || caseData?.title;
    } catch (e) { /* ignore */ }
  }
  
  if (clientId) {
    try {
      const client = await base44.entities.Client.get(clientId);
      clientName = client?.name;
    } catch (e) { /* ignore */ }
  }

  // Send approval email
  if (rule.approver_email && approveUrl) {
    try {
      const emailHtml = renderApprovalEmail({
        batch: {
          id: batch.id,
          automation_rule_name: rule.name,
          mail_subject: mail.subject,
          mail_from: mail.sender_email,
          actions_current: actionsWithKeys
        },
        approveUrl,
        editUrl,
        language,
        caseName,
        clientName
      });

      const subject = language === 'he' 
        ? `אישור נדרש: ${rule.name}` 
        : `Approval Required: ${rule.name}`;

      await base44.functions.invoke('sendEmail', {
        to: rule.approver_email,
        subject,
        body: emailHtml
      });

      console.log(`[ApprovalBatch] ✅ Approval email sent to ${rule.approver_email}`);
    } catch (emailError) {
      console.error('[ApprovalBatch] ❌ Failed to send approval email:', emailError.message);
    }
  }

  return batch;
}

// Legacy createApprovalActivity function has been removed
// All approvals now go through the ApprovalBatch system

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

    const mail = await base44.entities.Mail.get(mailId);
    if (!mail) {
      throw new Error(`Mail not found: ${mailId}`);
    }
    mailData = mail;
    console.log(`[AutoRule] ✅ Mail found: "${mail.subject}"`);

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

    // --- APPROVAL BATCH CHECK ---
    // If rule requires approval, return actions to be aggregated by processIncomingMail
    if (rule.require_approval && !testMode) {
      console.log('[AutoRule] 📋 Rule requires approval - returning actions for aggregation');

      // Build actions array from action_bundle
      const actionsToApprove = await buildActionsArray(rule.action_bundle || {}, {
        mail, caseId, clientId, mailId, base44, userEmail
      });

      if (actionsToApprove.length > 0) {
        // Enrich actions with metadata needed for aggregation
        const enrichedActions = actionsToApprove.map((action, index) => ({
          ...action,
          rule_id: ruleId,
          rule_name: rule.name,
          approver_email: rule.approver_email,
          idempotency_key: `${Date.now()}_${index}_${action.action_type}`,
          catch_snapshot: rule.catch_config || {},
          map_snapshot: rule.map_config || []
        }));

        console.log(`[AutoRule] ✅ Returning ${enrichedActions.length} action(s) for approval aggregation`);

        return new Response(
          JSON.stringify({
            success: true,
            status: 'actions_ready_for_approval',
            actions: enrichedActions,
            actions_count: enrichedActions.length,
            rule_id: ruleId,
            rule_name: rule.name
          }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200
          }
        );
      } else {
        console.log('[AutoRule] ⏭️ No actions to approve');
      }
    }

    // --- DISPATCH: Execute Actions (ONLY when no approval required or in test mode) ---
    // If approval is required and we're not in test mode, we should have already returned above
    // This section only runs for immediate execution scenarios
    if (rule.require_approval && !testMode) {
      // This should never happen - we should have returned after creating ApprovalBatch
      console.error('[AutoRule] ❌ Logic error: reached DISPATCH phase with require_approval=true');
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Internal logic error: DISPATCH phase reached with approval required'
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500
        }
      );
    }

    const results = [];
    const actions = rule.action_bundle || {};

    console.log('[AutoRule] 🎬 Starting DISPATCH phase (immediate execution - no approval required)...');

    // ✅ Action 1: Send Email
    if (actions.send_email?.enabled) {
      console.log('[Action] 📧 Processing send_email...');
      
      const to = await resolveRecipients(
        actions.send_email.recipients, 
        { caseId, clientId }, 
        base44
      );
      
      if (to.length > 0) {
        // --- לוגיקת בחירת שפה ---
        let subjectTemplate = actions.send_email.subject_template;
        let bodyTemplate = actions.send_email.body_template;

        // אם מוגדרת גרסה אנגלית, נבדוק את הלקוח
        if (clientId && actions.send_email.enable_english) {
          try {
            const client = await base44.entities.Client.get(clientId);
            // אם שפת הלקוח היא אנגלית ('en')
            if (client && client.communication_language === 'en') {
               console.log('[Action] 🇺🇸 English client detected. Switching templates.');
               
               // השתמש באנגלית אם השדות לא ריקים
               if (actions.send_email.subject_template_en) {
                 subjectTemplate = actions.send_email.subject_template_en;
               }
               if (actions.send_email.body_template_en) {
                 bodyTemplate = actions.send_email.body_template_en;
               }
            }
          } catch (err) {
            console.error('[Action] Error checking client language:', err);
          }
        }
        // -------------------------

        const emailConfig = {
          to: to.join(','),
          subject: await replaceTokens(subjectTemplate, { mail, caseId, clientId }, base44),
          body: await replaceTokens(bodyTemplate, { mail, caseId, clientId }, base44)
        };
        
        console.log(`[Action] Email config:`, emailConfig);
        
        if (testMode) {
          results.push({ action: 'send_email', status: 'test_skipped', data: emailConfig });
          console.log('[Action] ⏭️ Skipped (test mode)');
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
      
      console.log(`[Action] Billing data:`, billingData);
      
      if (testMode) {
        results.push({ action: 'billing', status: 'test_skipped', data: billingData });
        console.log('[Action] ⏭️ Skipped (test mode)');
      } else {
        const timeEntry = await base44.entities.TimeEntry.create(billingData);

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

    // ✅ Action 5: Calendar Event
    console.log(`[Action] Checking Calendar... Enabled? ${actions.calendar_event?.enabled}`);

    if (actions.calendar_event?.enabled) {
      console.log('[Action] 📅 Processing calendar_event...');
      
      const eventData = {
  title: await replaceTokens(actions.calendar_event.title_template || 'תזכורת אוטומטית', { mail, caseId, clientId }, base44),
  description: await replaceTokens(actions.calendar_event.description_template || '', { mail, caseId, clientId }, base44),
  start_date: calculateDueDate(actions.calendar_event.timing_offset || 7),
  duration_minutes: actions.calendar_event.duration_minutes || 60,
  case_id: caseId,
  client_id: clientId,
  reminder_minutes: actions.calendar_event.reminder_minutes || 1440,
  create_meet_link: actions.calendar_event.create_meet_link || false,
  attendees: actions.calendar_event.attendees || []
};
      
      console.log('[Action] Event data:', eventData);
      
      if (testMode) {
        results.push({ action: 'calendar_event', status: 'test_skipped', data: eventData });
        console.log('[Action] ⏭️ Skipped (test mode)');
      } else {
        try {
          const calendarResult = await base44.functions.invoke('createCalendarEvent', eventData);
          
          if (calendarResult?.error) {
            console.error('[Action] Calendar failed:', calendarResult.error);
            results.push({ action: 'calendar_event', status: 'failed', error: calendarResult.error });
          } else {
            console.log('[Action] ✅ Calendar event created:', calendarResult?.google_event_id);
            results.push({ 
              action: 'calendar_event', 
              status: 'success', 
              google_event_id: calendarResult?.google_event_id,
              link: calendarResult?.htmlLink 
            });

            // Create Deadline in system
            if (caseId) {
              try {
                const deadlineData = {
                  case_id: caseId,
                  deadline_type: 'custom',
                  description: eventData.title,
                  due_date: eventData.start_date,
                  status: 'pending',
                  assigned_to_email: userEmail,
                  is_critical: false
                };
                const deadline = await base44.entities.Deadline.create(deadlineData);
                console.log('[Action] ✅ Deadline created:', deadline.id);
              } catch (deadlineError) {
                console.error('[Action] ⚠️ Deadline creation failed:', deadlineError.message);
              }
            }
            
            rollbackManager.register({ 
              type: 'calendar_event', 
              id: calendarResult?.google_event_id,
              metadata: calendarResult 
            });
          }
        } catch (error) {
          console.error('[Action] Calendar error:', error);
          results.push({ action: 'calendar_event', status: 'failed', error: error.message });
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