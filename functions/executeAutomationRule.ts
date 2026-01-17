// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization') || '';
    
    const supabaseClient = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    // 🆕 שינוי שמות הפרמטרים
    const { mailId, ruleId } = await req.json();

    if (!mailId || !ruleId) {
      throw new Error('mailId and ruleId are required');
    }

    console.log(`[AutoRule] 🚀 Starting execution: Mail ${mailId} + Rule ${ruleId}`);

    // שלוף את המייל
    const { data: mail, error: mailError } = await supabaseClient
      .from('Mail')
      .select('*')
      .eq('id', mailId)
      .single();

    if (mailError || !mail) {
      throw new Error(`Mail not found: ${mailError?.message || 'Unknown'}`);
    }

    console.log(`[AutoRule] 📧 Mail: "${mail.subject}" from ${mail.sender_email}`);

    // שלוף את החוק
    const { data: rule, error: ruleError } = await supabaseClient
      .from('AutomationRule')
      .select('*')
      .eq('id', ruleId)
      .single();

    if (ruleError || !rule) {
      throw new Error(`Automation rule not found: ${ruleError?.message || 'Unknown'}`);
    }

    console.log(`[AutoRule] 📋 Rule: "${rule.name}" (approval: ${rule.require_approval})`);

    // חלץ מזהים (Case/Client)
    let caseId = null;
    let clientId = null;

    if (rule.map_config && Array.isArray(rule.map_config)) {
      console.log(`[AutoRule] 🔍 Processing ${rule.map_config.length} extraction rule(s)`);
      
      for (const mapRule of rule.map_config) {
        const extracted = extractFromMail(mail, mapRule);
        
        if (extracted) {
          console.log(`[AutoRule] ✅ Extracted "${extracted}" from ${mapRule.source} using "${mapRule.anchor_text}"`);
          
          // נסה למצוא Case
          if (mapRule.target_field === 'case_no') {
            const { data: caseData } = await supabaseClient
              .from('Case')
              .select('id, client_id, case_number')
              .eq('case_number', extracted)
              .single();
            
            if (caseData) {
              caseId = caseData.id;
              clientId = caseData.client_id;
              console.log(`[AutoRule] 🎯 Matched Case: ${caseData.case_number} (ID: ${caseId})`);
            }
          }
          
          // נסה למצוא Case לפי מספר רשמי
          if (mapRule.target_field === 'official_no' && !caseId) {
            const { data: caseData } = await supabaseClient
              .from('Case')
              .select('id, client_id, case_number')
              .eq('official_number', extracted)
              .single();
            
            if (caseData) {
              caseId = caseData.id;
              clientId = caseData.client_id;
              console.log(`[AutoRule] 🎯 Matched Case by official_no: ${caseData.case_number}`);
            }
          }
          
          // נסה למצוא Client ישירות
          if (mapRule.target_field === 'client_ref' && !clientId) {
            const { data: clientData } = await supabaseClient
              .from('Client')
              .select('id, name')
              .eq('name', extracted)
              .single();
            
            if (clientData) {
              clientId = clientData.id;
              console.log(`[AutoRule] 🎯 Matched Client: ${clientData.name}`);
            }
          }
        }
      }
    }

    const { data: { user } } = await supabaseClient.auth.getUser();
    const userId = user?.id || mail.user_id;

    const results = [];
    const actions = rule.action_bundle || {};

    console.log(`[AutoRule] 🎬 Executing actions...`);

    // ========================================
    // 1️⃣ SEND EMAIL
    // ========================================
    if (actions.send_email?.enabled) {
      console.log('[AutoRule] 📧 Processing: send_email');
      
      const emailConfig = {
        to: await replaceTokens(actions.send_email.to, { mail, caseId, clientId }, supabaseClient),
        subject: await replaceTokens(actions.send_email.subject_template, { mail, caseId, clientId }, supabaseClient),
        body: await replaceTokens(actions.send_email.body_template, { mail, caseId, clientId }, supabaseClient),
      };

      if (rule.require_approval) {
        const approvalActivity = await createApprovalActivity(
          supabaseClient,
          {
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
          }
        );
        results.push({ action: 'send_email', status: 'pending_approval', activityId: approvalActivity.id });
        console.log('[AutoRule] ⏳ send_email → pending approval');
      } else {
        const { error } = await supabaseClient.functions.invoke('sendEmail', {
          body: emailConfig,
        });
        results.push({ action: 'send_email', status: error ? 'failed' : 'success', error: error?.message });
        console.log(`[AutoRule] ${error ? '❌' : '✅'} send_email → ${error ? 'failed' : 'success'}`);
      }
    }

    // ========================================
    // 2️⃣ CREATE TASK
    // ========================================
    if (actions.create_task?.enabled) {
      console.log('[AutoRule] 📝 Processing: create_task');
      
      const taskConfig = {
        title: await replaceTokens(actions.create_task.title, { mail, caseId, clientId }, supabaseClient),
        description: await replaceTokens(actions.create_task.description, { mail, caseId, clientId }, supabaseClient),
        case_id: caseId,
        due_date: calculateDueDate(actions.create_task.due_offset_days),
        assigned_to: actions.create_task.assigned_to,
        priority: actions.create_task.priority || 'medium',
      };

      if (rule.require_approval) {
        const approvalActivity = await createApprovalActivity(
          supabaseClient,
          {
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
          }
        );
        results.push({ action: 'create_task', status: 'pending_approval', activityId: approvalActivity.id });
        console.log('[AutoRule] ⏳ create_task → pending approval');
      } else {
        const { error } = await supabaseClient
          .from('Task')
          .insert({ ...taskConfig, status: 'pending' });
        results.push({ action: 'create_task', status: error ? 'failed' : 'success', error: error?.message });
        console.log(`[AutoRule] ${error ? '❌' : '✅'} create_task → ${error ? 'failed' : 'success'}`);
      }
    }

    // ========================================
    // 3️⃣ BILLING
    // ========================================
    if (actions.billing?.enabled) {
      console.log('[AutoRule] 💰 Processing: billing');
      
      const billingConfig = {
        hours: actions.billing.hours,
        description: await replaceTokens(actions.billing.description_template, { mail, caseId, clientId }, supabaseClient),
        hourly_rate: actions.billing.hourly_rate,
      };

      if (rule.require_approval) {
        const approvalActivity = await createApprovalActivity(
          supabaseClient,
          {
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
          }
        );
        results.push({ action: 'billing', status: 'pending_approval', activityId: approvalActivity.id });
        console.log('[AutoRule] ⏳ billing → pending approval');
      } else {
        let hourlyRate = billingConfig.hourly_rate || 800;
        
        if (caseId) {
          const { data: caseData } = await supabaseClient
            .from('Case')
            .select('hourly_rate, client_id')
            .eq('id', caseId)
            .single();
          
          if (caseData?.hourly_rate) {
            hourlyRate = caseData.hourly_rate;
          } else if (caseData?.client_id) {
            const { data: clientData } = await supabaseClient
              .from('Client')
              .select('hourly_rate')
              .eq('id', caseData.client_id)
              .single();
            
            if (clientData?.hourly_rate) {
              hourlyRate = clientData.hourly_rate;
            }
          }
        }

        const totalAmount = billingConfig.hours * hourlyRate;

        const { error } = await supabaseClient
          .from('TimeEntry')
          .insert({
            case_id: caseId,
            description: billingConfig.description,
            hours: billingConfig.hours,
            hourly_rate: hourlyRate,
            total_amount: totalAmount,
            date: new Date().toISOString().split('T')[0],
            billable: true,
          });
        
        results.push({ action: 'billing', status: error ? 'failed' : 'success', error: error?.message, totalAmount });
        console.log(`[AutoRule] ${error ? '❌' : '✅'} billing → ${error ? 'failed' : `success (₪${totalAmount})`}`);
      }
    }

    // ========================================
    // 🆕 4️⃣ SAVE FILE (Dropbox)
    // ========================================
    if (actions.save_file?.enabled) {
      console.log('[AutoRule] 🗂️ Processing: save_file');
      
      if (!mail.attachments || mail.attachments.length === 0) {
        console.log('[AutoRule] ⚠️ save_file: No attachments found in mail');
        results.push({ action: 'save_file', status: 'skipped', reason: 'no_attachments' });
      } else {
        const pathTemplate = actions.save_file.path_template;
        const folderPath = await replaceTokens(pathTemplate, { mail, caseId, clientId }, supabaseClient);
        
        console.log(`[AutoRule] 📁 Target folder: ${folderPath}`);
        console.log(`[AutoRule] 📎 Found ${mail.attachments.length} attachment(s)`);
        
        if (rule.require_approval) {
          const approvalActivity = await createApprovalActivity(
            supabaseClient,
            {
              automation_rule_id: ruleId,
              mail_id: mailId,
              case_id: caseId,
              client_id: clientId,
              action_type: 'save_file',
              action_config: { path: folderPath, attachments: mail.attachments },
              approver_email: rule.approver_email,
              requested_by: user?.email || 'system',
              mail_subject: mail.subject,
              mail_from: mail.sender_email,
            }
          );
          results.push({ action: 'save_file', status: 'pending_approval', activityId: approvalActivity.id });
          console.log('[AutoRule] ⏳ save_file → pending approval');
        } else {
          try {
            // קריאה ל-function נפרדת שמטפלת ב-Dropbox
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
            
            if (!dropboxResult.ok) {
              throw new Error(`Dropbox upload failed: ${await dropboxResult.text()}`);
            }
            
            const dropboxData = await dropboxResult.json();
            results.push({ action: 'save_file', status: 'success', uploaded: dropboxData.uploaded || mail.attachments.length });
            console.log(`[AutoRule] ✅ save_file → uploaded ${mail.attachments.length} file(s) to Dropbox`);
          } catch (dropboxError) {
            console.error('[AutoRule] ❌ save_file failed:', dropboxError);
            results.push({ action: 'save_file', status: 'failed', error: dropboxError.message });
          }
        }
      }
    }

    // ========================================
    // 🆕 5️⃣ CALENDAR EVENT
    // ========================================
    if (actions.calendar_event?.enabled) {
      console.log('[AutoRule] 📅 Processing: calendar_event');
      
      const eventTitle = await replaceTokens(actions.calendar_event.title_template, { mail, caseId, clientId }, supabaseClient);
      const eventDate = calculateEventDate(mail.received_at, actions.calendar_event);
      
      console.log(`[AutoRule] 📆 Event: "${eventTitle}" on ${eventDate.toISOString()}`);
      
      const eventConfig = {
        title: eventTitle,
        date: eventDate.toISOString(),
        attendees: actions.calendar_event.attendees || [],
        create_meet_link: actions.calendar_event.create_meet_link || false,
        timing: {
          direction: actions.calendar_event.timing_direction,
          offset: actions.calendar_event.timing_offset,
          unit: actions.calendar_event.timing_unit
        }
      };

      if (rule.require_approval) {
        const approvalActivity = await createApprovalActivity(
          supabaseClient,
          {
            automation_rule_id: ruleId,
            mail_id: mailId,
            case_id: caseId,
            client_id: clientId,
            action_type: 'calendar_event',
            action_config: eventConfig,
            approver_email: rule.approver_email,
            requested_by: user?.email || 'system',
            mail_subject: mail.subject,
            mail_from: mail.sender_email,
          }
        );
        results.push({ action: 'calendar_event', status: 'pending_approval', activityId: approvalActivity.id });
        console.log('[AutoRule] ⏳ calendar_event → pending approval');
      } else {
        try {
          // יצירת אירוע ביומן Google
          const calendarResult = await createGoogleCalendarEvent(
            supabaseClient,
            userId,
            eventTitle,
            eventDate,
            actions.calendar_event.create_meet_link || false
          );
          
          results.push({ 
            action: 'calendar_event', 
            status: 'success', 
            event_id: calendarResult.eventId,
            event_link: calendarResult.htmlLink,
            meet_link: calendarResult.hangoutLink 
          });
          console.log(`[AutoRule] ✅ calendar_event → created (ID: ${calendarResult.eventId})`);
        } catch (calError) {
          console.error('[AutoRule] ❌ calendar_event failed:', calError);
          results.push({ action: 'calendar_event', status: 'failed', error: calError.message });
        }
      }
    }

    // ========================================
    // 🆕 6️⃣ CREATE ALERT (Docketing)
    // ========================================
    if (actions.create_alert?.enabled) {
      console.log('[AutoRule] 🚨 Processing: create_alert');
      
      const alertMessage = await replaceTokens(actions.create_alert.message_template, { mail, caseId, clientId }, supabaseClient);
      const alertDate = calculateEventDate(mail.received_at, actions.create_alert);
      
      console.log(`[AutoRule] ⏰ Alert: "${alertMessage}" due ${alertDate.toISOString()}`);
      
      const alertConfig = {
        type: actions.create_alert.alert_type,
        message: alertMessage,
        due_date: alertDate.toISOString().split('T')[0],
        recipients: actions.create_alert.recipients || []
      };

      if (rule.require_approval) {
        const approvalActivity = await createApprovalActivity(
          supabaseClient,
          {
            automation_rule_id: ruleId,
            mail_id: mailId,
            case_id: caseId,
            client_id: clientId,
            action_type: 'create_alert',
            action_config: alertConfig,
            approver_email: rule.approver_email,
            requested_by: user?.email || 'system',
            mail_subject: mail.subject,
            mail_from: mail.sender_email,
          }
        );
        results.push({ action: 'create_alert', status: 'pending_approval', activityId: approvalActivity.id });
        console.log('[AutoRule] ⏳ create_alert → pending approval');
      } else {
        try {
          // יצירת Activity/Deadline
          const { data: activity, error: actError } = await supabaseClient
            .from('Activity')
            .insert({
              activity_type: alertConfig.type,
              case_id: caseId,
              status: 'pending',
              description: alertConfig.message,
              due_date: alertConfig.due_date,
              metadata: {
                mail_id: mailId,
                automation_rule_id: ruleId,
                recipients: alertConfig.recipients,
                created_by: 'automation'
              }
            })
            .select()
            .single();
          
          if (actError) throw actError;
          
          // שלח התרעות לנמענים
          if (alertConfig.recipients && alertConfig.recipients.length > 0) {
            await sendAlertNotifications(supabaseClient, activity, alertConfig.recipients);
          }
          
          results.push({ action: 'create_alert', status: 'success', activity_id: activity.id });
          console.log(`[AutoRule] ✅ create_alert → created (ID: ${activity.id})`);
        } catch (alertError) {
          console.error('[AutoRule] ❌ create_alert failed:', alertError);
          results.push({ action: 'create_alert', status: 'failed', error: alertError.message });
        }
      }
    }

    console.log(`[AutoRule] 🏁 Execution complete: ${results.length} action(s) processed`);

    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[AutoRule] ❌ Error in executeAutomationRule:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

