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

    const { action, activityId, reason } = await req.json();

    // Get approval activity
    const { data: activity, error: fetchError } = await supabaseClient
      .from('Activity')
      .select('*')
      .eq('id', activityId)
      .eq('activity_type', 'approval_request')
      .single();

    if (fetchError || !activity) {
      throw new Error('Approval request not found');
    }

    // Check if already processed
    if (activity.status === 'completed' || activity.status === 'cancelled') {
      throw new Error('Approval request already processed');
    }

    // Get current user
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
      throw new Error('User not authenticated');
    }

    // Parse metadata
    const metadata = activity.metadata || {};
    
    // Verify user is the approver
    if (user.email !== metadata.approver_email) {
      throw new Error('User is not authorized to approve this request');
    }

    const now = new Date().toISOString();

    if (action === 'approve') {
      // Update activity status
      const { error: updateError } = await supabaseClient
        .from('Activity')
        .update({
          status: 'completed',
          metadata: {
            ...metadata,
            approved_by: user.email,
            approved_at: now,
            decision: 'approved',
          },
        })
        .eq('id', activityId);

      if (updateError) throw updateError;

      // Execute the action
      const actionConfig = metadata.action_config;
      const actionType = metadata.action_type;

      let executionResult = { success: false, message: '' };

      switch (actionType) {
        case 'send_email':
          executionResult = await executeSendEmail(supabaseClient, actionConfig, metadata);
          break;
        
        case 'create_task':
          executionResult = await executeCreateTask(supabaseClient, actionConfig, metadata);
          break;
        
        case 'create_deadline':
          executionResult = await executeCreateDeadline(supabaseClient, actionConfig, metadata);
          break;
        
        case 'billing':
          executionResult = await executeCreateBilling(supabaseClient, actionConfig, metadata);
          break;
        
        case 'calendar_event':
          executionResult = await executeCreateCalendar(supabaseClient, actionConfig, metadata);
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
      // Update activity status
      const { error: updateError } = await supabaseClient
        .from('Activity')
        .update({
          status: 'cancelled',
          metadata: {
            ...metadata,
            approved_by: user.email,
            approved_at: now,
            decision: 'rejected',
            rejection_reason: reason || 'No reason provided',
          },
        })
        .eq('id', activityId);

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
async function executeSendEmail(supabase, config, metadata) {
  try {
    const { error } = await supabase.functions.invoke('sendEmail', {
      body: {
        to: config.to,
        subject: config.subject,
        body: config.body,
        case_id: metadata.case_id,
        mail_id: metadata.mail_id,
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
async function executeCreateTask(supabase, config, metadata) {
  try {
    const { error } = await supabase
      .from('Task')
      .insert({
        title: config.title,
        description: config.description,
        case_id: metadata.case_id,
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
async function executeCreateDeadline(supabase, config, metadata) {
  try {
    const { error } = await supabase
      .from('Deadline')
      .insert({
        title: config.title,
        description: config.description,
        case_id: metadata.case_id,
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
async function executeCreateBilling(supabase, config, metadata) {
  try {
    let hourlyRate = config.hourly_rate || 800;
    
    if (metadata.case_id) {
      const { data: caseData } = await supabase
        .from('Case')
        .select('hourly_rate, client_id')
        .eq('id', metadata.case_id)
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
        case_id: metadata.case_id,
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
async function executeCreateCalendar(supabase, config, metadata) {
  try {
    console.log('Calendar event creation:', config);
    return { success: true, message: 'Calendar event feature coming soon' };
  } catch (error) {
    console.error('Error creating calendar event:', error);
    return { success: false, message: error.message };
  }
}
