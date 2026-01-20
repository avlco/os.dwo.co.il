// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

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
    if (this.actions.length === 0) {
      console.log('[Rollback] No actions to rollback');
      return;
    }
    
    console.log(`[Rollback] 🔄 Rolling back ${this.actions.length} action(s)`);
    
    for (let i = this.actions.length - 1; i >= 0; i--) {
      const action = this.actions[i];
      
      try {
        switch (action.type) {
          case 'create_task':
            if (action.id) {
              await this.supabase.from('Task').delete().eq('id', action.id);
              console.log(`[Rollback] ✅ Deleted Task ${action.id}`);
            }
            break;
          
          case 'billing':
            if (action.id) {
              await this.supabase.from('TimeEntry').delete().eq('id', action.id);
              console.log(`[Rollback] ✅ Deleted TimeEntry ${action.id}`);
            }
            break;
          
          case 'create_alert':
            if (action.id) {
              await this.supabase.from('Activity').delete().eq('id', action.id);
              console.log(`[Rollback] ✅ Deleted Activity ${action.id}`);
            }
            break;
          
          case 'approval':
            if (action.id) {
              await this.supabase.from('Activity').delete().eq('id', action.id);
              console.log(`[Rollback] ✅ Deleted Approval ${action.id}`);
            }
            break;
          
          default:
            console.log(`[Rollback] ⚠️ Cannot rollback: ${action.type}`);
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
    console.log(`[Logger] ✅ Logged execution: ${logData.execution_status}`);
  } catch (error) {
    console.error('[Logger] ❌ Failed to log execution:', error.message);
  }
}

async function updateRuleStats(supabase, ruleId, success) {
  try {
    const { data: rule } = await supabase
      .from('AutomationRule')
      .select('metadata')
      .eq('id', ruleId)
      .single();
    
    if (!rule) return;
    
    const metadata = rule.metadata || {};
    const stats = metadata.stats || {
      total_executions: 0,
      successful_executions: 0,
      failed_executions: 0,
      success_rate: 0,
      last_execution: null,
    };
    
    stats.total_executions += 1;
    if (success) {
      stats.successful_executions += 1;
    } else {
      stats.failed_executions += 1;
    }
    stats.success_rate = (stats.successful_executions / stats.total_executions) * 100;
    stats.last_execution = new Date().toISOString();
    
    await supabase
      .from('AutomationRule')
      .update({
        metadata: {
          ...metadata,
          stats,
        },
      })
      .eq('id', ruleId);
    
    console.log(`[Logger] ✅ Updated stats: ${stats.success_rate.toFixed(1)}% success`);
  } catch (error) {
    console.error('[Logger] ❌ Failed to update stats:', error.message);
  }
}

// ========================================
// RECIPIENT RESOLUTION
// ========================================

async function resolveRecipients(recipients, context, supabase) {
  const emails = [];
  
  console.log('[AutoRule] 📬 Resolving recipients:', recipients);
  
  if (!Array.isArray(recipients)) {
      console.warn('[AutoRule] Recipients is not an array');
      return [];
  }

  for (const recipient of recipients) {
    try {
      if (recipient === 'client') {
        if (context.clientId) {
          const { data: client } = await supabase
            .from('Client')
            .select('email, name')
            .eq('id', context.clientId)
            .single();
          
          if (client?.email) {
            emails.push(client.email);
            console.log(`[AutoRule] ✅ Client email: ${client.email}`);
          }
        }
      } else if (recipient === 'lawyer') {
        if (context.caseId) {
          const { data: caseData } = await supabase
            .from('Case')
            .select('assigned_lawyer_id')
            .eq('id', context.caseId)
            .single();
          
          if (caseData?.assigned_lawyer_id) {
            const { data: lawyer } = await supabase
              .from('User')
              .select('email, full_name')
              .eq('id', caseData.assigned_lawyer_id)
              .single();
            
            if (lawyer?.email) {
              emails.push(lawyer.email);
              console.log(`[AutoRule] ✅ Lawyer email: ${lawyer.email}`);
            }
          }
        }
      } else if (recipient && recipient.includes('@')) {
        emails.push(recipient);
        console.log(`[AutoRule] ✅ Direct email: ${recipient}`);
      }
    } catch (error) {
      console.error(`[AutoRule] ❌ Failed to resolve recipient "${recipient}":`, error.message);
    }
  }
  
  const uniqueEmails = [...new Set(emails)];
  console.log(`[AutoRule] 📧 Resolved ${uniqueEmails.length} email(s):`, uniqueEmails);
  
  return uniqueEmails;
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
    } catch (e) {
        console.error("Regex error:", e);
        return null;
    }
  }
  
  if (config.anchor_text) {
    const index = text.indexOf(config.anchor_text);
    if (index === -1) return null;
    
    const afterAnchor = text.substring(index + config.anchor_text.length).trim();
    // Split by whitespace or comma/semicolon to get the first token
    const words = afterAnchor.split(/[\s,;]+/);
    return words[0] || null;
  }
  
  return null;
}

