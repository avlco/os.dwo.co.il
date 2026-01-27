// @ts-nocheck
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ==========================================
// INTERNAL HELPER: EMAIL TEMPLATE GENERATOR
// (הוטמע כאן כדי למנוע בעיות תלות בקבצים חיצוניים)
// ==========================================
function renderApprovalEmail({ batch, approveUrl, editUrl, language = 'he', caseName, clientName }) {
  const isHebrew = language === 'he';
  const dir = isHebrew ? 'rtl' : 'ltr';
  const align = isHebrew ? 'right' : 'left';
  
  const title = isHebrew 
    ? `אישור נדרש: ${batch.automation_rule_name}`
    : `Approval Required: ${batch.automation_rule_name}`;
    
  const contextText = [];
  if (caseName) contextText.push(isHebrew ? `תיק: ${caseName}` : `Case: ${caseName}`);
  if (clientName) contextText.push(isHebrew ? `לקוח: ${clientName}` : `Client: ${clientName}`);
  
  const actionsList = (batch.actions_current || []).map(action => {
    let icon = '⚡';
    let desc = action.action_type;
    let details = '';
    
    // שליפת פרטים רלוונטיים להצגה במייל
    const config = action.config || {};
    
    switch(action.action_type) {
      case 'send_email':
        icon = '📧';
        desc = isHebrew ? 'שליחת מייל' : 'Send Email';
        details = config.to || '';
        break;
      case 'create_task':
        icon = '✅';
        desc = isHebrew ? 'יצירת משימה' : 'Create Task';
        details = config.title || '';
        break;
      case 'billing':
        icon = '💰';
        desc = isHebrew ? 'חיוב' : 'Billing';
        details = `${config.hours || 0}h @ ${config.rate || config.hourly_rate || 0}`;
        break;
      case 'save_file':
        icon = '💾';
        desc = isHebrew ? 'שמירת קבצים' : 'Save Files';
        details = config.path || '';
        break;
      case 'calendar_event':
        icon = '📅';
        desc = isHebrew ? 'פגישה ביומן' : 'Calendar Event';
        details = config.title || config.title_template || '';
        break;
    }
    
    return `
      <div style="background: #f8f9fa; padding: 10px; margin-bottom: 8px; border-radius: 6px; border-${align}: 4px solid #3b82f6;">
        <div style="font-weight: bold;">${icon} ${desc}</div>
        <div style="color: #666; font-size: 0.9em;">${details}</div>
      </div>
    `;
  }).join('');

  return `
    <!DOCTYPE html>
    <html lang="${language}" dir="${dir}">
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { text-align: center; margin-bottom: 30px; }
        .card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }
        .btn { display: inline-block; padding: 12px 24px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; margin-top: 20px; }
        .meta { color: #6b7280; font-size: 0.875rem; margin-bottom: 20px; border-bottom: 1px solid #e5e7eb; padding-bottom: 15px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h2>${title}</h2>
        </div>
        
        <div class="card">
          <div class="meta">
            <div><strong>${isHebrew ? 'נושא המייל' : 'Mail Subject'}:</strong> ${batch.mail_subject}</div>
            <div><strong>${isHebrew ? 'מאת' : 'From'}:</strong> ${batch.mail_from}</div>
            ${contextText.length > 0 ? `<div style="margin-top: 8px; color: #4b5563;">${contextText.join(' | ')}</div>` : ''}
          </div>
          
          <h3 style="margin-top: 0;">${isHebrew ? 'פעולות ממתינות לאישור' : 'Actions Pending Approval'}</h3>
          ${actionsList}
          
          <div style="text-align: center; margin-top: 30px;">
            <a href="${editUrl}" class="btn">${isHebrew ? 'סקירה ואישור במערכת' : 'Review & Approve'}</a>
            <p style="font-size: 0.8rem; color: #9ca3af; margin-top: 15px;">
              ${isHebrew ? 'לחיצה תוביל למסך עריכה ואישור מרוכז' : 'Link leads to batch review screen'}
            </p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
}

// ==========================================
// MAIN FUNCTION LOGIC
// ==========================================
Deno.serve(async (req) => {
  console.log(`[AggregateApproval] 🚀 Function invoked`);
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const base44 = createClientFromRequest(req);
    const { mailId, actionsToApprove, extractedInfo } = await req.json();
    
    console.log(`[AggregateApproval] 📥 Received: mailId=${mailId}, actions=${actionsToApprove?.length}`);

    if (!mailId || !Array.isArray(actionsToApprove) || actionsToApprove.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          batches_created: 0,
          message: 'No actions to approve'
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch mail details
    const mail = await base44.entities.Mail.get(mailId);
    if (!mail) {
      throw new Error(`Mail not found: ${mailId}`);
    }

    // Group actions by approver_email
    const actionsByApprover = {};
    for (const action of actionsToApprove) {
      const approverEmail = action.approver_email;
      if (!approverEmail) {
        console.warn('[AggregateApproval] ⚠️ Action without approver_email - skipping');
        continue;
      }

      if (!actionsByApprover[approverEmail]) {
        actionsByApprover[approverEmail] = [];
      }
      actionsByApprover[approverEmail].push(action);
    }

    const createdBatches = [];

    // Create/Update batch for each approver
    for (const [approverEmail, approverActions] of Object.entries(actionsByApprover)) {
      try {
        console.log(`[AggregateApproval] ✉️ Processing for approver: ${approverEmail}`);

        const firstAction = approverActions[0];
        const ruleId = firstAction.rule_id;
        const ruleName = firstAction.rule_name;

        // Check if batch already exists
        const existingBatches = await base44.asServiceRole.entities.ApprovalBatch.filter({
          mail_id: mailId,
          approver_email: approverEmail,
          status: { $in: ['pending', 'editing'] }
        });

        let batch;
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 60 minutes

        if (existingBatches && existingBatches.length > 0) {
          // Update existing
          batch = existingBatches[0];
          console.log(`[AggregateApproval] 🔄 Updating existing batch: ${batch.id}`);

          const existingActions = batch.actions_current || [];
          const mergedActions = [...existingActions];

          for (const newAction of approverActions) {
            const exists = mergedActions.some(a => a.idempotency_key === newAction.idempotency_key);
            if (!exists) mergedActions.push(newAction);
          }

          await base44.asServiceRole.entities.ApprovalBatch.update(batch.id, {
            actions_current: mergedActions,
            expires_at: expiresAt.toISOString()
          });
          
          // Refetch to get updated data for email
          batch = await base44.asServiceRole.entities.ApprovalBatch.get(batch.id);
        } else {
          // Create new
          console.log(`[AggregateApproval] ➕ Creating NEW batch`);
          const actionsWithKeys = approverActions.map((action, index) => ({
            ...action,
            idempotency_key: action.idempotency_key || `${Date.now()}_${index}_${action.action_type}`
          }));

          batch = await base44.asServiceRole.entities.ApprovalBatch.create({
            status: 'pending',
            automation_rule_id: ruleId,
            automation_rule_name: ruleName,
            mail_id: mailId,
            mail_subject: mail.subject,
            mail_from: mail.sender_email,
            case_id: extractedInfo?.case_id || null,
            client_id: extractedInfo?.client_id || null,
            approver_email: approverEmail,
            expires_at: expiresAt.toISOString(),
            catch_snapshot: firstAction.catch_snapshot || {},
            map_snapshot: firstAction.map_snapshot || [],
            extracted_info: extractedInfo || {},
            actions_original: actionsWithKeys,
            actions_current: JSON.parse(JSON.stringify(actionsWithKeys))
          });
        }

        // Send Email
        try {
          const appUrl = Deno.env.get('APP_BASE_URL') || 'https://app.base44.com';
          const editUrl = `${appUrl}/ApprovalBatchEdit?batchId=${batch.id}`;

          let language = 'he';
          // Simple language detection logic based on client/case could go here
          
          let caseName = null;
          let clientName = null;
          if (batch.case_id) {
             try {
                const c = await base44.entities.Case.get(batch.case_id);
                caseName = c?.case_number || c?.title;
             } catch(e) {}
          }
          if (batch.client_id) {
             try {
                const c = await base44.entities.Client.get(batch.client_id);
                clientName = c?.name;
             } catch(e) {}
          }

          // Use the INTERNAL helper function
          const emailHtml = renderApprovalEmail({
            batch: {
              id: batch.id,
              automation_rule_name: batch.automation_rule_name,
              mail_subject: batch.mail_subject,
              mail_from: batch.mail_from,
              actions_current: batch.actions_current
            },
            approveUrl: null,
            editUrl,
            language,
            caseName,
            clientName
          });

          const subject = `אישור נדרש: ${batch.automation_rule_name} (${batch.actions_current.length} פעולות)`;

          await base44.functions.invoke('sendEmail', {
            to: approverEmail,
            subject,
            body: emailHtml
          });

          console.log(`[AggregateApproval] ✅ Email sent to ${approverEmail}`);
        } catch (emailError) {
          console.error('[AggregateApproval] ❌ Failed to send email:', emailError);
        }

        createdBatches.push({ batch_id: batch.id, approver: approverEmail });

      } catch (e) {
        console.error(`[AggregateApproval] ❌ Error processing approver ${approverEmail}:`, e);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        batches_created: createdBatches.length,
        batches: createdBatches
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[AggregateApproval] ❌ Critical Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});