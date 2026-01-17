import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization') || '';
    
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    const { mailId, ruleId } = await req.json();

    // Get mail data
    const { data: mail, error: mailError } = await supabaseClient
      .from('Mail')
      .select('*')
      .eq('id', mailId)
      .single();

    if (mailError || !mail) {
      throw new Error('Mail not found');
    }

    // Get automation rule
    const { data: rule, error: ruleError } = await supabaseClient
      .from('AutomationRule')
      .select('*')
      .eq('id', ruleId)
      .single();

    if (ruleError || !rule) {
      throw new Error('Automation rule not found');
    }

    // Extract case_id and client_id from mail using map_config
    let caseId = null;
    let clientId = null;

    if (rule.map_config?.case_identifier) {
      const caseIdentifier = extractFromMail(mail, rule.map_config.case_identifier);
      if (caseIdentifier) {
        const { data: caseData } = await supabaseClient
          .from('Case')
          .select('id, client_id')
          .eq('case_number', caseIdentifier)
          .single();
        
        if (caseData) {
          caseId = caseData.id;
          clientId = caseData.client_id;
        }
      }
    }

    if (!clientId && rule.map_config?.client_identifier) {
      const clientIdentifier = extractFromMail(mail, rule.map_config.client_identifier);
      if (clientIdentifier) {
        const { data: clientData } = await supabaseClient
          .from('Client')
          .select('id')
          .eq('name', clientIdentifier)
          .single();
        
        if (clientData) {
          clientId = clientData.id;
        }
      }
    }

    // Get current user for approval requests
    const { data: { user } } = await supabaseClient.auth.getUser();

    // Process each action
    const results = [];
    const actions = rule.actions_config || {};

    // 1. Send Email Action
    if (actions.send_email?.enabled) {
      const emailConfig = {
        to: await replaceTokens(actions.send_email.to, { mail, caseId, clientId }, supabaseClient),
        subject: await replaceTokens(actions.send_email.subject, { mail, caseId, clientId }, supabaseClient),
        body: await replaceTokens(actions.send_email.body, { mail, caseId, clientId }, supabaseClient),
      };

      if (actions.send_email.require_approval) {
        const approvalResult = await createApprovalRequest(
          supabaseClient,
          {
            automation_rule_id: ruleId,
            mail_id: mailId,
            case_id: caseId,
            client_id: clientId,
            action_type: 'send_email',
            action_config: emailConfig,
            approver_email: actions.send_email.approver_email,
            requested_by: user?.email || 'system',
            mail_subject: mail.subject,
            mail_from: mail.from_email,
          }
        );
        results.push({ action: 'send_email', status: 'pending_approval', approvalId: approvalResult.id });
      } else {
        const { error } = await supabaseClient.functions.invoke('sendEmail', {
          body: emailConfig,
        });
        results.push({ action: 'send_email', status: error ? 'failed' : 'success', error: error?.message });
      }
    }

    // 2. Create Task Action
    if (actions.create_task?.enabled) {
      const taskConfig = {
        title: await replaceTokens(actions.create_task.title, { mail, caseId, clientId }, supabaseClient),
        description: await replaceTokens(actions.create_task.description, { mail, caseId, clientId }, supabaseClient),
        case_id: caseId,
        due_date: calculateDueDate(actions.create_task.due_offset_days),
        assigned_to: actions.create_task.assigned_to,
        priority: actions.create_task.priority || 'medium',
      };

      if (actions.create_task.require_approval) {
        const approvalResult = await createApprovalRequest(
          supabaseClient,
          {
            automation_rule_id: ruleId,
            mail_id: mailId,
            case_id: caseId,
            client_id: clientId,
            action_type: 'create_task',
            action_config: taskConfig,
            approver_email: actions.create_task.approver_email,
            requested_by: user?.email || 'system',
            mail_subject: mail.subject,
            mail_from: mail.from_email,
          }
        );
        results.push({ action: 'create_task', status: 'pending_approval', approvalId: approvalResult.id });
      } else {
        const { error } = await supabaseClient
          .from('Task')
          .insert({ ...taskConfig, status: 'pending' });
        results.push({ action: 'create_task', status: error ? 'failed' : 'success', error: error?.message });
      }
    }

    // 3. Create Deadline Action
    if (actions.create_deadline?.enabled) {
      const deadlineConfig = {
        title: await replaceTokens(actions.create_deadline.title, { mail, caseId, clientId }, supabaseClient),
        description: await replaceTokens(actions.create_deadline.description, { mail, caseId, clientId }, supabaseClient),
        case_id: caseId,
        due_date: calculateDueDate(actions.create_deadline.due_offset_days),
        deadline_type: actions.create_deadline.deadline_type || 'general',
      };

      if (actions.create_deadline.require_approval) {
        const approvalResult = await createApprovalRequest(
          supabaseClient,
          {
            automation_rule_id: ruleId,
            mail_id: mailId,
            case_id: caseId,
            client_id: clientId,
            action_type: 'create_deadline',
            action_config: deadlineConfig,
            approver_email: actions.create_deadline.approver_email,
            requested_by: user?.email || 'system',
            mail_subject: mail.subject,
            mail_from: mail.from_email,
          }
        );
        results.push({ action: 'create_deadline', status: 'pending_approval', approvalId: approvalResult.id });
      } else {
        const { error } = await supabaseClient
          .from('Deadline')
          .insert({ ...deadlineConfig, status: 'active' });
        results.push({ action: 'create_deadline', status: error ? 'failed' : 'success', error: error?.message });
      }
    }

    // 4. Billing Action
    if (actions.billing?.enabled) {
      const billingConfig = {
        hours: actions.billing.hours,
        description: await replaceTokens(actions.billing.description, { mail, caseId, clientId }, supabaseClient),
        hourly_rate: actions.billing.hourly_rate,
      };

      if (actions.billing.require_approval) {
        const approvalResult = await createApprovalRequest(
          supabaseClient,
          {
            automation_rule_id: ruleId,
            mail_id: mailId,
            case_id: caseId,
            client_id: clientId,
            action_type: 'billing',
            action_config: billingConfig,
            approver_email: actions.billing.approver_email,
            requested_by: user?.email || 'system',
            mail_subject: mail.subject,
            mail_from: mail.from_email,
          }
        );
        results.push({ action: 'billing', status: 'pending_approval', approvalId: approvalResult.id });
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
      }
    }

    // 5. Calendar Event Action
    if (actions.calendar_event?.enabled) {
      const calendarConfig = {
        title: await replaceTokens(actions.calendar_event.title, { mail, caseId, clientId }, supabaseClient),
        description: await replaceTokens(actions.calendar_event.description, { mail, caseId, clientId }, supabaseClient),
        date: calculateDueDate(actions.calendar_event.date_offset_days),
        duration: actions.calendar_event.duration || 60,
      };

      if (actions.calendar_event.require_approval) {
        const approvalResult = await createApprovalRequest(
          supabaseClient,
          {
            automation_rule_id: ruleId,
            mail_id: mailId,
            case_id: caseId,
            client_id: clientId,
            action_type: 'calendar_event',
            action_config: calendarConfig,
            approver_email: actions.calendar_event.approver_email,
            requested_by: user?.email || 'system',
            mail_subject: mail.subject,
            mail_from: mail.from_email,
          }
        );
        results.push({ action: 'calendar_event', status: 'pending_approval', approvalId: approvalResult.id });
      } else {
        results.push({ action: 'calendar_event', status: 'pending_implementation' });
      }
    }

    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in executeAutomationRule:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