async function replaceTokens(template, context, supabase) {
  if (!template) return '';
  
  let result = template;
  
  result = result.replace(/{Mail_Subject}/g, context.mail?.subject || '');
  result = result.replace(/{Mail_From}/g, context.mail?.sender_email || '');
  result = result.replace(/{Mail_Body}/g, context.mail?.body_plain || '');
  result = result.replace(/{Mail_Date}/g, context.mail?.received_at ? new Date(context.mail.received_at).toLocaleDateString('he-IL') : '');
  
  if (context.caseId) {
    const { data: caseData } = await supabase
      .from('Case')
      .select('case_number, title, case_type, application_number')
      .eq('id', context.caseId)
      .maybeSingle(); // FIX: Prevent 400 error
    
    if (caseData) {
        result = result.replace(/{Case_No}/g, caseData.case_number || '');
        result = result.replace(/{Case_Title}/g, caseData.title || '');
        result = result.replace(/{Case_Type}/g, caseData.case_type || '');
        result = result.replace(/{Official_No}/g, caseData.application_number || '');
    } else {
        // Clear placeholders if case not found but ID exists (edge case)
        result = result.replace(/{Case_No}|{Case_Title}|{Case_Type}|{Official_No}/g, '');
    }
  }
  
  if (context.clientId) {
    const { data: clientData } = await supabase
      .from('Client')
      .select('name, email')
      .eq('id', context.clientId)
      .maybeSingle();
    
    if (clientData) {
        result = result.replace(/{Client_Name}/g, clientData.name || '');
        result = result.replace(/{Client_Email}/g, clientData.email || '');
    } else {
        result = result.replace(/{Client_Name}|{Client_Email}/g, '');
    }
  }
  
  // Clean up any remaining tokens
  result = result.replace(/{[^}]+}/g, '');
  
  return result;
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
  // Default to 10:00 AM
  date.setHours(10, 0, 0, 0);
  
  return date;
}

async function createApprovalActivity(supabase, data) {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  const { data: activity, error } = await supabase
    .from('Activity')
    .insert({
      activity_type: 'approval_request',
      case_id: data.case_id,
      status: 'pending',
      description: `בקשת אישור: ${data.action_type}`,
      metadata: {
        automation_rule_id: data.automation_rule_id,
        mail_id: data.mail_id,
        client_id: data.client_id,
        action_type: data.action_type,
        action_config: data.action_config,
        approver_email: data.approver_email,
        requested_by: data.requested_by,
        mail_subject: data.mail_subject,
        mail_from: data.mail_from,
        expires_at: expiresAt.toISOString(),
      },
    })
    .select()
    .single();

  if (error) throw error;
  
  // Try sending email notification to approver
  try {
      if (data.approver_email) {
          await supabase.functions.invoke('sendEmail', {
            body: {
              to: data.approver_email,
              subject: `נדרש אישור: ${data.action_type}`,
              body: `
                <div dir="rtl" style="font-family: Arial, sans-serif;">
                  <h2>בקשת אישור חדשה במערכת IPMS</h2>
                  <p><strong>סוג פעולה:</strong> ${data.action_type}</p>
                  <p><strong>מייל מקורי:</strong> ${data.mail_subject}</p>
                  <p><strong>שולח:</strong> ${data.mail_from}</p>
                  <p>אנא היכנס למערכת כדי לאשר או לדחות את הפעולה.</p>
                </div>
              `,
            },
          });
      }
  } catch (e) {
      console.warn("Failed to send approval email notification:", e);
      // Don't fail the transaction just because email failed
  }

  return activity;
}

