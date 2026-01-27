// @ts-nocheck
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { renderApprovalEmail } from './utils/approvalEmailTemplates.js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
// Redeployment trigger - approvals aggregation v2

/**
 * צבירת פעולות מכל הכללים התואמים למייל יחיד
 * יצירת/עדכון באטצ' אישור אחד לכל מאשר
 * שליחת מייל אישור מאוחד יחיד
 */
Deno.serve(async (req) => {
  console.log(`[AggregateApproval] 🚀 Function invoked`);
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const base44 = createClientFromRequest(req);
    const { mailId, actionsToApprove, extractedInfo } = await req.json();
    
    console.log(`[AggregateApproval] 📥 Received: mailId=${mailId}, actionsToApprove.length=${actionsToApprove?.length}, extractedInfo=${JSON.stringify(extractedInfo)}`);

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

    console.log(`[AggregateApproval] 📦 Processing ${actionsToApprove.length} action(s) for mail ${mailId}`);

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
        console.warn('[AggregateApproval] ⚠️ Action without approver_email - rule:', action.rule_id, 'action_type:', action.action_type);
        continue;
      }

      if (!actionsByApprover[approverEmail]) {
        actionsByApprover[approverEmail] = [];
      }
      actionsByApprover[approverEmail].push(action);
    }

    console.log(`[AggregateApproval] 👥 Grouped into ${Object.keys(actionsByApprover).length} approver(s)`);

    const createdBatches = [];

    // Create/Update batch for each approver
    for (const [approverEmail, approverActions] of Object.entries(actionsByApprover)) {
      try {
        console.log(`[AggregateApproval] ✉️ Processing ${approverActions.length} action(s) for approver: ${approverEmail}`);

        // Extract rule_id and rule_name from first action
        const firstAction = approverActions[0];
        const ruleId = firstAction.rule_id;
        const ruleName = firstAction.rule_name;

        // Check if batch already exists for this mail + approver (in pending/editing)
        const existingBatches = await base44.asServiceRole.entities.ApprovalBatch.filter({
          mail_id: mailId,
          approver_email: approverEmail,
          status: { $in: ['pending', 'editing'] }
        });

        let batch;
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 60 minutes

        if (existingBatches && existingBatches.length > 0) {
          // Update existing batch
          batch = existingBatches[0];
          console.log(`[AggregateApproval] 🔄 Updating existing batch: ${batch.id} for approver ${approverEmail}`);

          // Merge actions
          const existingActions = batch.actions_current || [];
          const mergedActions = [...existingActions];

          for (const newAction of approverActions) {
            // Avoid duplicates based on idempotency_key
            const exists = mergedActions.some(
              a => a.idempotency_key === newAction.idempotency_key
            );
            if (!exists) {
              mergedActions.push(newAction);
            }
          }

          // Update batch with merged actions
          await base44.asServiceRole.entities.ApprovalBatch.update(batch.id, {
            actions_current: mergedActions,
            expires_at: expiresAt.toISOString()
          });

          batch = await base44.asServiceRole.entities.ApprovalBatch.get(batch.id);
          console.log(`[AggregateApproval] ✅ Batch updated and refetched: ${batch.id}`);
        } else {
          // Create new batch
          console.log(`[AggregateApproval] ➕ Creating NEW batch for approver ${approverEmail}`);
          const actionsWithKeys = approverActions.map((action, index) => ({
            ...action,
            idempotency_key: `${Date.now()}_${index}_${action.action_type}`
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

          console.log(`[AggregateApproval] ✅ Created batch: ${batch.id}`);
        }

        // Send approval email
        try {
          const appUrl = Deno.env.get('APP_BASE_URL') || 'https://app.base44.com';
          const editUrl = `${appUrl}/ApprovalBatchEdit?batchId=${batch.id}`;

          // Detect language
          let language = 'he';
          if (batch.client_id) {
            try {
              const client = await base44.entities.Client.get(batch.client_id);
              if (client?.communication_language === 'en') {
                language = 'en';
              }
            } catch (e) { /* ignore */ }
          }

          // Get case and client names
          let caseName = null;
          let clientName = null;

          if (batch.case_id) {
            try {
              const caseData = await base44.entities.Case.get(batch.case_id);
              caseName = caseData?.case_number || caseData?.title;
            } catch (e) { /* ignore */ }
          }

          if (batch.client_id) {
            try {
              const client = await base44.entities.Client.get(batch.client_id);
              clientName = client?.name;
            } catch (e) { /* ignore */ }
          }

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

          const subject = language === 'he'
            ? `אישור נדרש: ${batch.automation_rule_name}`
            : `Approval Required: ${batch.automation_rule_name}`;

          // Send email using the sendEmail function
          await base44.functions.invoke('sendEmail', {
            to: approverEmail,
            subject,
            body: emailHtml
          });

          console.log(`[AggregateApproval] ✅ Approval email sent to ${approverEmail}`);
        } catch (emailError) {
          console.error('[AggregateApproval] ❌ Failed to send approval email:', emailError.message, emailError.stack);
        }

        createdBatches.push({
          batch_id: batch.id,
          approver_email: approverEmail,
          actions_count: (batch.actions_current || []).length
        });

      } catch (approverError) {
        console.error(`[AggregateApproval] ❌ Failed to process approver ${approverEmail}:`, approverError);
      }
    }

    console.log(`[AggregateApproval] 📊 Complete: Created/Updated ${createdBatches.length} batch(es)`);

    return new Response(
      JSON.stringify({
        success: true,
        batches_created: createdBatches.length,
        batches: createdBatches
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[AggregateApproval] ❌ Error:', error.message, 'Stack:', error.stack);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});