// Helper: Extract data from mail
function extractFromMail(mail, config) {
  if (!config) return null;
  
  const source = config.source || 'subject';
  const text = source === 'body' ? mail.body_text : mail.subject;
  
  if (!text) return null;
  
  if (config.regex) {
    const match = text.match(new RegExp(config.regex));
    return match ? match[1] || match[0] : null;
  }
  
  if (config.anchor) {
    const index = text.indexOf(config.anchor);
    if (index === -1) return null;
    
    const afterAnchor = text.substring(index + config.anchor.length).trim();
    const words = afterAnchor.split(/\s+/);
    return words[0] || null;
  }
  
  return null;
}

// Helper: Replace tokens in templates
async function replaceTokens(template, context, supabase) {
  if (!template) return '';
  
  let result = template;
  
  result = result.replace(/{Mail_Subject}/g, context.mail?.subject || '');
  result = result.replace(/{Mail_From}/g, context.mail?.from_email || '');
  result = result.replace(/{Mail_Body}/g, context.mail?.body_text || '');
  
  if (context.caseId) {
    const { data: caseData } = await supabase
      .from('Case')
      .select('case_number, title')
      .eq('id', context.caseId)
      .single();
    
    result = result.replace(/{Case_No}/g, caseData?.case_number || '');
    result = result.replace(/{Case_Title}/g, caseData?.title || '');
  }
  
  if (context.clientId) {
    const { data: clientData } = await supabase
      .from('Client')
      .select('name, email')
      .eq('id', context.clientId)
      .single();
    
    result = result.replace(/{Client_Name}/g, clientData?.name || '');
    result = result.replace(/{Client_Email}/g, clientData?.email || '');
  }
  
  return result;
}

// Helper: Calculate due date
function calculateDueDate(offsetDays) {
  const date = new Date();
  date.setDate(date.getDate() + (offsetDays || 0));
  return date.toISOString().split('T')[0];
}

// Helper: Create approval request
async function createApprovalRequest(supabase, data) {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  const { data: approval, error } = await supabaseClient
    .from('AutomationApproval')
    .insert({
      ...data,
      status: 'pending',
      expires_at: expiresAt.toISOString(),
    })
    .select()
    .single();

  if (error) throw error;
  
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

  return approval;
}