// ========================================
// MAIN HANDLER
// ========================================
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();
  let rollbackManager = null;
  let mailData = null;
  let ruleData = null;

  try {
    const authHeader = req.headers.get('Authorization') || '';
    
    // Create client with environment variables
    const supabaseClient = createClient(
      supabaseUrl,
      supabaseServiceKey,
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    rollbackManager = new RollbackManager(supabaseClient);

    const { mailId, ruleId, testMode = false } = await req.json();

    if (!mailId || !ruleId) {
      throw new Error('mailId and ruleId are required');
    }

    console.log(`[AutoRule] 🚀 Starting: Mail ${mailId} + Rule ${ruleId}${testMode ? ' [TEST]' : ''}`);

    // Fetch Mail
    const { data: mail, error: mailError } = await supabaseClient
      .from('Mail')
      .select('*')
      .eq('id', mailId)
      .single();

    if (mailError || !mail) {
      throw new Error(`Mail not found: ${mailError?.message || 'Unknown'}`);
    }
    mailData = mail;

    // Fetch Rule
    const { data: rule, error: ruleError } = await supabaseClient
      .from('AutomationRule')
      .select('*')
      .eq('id', ruleId)
      .single();

    if (ruleError || !rule) {
      throw new Error(`Rule not found: ${ruleError?.message || 'Unknown'}`);
    }
    ruleData = rule;

    // --- MAP PHASE (Extraction & Linking) ---
    let caseId = null;
    let clientId = null;
    let extractedInfo = {};

    if (rule.map_config && Array.isArray(rule.map_config)) {
      for (const mapRule of rule.map_config) {
        const extracted = extractFromMail(mail, mapRule);
        
        if (extracted) {
          console.log(`[AutoRule] ✅ Extracted: "${extracted}" for target: ${mapRule.target_field}`);
          extractedInfo[mapRule.target_field] = extracted;
          
          // Case Number Link
          if (mapRule.target_field === 'case_no') {
            const { data: caseData } = await supabaseClient
              .from('Case')
              .select('id, client_id, case_number')
              .eq('case_number', extracted)
              .maybeSingle();
            
            if (caseData) {
              caseId = caseData.id;
              clientId = caseData.client_id;
              console.log(`[AutoRule] 🎯 Matched Case by Number: ${caseData.case_number}`);
            }
          }
          
          // Official/Application Number Link
          if (mapRule.target_field === 'official_no' && !caseId) {
            // FIX: Search in application_number column
            const { data: caseData } = await supabaseClient
              .from('Case')
              .select('id, client_id, application_number')
              .eq('application_number', extracted)
              .maybeSingle();
            
            if (caseData) {
              caseId = caseData.id;
              clientId = caseData.client_id;
              console.log(`[AutoRule] 🎯 Matched Case by App Number: ${extracted}`);
            }
          }

          // Client Reference Link
          if (mapRule.target_field === 'client_ref' && !caseId) {
            const { data: caseData } = await supabaseClient
               .from('Case')
               .select('id, client_id')
               .eq('client_reference', extracted)
               .maybeSingle();

            if (caseData) {
               caseId = caseData.id;
               clientId = caseData.client_id;
               console.log(`[AutoRule] 🎯 Matched Case by Client Ref: ${extracted}`);
            }
          }
        }
      }
    }

    const { data: userData } = await supabaseClient.auth.getUser();
    const user = userData?.user;

    const results = [];
    const actions = rule.action_bundle || {};

    // ========================================
    // ACTION DISPATCH
    // ========================================

    // 1️⃣ SEND EMAIL
    if (actions.send_email?.enabled) {
      console.log('[AutoRule] 📧 Processing: send_email');
      
      const recipientEmails = await resolveRecipients(
        actions.send_email.recipients || [], 
        { caseId, clientId }, 
        supabaseClient
      );
      
      const emailConfig = {
        to: recipientEmails.join(', '),
        subject: await replaceTokens(actions.send_email.subject_template || '', { mail, caseId, clientId }, supabaseClient),
        body: await replaceTokens(actions.send_email.body_template || '', { mail, caseId, clientId }, supabaseClient),
      };

      if (recipientEmails.length === 0) {
          results.push({ action: 'send_email', status: 'skipped', reason: 'no_recipients' });
      } else if (testMode) {
          results.push({ action: 'send_email', status: 'test_skipped', data: emailConfig });
      } else {
        if (rule.require_approval) {
          const activity = await createApprovalActivity(supabaseClient, {
            automation_rule_id: ruleId,
            mail_id: mailId,
            case_id: caseId,
            client_id: clientId,
            action_type: 'send_email',
            action_config: emailConfig,
            approver_email: rule.approver_email,
            requested_by: user?.email || 'system',
            mail_subject: mail.subject,
            mail_from: mail.sender_email,
          });
          rollbackManager.register({ type: 'approval', id: activity.id });
          results.push({ action: 'send_email', status: 'pending_approval', activityId: activity.id });
        } else {
          try {
            const { error } = await supabaseClient.functions.invoke('sendEmail', { body: emailConfig });
            if (error) throw new Error(`send_email failed: ${error.message}`);
            results.push({ action: 'send_email', status: 'success', to: emailConfig.to });
          } catch (emailError) {
            results.push({ action: 'send_email', status: 'failed', error: emailError.message });
          }
        }
      }
    }

    // 2️⃣ CREATE TASK
    if (actions.create_task?.enabled) {
      console.log('[AutoRule] 📝 Processing: create_task');
      
      const taskConfig = {
        title: await replaceTokens(actions.create_task.title, { mail, caseId, clientId }, supabaseClient),
        description: await replaceTokens(actions.create_task.description, { mail, caseId, clientId }, supabaseClient),
        case_id: caseId,
        client_id: clientId,
        due_date: calculateDueDate(actions.create_task.due_offset_days),
        assigned_to: actions.create_task.assigned_to,
        priority: actions.create_task.priority || 'medium',
        status: 'pending',
      };

      if (testMode) {
        results.push({ action: 'create_task', status: 'test_skipped', data: taskConfig });
      } else {
        if (rule.require_approval) {
          const activity = await createApprovalActivity(supabaseClient, {
            automation_rule_id: ruleId,
            mail_id: mailId,
            case_id: caseId,
            client_id: clientId,
            action_type: 'create_task',
            action_config: taskConfig,
            approver_email: rule.approver_email,
            requested_by: user?.email || 'system',
            mail_subject: mail.subject,
            mail_from: mail.sender_email,
          });
          rollbackManager.register({ type: 'approval', id: activity.id });
          results.push({ action: 'create_task', status: 'pending_approval', activityId: activity.id });
        } else {
          const { data: task, error } = await supabaseClient.from('Task').insert(taskConfig).select().single();
          if (error) throw new Error(`create_task failed: ${error.message}`);
          rollbackManager.register({ type: 'create_task', id: task.id });
          results.push({ action: 'create_task', status: 'success', task_id: task.id });
        }
      }
    }

    // 3️⃣ BILLING
    if (actions.billing?.enabled) {
      console.log('[AutoRule] 💰 Processing: billing');
      
      let hourlyRate = actions.billing.hourly_rate || 800;
      if (caseId) {
        const { data: caseData } = await supabaseClient.from('Case').select('hourly_rate').eq('id', caseId).maybeSingle();
        if (caseData?.hourly_rate) hourlyRate = caseData.hourly_rate;
      }

      const totalAmount = (actions.billing.hours || 0) * hourlyRate;
      const billingConfig = {
          case_id: caseId,
          description: await replaceTokens(actions.billing.description_template, { mail, caseId, clientId }, supabaseClient),
          hours: actions.billing.hours,
          hourly_rate: hourlyRate,
          total_amount: totalAmount,
          date: new Date().toISOString().split('T')[0],
          billable: true,
      };

      if (testMode) {
        results.push({ action: 'billing', status: 'test_skipped', data: billingConfig });
      } else {
        if (rule.require_approval) {
          const activity = await createApprovalActivity(supabaseClient, {
            automation_rule_id: ruleId,
            mail_id: mailId,
            case_id: caseId,
            client_id: clientId,
            action_type: 'billing',
            action_config: billingConfig,
            approver_email: rule.approver_email,
            requested_by: user?.email || 'system',
            mail_subject: mail.subject,
            mail_from: mail.sender_email,
          });
          rollbackManager.register({ type: 'approval', id: activity.id });
          results.push({ action: 'billing', status: 'pending_approval', activityId: activity.id });
        } else {
          const { data: timeEntry, error } = await supabaseClient.from('TimeEntry').insert(billingConfig).select().single();
          if (error) throw new Error(`billing failed: ${error.message}`);
          rollbackManager.register({ type: 'billing', id: timeEntry.id });
          results.push({ action: 'billing', status: 'success', totalAmount });
        }
      }
    }

    // 4️⃣ SAVE FILE (Dropbox)
    if (actions.save_file?.enabled) {
      console.log('[AutoRule] 🗂️ Processing: save_file');
      
      if (!mail.attachments || mail.attachments.length === 0) {
        results.push({ action: 'save_file', status: 'skipped', reason: 'no_attachments' });
      } else if (testMode) {
        const folderPath = await replaceTokens(actions.save_file.path_template, { mail, caseId, clientId }, supabaseClient);
        results.push({ action: 'save_file', status: 'test_skipped', data: { path: folderPath, fileCount: mail.attachments.length } });
      } else {
        const folderPath = await replaceTokens(actions.save_file.path_template, { mail, caseId, clientId }, supabaseClient);
        
        try {
          const dropboxResult = await fetch(`${supabaseUrl}/functions/v1/downloadGmailAttachment`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseServiceKey}`
            },
            body: JSON.stringify({
              mail_id: mailId,
              user_id: userId,
              destination_path: folderPath
            })
          });
          
          if (!dropboxResult.ok) throw new Error(await dropboxResult.text());
          results.push({ action: 'save_file', status: 'success', uploaded: mail.attachments.length });
        } catch (error) {
          results.push({ action: 'save_file', status: 'failed', error: error.message });
        }
      }
    }

    // 5️⃣ CALENDAR EVENT
    if (actions.calendar_event?.enabled) {
      console.log('[AutoRule] 📅 Processing: calendar_event');
      const eventTitle = await replaceTokens(actions.calendar_event.title_template, { mail, caseId, clientId }, supabaseClient);
      const eventDate = calculateEventDate(mail.received_at, actions.calendar_event);

      if (testMode) {
        results.push({ action: 'calendar_event', status: 'test_skipped', data: { title: eventTitle, date: eventDate } });
      } else {
        // Placeholder for calendar logic
        results.push({ action: 'calendar_event', status: 'success', note: 'Calendar integration pending' });
      }
    }

    // 6️⃣ CREATE ALERT
    if (actions.create_alert?.enabled) {
      console.log('[AutoRule] 🚨 Processing: create_alert');
      
      const alertMessage = await replaceTokens(actions.create_alert.message_template, { mail, caseId, clientId }, supabaseClient);
      const alertDate = calculateEventDate(mail.received_at, actions.create_alert);
      const alertConfig = {
          activity_type: actions.create_alert.alert_type || 'reminder',
          case_id: caseId,
          status: 'pending',
          description: alertMessage,
          due_date: alertDate.toISOString().split('T')[0],
          metadata: {
            mail_id: mailId,
            automation_rule_id: ruleId,
            recipients: actions.create_alert.recipients || [],
          }
      };

      if (testMode) {
        results.push({ action: 'create_alert', status: 'test_skipped', data: alertConfig });
      } else {
        const { data: activity, error } = await supabaseClient.from('Activity').insert(alertConfig).select().single();
        if (error) throw new Error(`create_alert failed: ${error.message}`);
        rollbackManager.register({ type: 'create_alert', id: activity.id });
        results.push({ action: 'create_alert', status: 'success', activity_id: activity.id });
      }
    }

    // ========================================
    // SUMMARY
    // ========================================
    
    const executionTime = Date.now() - startTime;
    const actionsSummary = {
      total: results.length,
      success: results.filter(r => r.status === 'success').length,
      failed: results.filter(r => r.status === 'failed').length,
      pending_approval: results.filter(r => r.status === 'pending_approval').length,
      test_skipped: results.filter(r => r.status === 'test_skipped').length,
      skipped: results.filter(r => r.status === 'skipped').length,
    };

    console.log(`[AutoRule] 🏁 Complete in ${executionTime}ms. Summary:`, actionsSummary);

    // Save Log if not test mode
    if (!testMode) {
      await logAutomationExecution(supabaseClient, {
        rule_id: ruleId,
        rule_name: rule.name,
        mail_id: mailId,
        mail_subject: mail.subject,
        execution_status: 'completed',
        actions_summary: results,
        execution_time_ms: executionTime,
        metadata: { case_id: caseId, client_id: clientId, extracted: extractedInfo },
      });
      await updateRuleStats(supabaseClient, ruleId, actionsSummary.failed === 0);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        results,
        summary: actionsSummary,
        execution_time_ms: executionTime,
        test_mode: testMode,
        extracted_info: extractedInfo
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[AutoRule] ❌ Error:', error);
    
    // Rollback only if not test mode
    if (rollbackManager && !req.json().then(b => b.testMode).catch(() => false)) {
      try { await rollbackManager.rollbackAll(); } catch (e) { console.error('Rollback failed', e); }
    }
    
    const executionTime = Date.now() - startTime;
    
    // Log failure
    if (mailData && ruleData) {
      try {
        // Re-create client for logging (in case the error was with the client itself)
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        await logAutomationExecution(supabase, {
          rule_id: ruleData.id,
          rule_name: ruleData.name,
          mail_id: mailData.id,
          mail_subject: mailData.subject,
          execution_status: 'failed',
          actions_summary: [],
          execution_time_ms: executionTime,
          error_message: error.message,
          metadata: {},
        });
      } catch (logError) { console.error('Logging failed', logError); }
    }
    
    return new Response(
      JSON.stringify({ error: error.message, rolled_back: true }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});