// ========================================
// HELPER FUNCTIONS
// ========================================

function extractFromMail(mail, config) {
  if (!config) return null;
  
  const source = config.source || 'subject';
  const text = source === 'body' ? (mail.body_plain || mail.body_html || '') : mail.subject;
  
  if (!text) return null;
  
  // Regex extraction
  if (config.regex) {
    const match = text.match(new RegExp(config.regex));
    return match ? match[1] || match[0] : null;
  }
  
  // Anchor text extraction
  if (config.anchor_text) {
    const index = text.indexOf(config.anchor_text);
    if (index === -1) return null;
    
    const afterAnchor = text.substring(index + config.anchor_text.length).trim();
    const words = afterAnchor.split(/\s+/);
    return words[0] || null;
  }
  
  return null;
}

async function replaceTokens(template, context, supabase) {
  if (!template) return '';
  
  let result = template;
  
  // Mail tokens
  result = result.replace(/{Mail_Subject}/g, context.mail?.subject || '');
  result = result.replace(/{Mail_From}/g, context.mail?.sender_email || '');
  result = result.replace(/{Mail_Body}/g, context.mail?.body_plain || '');
  result = result.replace(/{Mail_Date}/g, context.mail?.received_at ? new Date(context.mail.received_at).toLocaleDateString('he-IL') : '');
  
  // Case tokens
  if (context.caseId) {
    const { data: caseData } = await supabase
      .from('Case')
      .select('case_number, title, case_type, official_number')
      .eq('id', context.caseId)
      .single();
    
    result = result.replace(/{Case_No}/g, caseData?.case_number || '');
    result = result.replace(/{Case_Title}/g, caseData?.title || '');
    result = result.replace(/{Case_Type}/g, caseData?.case_type || '');
    result = result.replace(/{Official_No}/g, caseData?.official_number || '');
  }
  
  // Client tokens
  if (context.clientId) {
    const { data: clientData } = await supabase
      .from('Client')
      .select('name, email, phone')
      .eq('id', context.clientId)
      .single();
    
    result = result.replace(/{Client_Name}/g, clientData?.name || '');
    result = result.replace(/{Client_Email}/g, clientData?.email || '');
    result = result.replace(/{Client_Phone}/g, clientData?.phone || '');
  }
  
  return result;
}

