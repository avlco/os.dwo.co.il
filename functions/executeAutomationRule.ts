// @ts-nocheck
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ========================================
// DWO EMAIL DESIGN SYSTEM (INLINE CSS)
// ========================================

const BRAND = {
  colors: {
    primary: '#b62f12',    // DWO Red
    secondary: '#545454',  // DWO Dark Gray
    bg: '#f3f4f6',         // Light Grey Background
    card: '#ffffff',       // White Card
    text: '#000000',       // Black Text
    textLight: '#545454',  // Metadata Text
    link: '#b62f12'        // Link
  },
  logoUrl: 'https://dwo.co.il/wp-content/uploads/2020/04/Drori-Stav-logo-2.png', 
  appUrl: 'https://os.dwo.co.il'
};

/**
 * Generates HTML with INLINE styles for maximum compatibility (Outlook, Gmail)
 */
function generateEmailLayout(contentHtml, title) {
  const t = {
    footer_contact: 'DWO - משרד עורכי דין | www.dwo.co.il',
    footer_disclaimer: 'הודעה זו מכילה מידע סודי ומוגן. אם קיבלת הודעה זו בטעות, אנא מחק אותה ודווח לשולח.'
  };

  const s = {
    body: `margin: 0; padding: 0; background-color: ${BRAND.colors.bg}; font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;`,
    wrapper: `padding: 20px; background-color: ${BRAND.colors.bg};`,
    container: `max-width: 600px; margin: 0 auto; background-color: ${BRAND.colors.card}; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);`,
    header: `background-color: ${BRAND.colors.card}; padding: 20px; text-align: center; border-bottom: 3px solid ${BRAND.colors.primary};`,
    logo: `height: 50px; width: auto; max-width: 200px; object-fit: contain; display: block; margin: 0 auto;`,
    content: `padding: 30px 25px; color: ${BRAND.colors.text}; line-height: 1.6; text-align: right; direction: rtl; font-size: 16px;`,
    footer: `background-color: #f8fafc; padding: 20px; text-align: center; font-size: 12px; color: ${BRAND.colors.textLight}; border-top: 1px solid #e2e8f0; direction: rtl;`,
    link: `color: ${BRAND.colors.link}; text-decoration: none; font-weight: bold;`
  };

  return `
<!DOCTYPE html>
<html dir="rtl" lang="he">
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
           <img src="${BRAND.logoUrl}" alt="DWO Logo" style="${s.logo}" width="200" height="50" />
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
      if (client) {
        result = result.replace(/{Client_Name}/g, client.name || '');
      }
    } catch (e) {}
  }
  
  return result.replace(/{[^}]+}/g, '');
}

function calculateDueDate(offset, unit = 'days', direction = 'after', baseDate = new Date()) {
  const date = new Date(baseDate);
  const multiplier = direction === 'before' ? -1 : 1;
  const val = (offset || 0) * multiplier;

  if (unit === 'days') {
    date.setDate(date.getDate() + val);
  } else if (unit === 'weeks') {
    date.setDate(date.getDate() + (val * 7));
  } else if (unit === 'months') {
    date.setMonth(date.getMonth() + val);
  } else if (unit === 'years') {
    date.setFullYear(date.getFullYear() + val);
  }

  return date.toISOString().split('T')[0];
}

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
    } catch (e) {}
  }
  
  return [...new Set(emails)];
}

// ========================================
// LOGGING HELPER
// ========================================
async function logAutomationExecution(base44, logData) {
  try {
        const actionsSummaryStrings = (logData.actions_summary || []).map(action => {
      const status = action.status === 'success' ? '✅' :
                     action.status === 'failed' ? '❌' :
                     action.status === 'pending_batch' ? '⏸️ (ממתין לאישור)' : '⏭️';
      
      let details = "";
      const cfg = action.config || {};

      // פירוט לפי סוג הפעולה
      if (action.action === 'billing') {
        const total = (cfg.hours || 0) * (cfg.rate || 0);
        details = ` [${cfg.hours} שעות x ₪${cfg.rate} = ₪${total}]`;
      } 
      else if (action.action === 'send_email') {
        details = ` [אל: ${cfg.to}, נושא: ${cfg.subject}]`;
      }
      else if (action.action === 'save_file') {
        details = ` [תיקייה: ${cfg.subfolder || 'ראשי'}]`;
      }
      else if (action.action === 'calendar_event') {
        details = ` [${cfg.title} בתאריך ${cfg.start_date.split('T')[0]}]`;
      }
      else if (action.action === 'create_alert') {
        details = ` [התרעה: ${cfg.description}]`;
      }

      // תרגום שמות הפעולות לעברית לנוחות העו"ד
      const actionNames = {
        'send_email': '📧 שליחת מייל',
        'billing': '💰 חיוב שעות',
        'save_file': '🗂️ שמירת קובץ',
        'calendar_event': '📅 אירוע ביומן',
        'create_alert': '🚨 התרעה/דוקטינג'
      };
      
      const friendlyName = actionNames[action.action] || action.action;
      return `${friendlyName}${details}: ${status}`;
    });

    // חישוב סטטוס מדויק בהתבסס על תוצאות הפעולות
    const actions = logData.actions_summary || [];
    const successCount = actions.filter(a => a.status === 'success').length;
    const failedCount = actions.filter(a => a.status === 'failed').length;
    const pendingBatchCount = actions.filter(a => a.status === 'pending_batch').length;
    
    let activityStatus = 'completed';
    if (failedCount > 0 && successCount > 0) {
      activityStatus = 'completed_with_errors';
    } else if (failedCount > 0 && successCount === 0) {
      activityStatus = 'failed';
    } else if (pendingBatchCount > 0) {
      activityStatus = 'pending';
    }

    await base44.entities.Activity.create({
      activity_type: 'automation_log',
      type: 'automation_log',
      case_id: logData.metadata?.case_id || null,
      client_id: logData.metadata?.client_id || null,
      status: activityStatus,
      title: `${logData.rule_name} - ${activityStatus}`,
      description: `${logData.rule_name} → ${logData.mail_subject}`,
      user_email: logData.user_email || null,
      metadata: {
        rule_id: logData.rule_id,
        rule_name: logData.rule_name,
        mail_id: logData.mail_id,
        mail_subject: logData.mail_subject,
        execution_status: activityStatus,
        actions_summary: actionsSummaryStrings,
        execution_time_ms: logData.execution_time_ms,
        case_id_ref: logData.metadata?.case_id,
        client_id_ref: logData.metadata?.client_id,
        logged_at: new Date().toISOString()
      }
    });
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
// MAIN HANDLER
// ========================================
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();
  let mailData = null;
  let ruleData = null;
  let userEmail = null;
  
  try {
    const base44 = createClientFromRequest(req);
    
    const rawBody = await req.json();
    const params = rawBody.body || rawBody;
    const { mailId, ruleId, testMode = false, userId } = params; // <--- ACCEPT userId

    if (!mailId || !ruleId) throw new Error('mailId and ruleId are required');

    // 1. RESOLVE USER EMAIL (Accurate Attribution)
    if (userId) {
       try {
         const u = await base44.entities.User.get(userId);
         if (u) userEmail = u.email;
       } catch(e) { console.warn('Failed to fetch user by ID'); }
    }
    
    // Fallback: If no userId provided, try to guess from sender (Legacy behavior)
    if (!userEmail) {
        const mail = await base44.entities.Mail.get(mailId);
        if (mail && mail.sender_email) {
            let rawEmail = mail.sender_email;
            const emailMatch = rawEmail.match(/<(.+?)>/);
            userEmail = emailMatch ? emailMatch[1] : rawEmail;
        }
    }

    const mail = await base44.entities.Mail.get(mailId);
    if (!mail) throw new Error(`Mail not found: ${mailId}`);
    mailData = mail;

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

    // --- לוגיקת שפה: נקבעת לאחר סיום חילוץ הנתונים והלקוח ---
    let clientLanguage = 'he'; // Default Hebrew
    let clientData = null;
    if (clientId) {
      try {
        clientData = await base44.entities.Client.get(clientId);
        // Check communication_language field (standard field in Client entity)
        if (clientData?.communication_language) {
          clientLanguage = clientData.communication_language; // 'he' or 'en'
        }
      } catch (e) { console.warn('Failed to fetch client language'); }
    }
    
    // Convert to boolean for easy usage
    const useEnglish = clientLanguage === 'en';
    console.log(`[AutoRule] Client language: ${clientLanguage}, useEnglish: ${useEnglish}`);

    // פונקציית עזר לבחירת התבנית הנכונה (עברית/אנגלית)
    // Returns the English template if: 1) Client prefers English AND 2) English is enabled for this action
    const getTemplate = (actionConfig, fieldHe, fieldEn) => {
      if (useEnglish && actionConfig.enable_english && actionConfig[fieldEn]) {
        return actionConfig[fieldEn];
      }
      return actionConfig[fieldHe];
    };

    // --- DISPATCH: Execute Actions ---
    const results = [];
    const actions = rule.action_bundle || {};

    // Helper: Check approval or execute
    const handleAction = async (actionType, config, executeFn) => {
      if (testMode) {
        results.push({ action: actionType, status: 'test_skipped', data: config });
        return;
      }
      
      // BATCHING LOGIC:
      if (rule.require_approval) {
        results.push({ 
          action: actionType, 
          status: 'pending_batch', 
          config: config,
          approver_email: rule.approver_email,
          rule_id: rule.id,
          rule_name: rule.name
        });
        console.log(`[AutoRule] ⏸️ Action ${actionType} pending batch approval`);
      } else {
        // Direct execution (No Approval Needed)
        await executeFn();
      }
    };

       // Action 1: Send Email
    if (actions.send_email?.enabled) {
      const to = await resolveRecipients(actions.send_email.recipients, { caseId, clientId }, base44);
      if (to.length > 0) {
        // בחירת התבנית הנכונה לפי שפת הלקוח
        const subjectTemplate = getTemplate(actions.send_email, 'subject_template', 'subject_template_en');
        const bodyTemplate = getTemplate(actions.send_email, 'body_template', 'body_template_en');

        const emailConfig = {
          to: to.join(','),
          subject: await replaceTokens(subjectTemplate, { mail, caseId, clientId }, base44),
          body: await replaceTokens(bodyTemplate, { mail, caseId, clientId }, base44),
          // Include language metadata for approval email display
          language: clientLanguage,
          enable_english: actions.send_email.enable_english || false,
          // Keep original templates for reference in approval email
          subject_template_he: actions.send_email.subject_template,
          subject_template_en: actions.send_email.subject_template_en,
          body_template_he: actions.send_email.body_template,
          body_template_en: actions.send_email.body_template_en
        };
        
        await handleAction('send_email', emailConfig, async () => {
          // BRANDING: Inline CSS Wrapper
          const formattedBody = `
            <div style="font-family: 'Segoe UI', Arial, sans-serif; color: ${BRAND.colors.text}; white-space: pre-wrap;">
              ${emailConfig.body}
            </div>
          `;
          const finalHtml = generateEmailLayout(formattedBody, emailConfig.subject);

          const emailResult = await base44.functions.invoke('sendEmail', {
            to: emailConfig.to,
            subject: emailConfig.subject,
            body: finalHtml
          });
          
          if (emailResult.error) throw new Error(`sendEmail failed: ${emailResult.error}`);
          results.push({ action: 'send_email', status: 'success', sent_to: to });
          console.log('[AutoRule] ✅ Branded email sent directly');
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
      
      await handleAction('create_task', taskData, async () => {
        const task = await base44.entities.Task.create(taskData);
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
        user_email: userEmail, // <--- Correctly attributed to the lawyer
        task_id: null
      };
      
      await handleAction('billing', billingData, async () => {
        const timeEntry = await base44.entities.TimeEntry.create(billingData);
        try {
          await base44.functions.invoke('syncBillingToSheets', { timeEntryId: timeEntry.id });
        } catch (e) {}
        results.push({ action: 'billing', status: 'success', id: timeEntry.id });
      });
    }

        // Action 4: Save File (via uploadToDropbox)
    if (actions.save_file?.enabled) {
      if (!mail.attachments || mail.attachments.length === 0) {
        results.push({ action: 'save_file', status: 'skipped', reason: 'no_attachments' });
      } else {
        const uploadConfig = {
          mailId: mailId,
          caseId: caseId,
          clientId: clientId,
          documentType: actions.save_file.document_type || 'other',
          subfolder: actions.save_file.subfolder || '',
          pathTemplate: actions.save_file.path_template || '',
          attachmentCount: mail.attachments.length
        };

        await handleAction('save_file', uploadConfig, async () => {
          const rawResult = await base44.functions.invoke('uploadToDropbox', uploadConfig);
          const uploadResult = rawResult.data || rawResult;

          if (uploadResult.error) throw new Error(uploadResult.error);
          results.push({
            action: 'save_file',
            status: 'success',
            uploaded: uploadResult.uploaded,
            path: uploadResult.dropbox_path,
            results: uploadResult.results
          });
        });
      }
    }


        // Action 5: Calendar Event
    if (actions.calendar_event?.enabled) {
      let calculationBase = new Date(mail.received_at || Date.now());

      if (actions.calendar_event.timing_base === 'docket_date' && caseId) {
        try {
          const deadlines = await base44.entities.Deadline.filter({ 
            case_id: caseId, 
            deadline_type: actions.calendar_event.timing_docket_type 
          }, '-due_date');
          if (deadlines && deadlines.length > 0) {
            calculationBase = new Date(deadlines[0].due_date);
          }
        } catch (e) { console.warn('Failed to fetch base docket date'); }
      }

      const calculatedDay = calculateDueDate(
        actions.calendar_event.timing_offset,
        actions.calendar_event.timing_unit,
        actions.calendar_event.timing_direction,
        calculationBase
      );
      const timeOfDay = actions.calendar_event.time_of_day || '09:00';
      const startDateTime = `${calculatedDay}T${timeOfDay}:00`;

            // בחירת התבנית הנכונה לפי שפת הלקוח
      const titleTemplate = getTemplate(actions.calendar_event, 'title_template', 'title_template_en');
      const descTemplate = getTemplate(actions.calendar_event, 'description_template', 'description_template_en');

      const eventData = {
        title: await replaceTokens(titleTemplate || 'תזכורת', { mail, caseId, clientId }, base44),
        description: await replaceTokens(descTemplate || '', { mail, caseId, clientId }, base44),
        start_date: startDateTime,
        duration_minutes: actions.calendar_event.duration_minutes || 60,
        case_id: caseId,
        client_id: clientId,
        reminder_minutes: actions.calendar_event.reminder_minutes || 1440,
        create_meet_link: actions.calendar_event.create_meet_link || false,
        attendees: actions.calendar_event.attendees || [],
        // Include language metadata for approval email display
        language: clientLanguage,
        enable_english: actions.calendar_event.enable_english || false,
        timing_base: actions.calendar_event.timing_base,
        timing_offset: actions.calendar_event.timing_offset,
        timing_unit: actions.calendar_event.timing_unit,
        timing_direction: actions.calendar_event.timing_direction,
        time_of_day: timeOfDay
      };
      
      await handleAction('calendar_event', eventData, async () => {
         const calendarRaw = await base44.functions.invoke('createCalendarEvent', eventData);
         const calendarResult = calendarRaw?.data || calendarRaw;
         if (calendarResult?.error) {
            results.push({ action: 'calendar_event', status: 'failed', error: calendarResult.error });
         } else {
            results.push({ action: 'calendar_event', status: 'success', google_event_id: calendarResult?.google_event_id });
            try {
              await base44.entities.Deadline.create({
                case_id: caseId,
                deadline_type: 'hearing',
                description: eventData.title || eventData.description || 'אירוע מאוטומציה',
                due_date: (eventData.start_date || new Date().toISOString()).split('T')[0],
                status: 'pending',
                is_critical: false,
                metadata: {
                  google_event_id: calendarResult?.google_event_id || null,
                  html_link: calendarResult?.htmlLink || null,
                  meet_link: calendarResult?.meetLink || null,
                  source: 'automation_direct'
                }
              });
            } catch (e) { console.warn('[AutoRule] Failed to create local Deadline:', e.message); }
         }
      });
    }

        // Action 6: Create Alert / Docketing
    if (actions.create_alert?.enabled) {
      let calculationBase = new Date(mail.received_at || Date.now());

      if (actions.create_alert.timing_base === 'docket_date' && caseId) {
        try {
          const deadlines = await base44.entities.Deadline.filter({ 
            case_id: caseId, 
            deadline_type: actions.create_alert.timing_docket_type 
          }, '-due_date');
          if (deadlines && deadlines.length > 0) {
            calculationBase = new Date(deadlines[0].due_date);
          }
        } catch (e) { console.warn('Failed to fetch base docket date for alert'); }
      }

      const calculatedDay = calculateDueDate(
        actions.create_alert.timing_offset,
        actions.create_alert.timing_unit,
        actions.create_alert.timing_direction,
        calculationBase
      );
      const timeOfDay = actions.create_alert.time_of_day || '09:00';
      const dueDateTime = `${calculatedDay}T${timeOfDay}:00`;

      // בחירת התבנית הנכונה לפי שפת הלקוח
      const alertTemplate = getTemplate(actions.create_alert, 'message_template', 'message_template_en');

      const alertData = {
        case_id: caseId,
        client_id: clientId,
        alert_type: actions.create_alert.alert_type || 'reminder',
        deadline_type: actions.create_alert.alert_type || 'reminder',
        description: await replaceTokens(alertTemplate || 'התרעה מאוטומציה', { mail, caseId, clientId }, base44),
        message: await replaceTokens(alertTemplate || 'התרעה מאוטומציה', { mail, caseId, clientId }, base44),
        due_date: calculatedDay,
        status: 'pending',
        is_critical: actions.create_alert.alert_type === 'deadline' || actions.create_alert.alert_type === 'urgent',
        // Include language metadata for approval email display
        language: clientLanguage,
        enable_english: actions.create_alert.enable_english || false,
        timing_base: actions.create_alert.timing_base,
        timing_offset: actions.create_alert.timing_offset,
        timing_unit: actions.create_alert.timing_unit,
        timing_direction: actions.create_alert.timing_direction,
        time_of_day: timeOfDay,
        recipients: actions.create_alert.recipients || [],
        metadata: {
          execution_time: dueDateTime,
          recipients: actions.create_alert.recipients || [],
          source: 'automation_alert'
        }
      };

      await handleAction('create_alert', alertData, async () => {
        const deadline = await base44.entities.Deadline.create(alertData);
        results.push({ action: 'create_alert', status: 'success', id: deadline.id });
      });
    }


    // --- Finalize ---
    const executionTime = Date.now() - startTime;
    
    // עדכון סטטוס המייל בהתאם לתוצאות
    const hasPendingBatch = results.some(r => r.status === 'pending_batch');
    const hasSuccess = results.some(r => r.status === 'success');
    const hasFailed = results.some(r => r.status === 'failed');
    
    if (!testMode) {
      try {
        let newStatus = mail.processing_status;
        
        if (hasPendingBatch) {
          newStatus = 'awaiting_approval';
        } else if (hasFailed && !hasSuccess) {
          newStatus = 'automation_failed';
        } else if (hasSuccess) {
          newStatus = 'automation_complete';
        }
        
        await base44.entities.Mail.update(mailId, { 
          processing_status: newStatus,
          matched_rule_id: ruleId,
          matched_rule_name: rule.name
        });
      } catch (e) {
        console.error('[AutoRule] Failed to update mail status:', e);
      }
      
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
      extracted_info: extractedInfo,
      case_id: caseId,
      client_id: clientId,
      client_language: clientLanguage,
      execution_time_ms: executionTime 
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('[AutoRule] ❌ Error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});