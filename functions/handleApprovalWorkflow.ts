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
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const { action, approvalId, reason } = await req.json();

    // Get approval request
    const { data: approval, error: fetchError } = await supabaseClient
      .from('AutomationApproval')
      .select('*')
      .eq('id', approvalId)
      .single();

    if (fetchError || !approval) {
      throw new Error('Approval request not found');
    }

    // Check if already processed
    if (approval.status !== 'pending') {
      throw new Error('Approval request already processed');
    }

    // Get current user
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
      throw new Error('User not authenticated');
    }

    // Verify user is the approver
    if (user.email !== approval.approver_email) {
      throw new Error('User is not authorized to approve this request');
    }

    const now = new Date().toISOString();

    if (action === 'approve') {
      // Update approval status
      const { error: updateError } = await supabaseClient
        .from('AutomationApproval')
        .update({
          status: 'approved',
          approved_by: user.email,
          approved_at: now,
        })
        .eq('id', approvalId);

      if (updateError) throw updateError;

      // Execute the action
      const actionConfig = approval.action_config;
      const actionType = approval.action_type;

      let executionResult = { success: false, message: '' };

      switch (actionType) {
        case 'send_email':
          executionResult = await executeSendEmail(supabaseClient, actionConfig, approval);
          break;
        
        case 'create_task':
          executionResult = await executeCreateTask(supabaseClient, actionConfig, approval);
          break;
        
        case 'create_deadline':
          executionResult = await executeCreateDeadline(supabaseClient, actionConfig, approval);
          break;
        
        case 'billing':
          executionResult = await executeCreateBilling(supabaseClient, actionConfig, approval);
          break;
        
        case 'calendar_event':
          executionResult = await executeCreateCalendar(supabaseClient, actionConfig, approval);
          break;
        
        default:
          executionResult = { success: false, message: `Unknown action type: ${actionType}` };
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Approval processed and action executed',
          executionResult 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } else if (action === 'reject') {
      // Update approval status
      const { error: updateError } = await supabaseClient
        .from('AutomationApproval')
        .update({
          status: 'rejected',
          approved_by: user.email,
          approved_at: now,
          rejection_reason: reason || 'No reason provided',
        })
        .eq('id', approvalId);

      if (updateError) throw updateError;

      return new Response(
        JSON.stringify({ success: true, message: 'Approval rejected' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } else {
      throw new Error('Invalid action. Must be "approve" or "reject"');
    }

  } catch (error) {
    console.error('Error in handleApprovalWorkflow:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

// Execute send email action
async function executeSendEmail(supabase: any, config: any, approval: any) {
  try {
    const { error } = await supabase.functions.invoke('sendEmail', {
      body: {
        to: config.to,
        subject: config.subject,
        body: config.body,
        case_id: approval.case_id,
        mail_id: approval.mail_id,
      },
    });

    if (error) throw error;
    return { success: true, message: 'Email sent successfully' };
  } catch (error) {
    console.error('Error sending email:', error);
    return { success: false, message: error.message };
  }
}

// Execute create task action
async function executeCreateTask(supabase: any, config: any, approval: any) {
  try {
    const { error } = await supabase
      .from('Task')
      .insert({
        title: config.title,
        description: config.description,
        case_id: approval.case_id,
        due_date: config.due_date,
        assigned_to: config.assigned_to,
        priority: config.priority || 'medium',
        status: 'pending',
      });

    if (error) throw error;
    return { success: true, message: 'Task created successfully' };
  } catch (error) {
    console.error('Error creating task:', error);
    return { success: false, message: error.message };
  }
}

// Execute create deadline action
async function executeCreateDeadline(supabase: any, config: any, approval: any) {
  try {
    const { error } = await supabase
      .from('Deadline')
      .insert({
        title: config.title,
        description: config.description,
        case_id: approval.case_id,
        due_date: config.due_date,
        deadline_type: config.deadline_type || 'general',
        status: 'active',
      });

    if (error) throw error;
    return { success: true, message: 'Deadline created successfully' };
  } catch (error) {
    console.error('Error creating deadline:', error);
    return { success: false, message: error.message };
  }
}

// Execute billing action
async function executeCreateBilling(supabase: any, config: any, approval: any) {
  try {
    // Get case details for hourly rate
    let hourlyRate = config.hourly_rate || 800;
    
    if (approval.case_id) {
      const { data: caseData } = await supabase
        .from('Case')
        .select('hourly_rate, client_id')
        .eq('id', approval.case_id)
        .single();
      
      if (caseData?.hourly_rate) {
        hourlyRate = caseData.hourly_rate;
      } else if (caseData?.client_id) {
        const { data: clientData } = await supabase
          .from('Client')
          .select('hourly_rate')
          .eq('id', caseData.client_id)
          .single();
        
        if (clientData?.hourly_rate) {
          hourlyRate = clientData.hourly_rate;
        }
      }
    }

    const totalAmount = config.hours * hourlyRate;

    const { error } = await supabase
      .from('TimeEntry')
      .insert({
        case_id: approval.case_id,
        description: config.description,
        hours: config.hours,
        hourly_rate: hourlyRate,
        total_amount: totalAmount,
        date: new Date().toISOString().split('T')[0],
        billable: true,
      });

    if (error) throw error;
    return { success: true, message: 'Billing entry created successfully', totalAmount };
  } catch (error) {
    console.error('Error creating billing:', error);
    return { success: false, message: error.message };
  }
}

// Execute calendar event action
async function executeCreateCalendar(supabase: any, config: any, approval: any) {
  try {
    // This would call Google Calendar API
    // For now, just log it
    console.log('Calendar event creation:', config);
    return { success: true, message: 'Calendar event feature coming soon' };
  } catch (error) {
    console.error('Error creating calendar event:', error);
    return { success: false, message: error.message };
  }
}