function calculateDueDate(offsetDays) {
  const date = new Date();
  date.setDate(date.getDate() + (offsetDays || 0));
  return date.toISOString().split('T')[0];
}

// 🆕 חישוב תאריך לאירועים והתרעות
function calculateEventDate(baseDate, timing) {
  const date = new Date(baseDate);
  const offset = timing.timing_offset || 0;
  const unit = timing.timing_unit || 'days';
  const direction = timing.timing_direction || 'after';
  
  let daysToAdd = 0;
  
  if (unit === 'days') {
    daysToAdd = offset;
  } else if (unit === 'weeks') {
    daysToAdd = offset * 7;
  }
  
  if (direction === 'before') {
    daysToAdd = -daysToAdd;
  }
  
  date.setDate(date.getDate() + daysToAdd);
  date.setHours(10, 0, 0, 0); // Default: 10:00 AM
  
  return date;
}

// 🆕 יצירת אירוע ב-Google Calendar
async function createGoogleCalendarEvent(supabase, userId, title, startDate, createMeetLink) {
  // שלוף Google token
  const { data: connections } = await supabase
    .from('IntegrationConnection')
    .select('access_token_encrypted, refresh_token_encrypted')
    .eq('user_id', userId)
    .eq('provider', 'google')
    .eq('is_active', true)
    .single();
  
  if (!connections) {
    throw new Error('Google Calendar not connected');
  }
  
  // TODO: Decrypt token (use integrationAuth.ts logic)
  const accessToken = connections.access_token_encrypted; // Needs decryption
  
  const endDate = new Date(startDate.getTime() + 60 * 60 * 1000); // +1 hour
  
  const eventData = {
    summary: title,
    start: {
      dateTime: startDate.toISOString(),
      timeZone: 'Asia/Jerusalem',
    },
    end: {
      dateTime: endDate.toISOString(),
      timeZone: 'Asia/Jerusalem',
    },
  };
  
  if (createMeetLink) {
    eventData.conferenceData = {
      createRequest: {
        requestId: `officeos-${Date.now()}`,
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    };
  }
  
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events${createMeetLink ? '?conferenceDataVersion=1' : ''}`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(eventData),
    }
  );
  
  const data = await response.json();
  if (data.error) {
    throw new Error(data.error.message || 'Failed to create calendar event');
  }
  
  return {
    eventId: data.id,
    htmlLink: data.htmlLink,
    hangoutLink: data.hangoutLink,
  };
}

// 🆕 שליחת התרעות לנמענים
async function sendAlertNotifications(supabase, activity, recipients) {
  for (const recipient of recipients) {
    let emailAddress = '';
    
    if (recipient === 'client' && activity.case_id) {
      const { data: caseData } = await supabase
        .from('Case')
        .select('client_id')
        .eq('id', activity.case_id)
        .single();
      
      if (caseData?.client_id) {
        const { data: clientData } = await supabase
          .from('Client')
          .select('email')
          .eq('id', caseData.client_id)
          .single();
        
        emailAddress = clientData?.email;
      }
    } else if (recipient === 'lawyer') {
      // TODO: Get assigned lawyer email
      emailAddress = 'lawyer@example.com';
    }
    
    if (emailAddress) {
      await supabase.functions.invoke('sendEmail', {
        body: {
          to: emailAddress,
          subject: `התרעה חדשה: ${activity.activity_type}`,
          body: `<div dir="rtl"><h2>התרעה</h2><p>${activity.description}</p><p>תאריך יעד: ${activity.due_date}</p></div>`,
        },
      });
    }
  }
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
  
  // שלח מייל למאשר
  await supabase.functions.invoke('sendEmail', {
    body: {
      to: data.approver_email,
      subject: `בקשת אישור: ${data.action_type}`,
      body: `
        <div dir="rtl">
          <h2>בקשת אישור חדשה</h2>
          <p><strong>סוג פעולה:</strong> ${data.action_type}</p>
          <p><strong>מייל מקורי:</strong> ${data.mail_subject}</p>
          <p><strong>שולח:</strong> ${data.mail_from}</p>
          <p><strong>מבוקש על ידי:</strong> ${data.requested_by}</p>
          <br>
          <p>היכנס למערכת כדי לאשר או לדחות את הבקשה.</p>
        </div>
      `,
    },
  });

  return activity;
}
