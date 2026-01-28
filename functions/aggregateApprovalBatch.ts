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
    link: '#b62f12'        // Link
  },
  logoUrl: 'https://dwo.co.il/wp-content/uploads/2020/04/Drori-Stav-logo-2.png', 
  appUrl: 'https://os.dwo.co.il'
};

function generateEmailLayout(contentHtml, title, language = 'he') {
  const dir = language === 'he' ? 'rtl' : 'ltr';
  const t = {
    footer_contact: 'DWO - משרד עורכי דין | www.dwo.co.il',
    footer_disclaimer: 'הודעה זו מכילה מידע סודי ומוגן. אם קיבלת הודעה זו בטעות, אנא מחק אותה ודווח לשולח.'
  };

  return `
<!DOCTYPE html>
<html dir="${dir}" lang="${language}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body { margin: 0; padding: 0; background-color: ${BRAND.colors.bg}; font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
    .email-wrapper { padding: 20px; }
    .email-container { max-width: 600px; margin: 0 auto; background-color: ${BRAND.colors.card}; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }
    .header { background-color: ${BRAND.colors.card}; padding: 20px; text-align: center; border-bottom: 3px solid ${BRAND.colors.primary}; }
    .content { padding: 30px 25px; color: ${BRAND.colors.text}; line-height: 1.6; }
    .footer { background-color: #f8fafc; padding: 20px; text-align: center; font-size: 12px; color: ${BRAND.colors.textLight}; border-top: 1px solid #e2e8f0; }
    a { color: ${BRAND.colors.link}; text-decoration: none; }
    .logo { height: 50px; width: auto; max-width: 200px; object-fit: contain; }
    .btn { display: inline-block; padding: 12px 30px; background-color: ${BRAND.colors.primary}; color: #ffffff !important; text-decoration: none; border-radius: 6px; font-weight: bold; margin-top: 20px; }
    .meta-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 14px; }
    .meta-table td { padding: 5px 0; border-bottom: 1px solid #f0f0f0; }
    .meta-label { color: ${BRAND.colors.textLight}; width: 100px; }
    .meta-value { font-weight: 600; color: ${BRAND.colors.text}; }
  </style>
</head>
<body dir="${dir}">
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

// ==========================================
// INTERNAL HELPER: EMAIL TEMPLATE RENDERER
// ==========================================
function renderApprovalEmail({ batch, approveUrl, editUrl, language = 'he', caseName, clientName }) {
  const isHebrew = language === 'he';
  const align = isHebrew ? 'right' : 'left';
  
  const title = isHebrew 
    ? `אישור נדרש: ${batch.automation_rule_name}`
    : `Approval Required: ${batch.automation_rule_name}`;
  
  // Build actions list with new branding
  const actionsList = (batch.actions_current || []).map(action => {
    let icon = '⚡';
    let desc = action.action_type;
    let details = '';
    
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
        desc = isHebrew ? 'חיוב שעות' : 'Billing';
        details = `${config.hours || 0}h @ ${config.rate || config.hourly_rate || 0} ₪`;
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
      <div style="background: #f8f9fa; padding: 12px; margin-bottom: 10px; border-radius: 6px; border-${align}: 4px solid ${BRAND.colors.primary}; text-align: ${align};">
        <div style="font-weight: bold; color: ${BRAND.colors.text}; font-size: 15px;">${icon} ${desc}</div>
        <div style="color: ${BRAND.colors.textLight}; font-size: 13px; margin-top: 4px;">${details}</div>
      </div>
    `;
  }).join('');

  // Build Inner Content
  const innerContent = `
    <h2 style="color: ${BRAND.colors.primary}; margin-top: 0; text-align: center; margin-bottom: 25px;">${title}</h2>
    
    <div style="background-color: #ffffff; padding: 5px;">
      <table class="meta-table" role="presentation">
        <tr>
          <td class="meta-label">${isHebrew ? 'נושא המייל' : 'Subject'}:</td>
          <td class="meta-value">${batch.mail_subject || '-'}</td>
        </tr>
        <tr>
          <td class="meta-label">${isHebrew ? 'מאת' : 'From'}:</td>
          <td class="meta-value">${batch.mail_from || '-'}</td>
        </tr>
        ${caseName ? `
        <tr>
          <td class="meta-label">${isHebrew ? 'תיק' : 'Case'}:</td>
          <td class="meta-value">${caseName}</td>
        </tr>` : ''}
        ${clientName ? `
        <tr>
          <td class="meta-label">${isHebrew ? 'לקוח' : 'Client'}:</td>
          <td class="meta-value">${clientName}</td>
        </tr>` : ''}
      </table>
      
      <h3 style="color: ${BRAND.colors.secondary}; font-size: 16px; margin-top: 20px; border-bottom: 1px solid #eee; padding-bottom: 5px; text-align: ${align};">
        ${isHebrew ? 'פעולות ממתינות לאישור' : 'Actions Pending Approval'}
      </h3>
      
      ${actionsList}
      
      <div style="text-align: center; margin-top: 35px; margin-bottom: 20px;">
        <a href="${editUrl}" class="btn">${isHebrew ? 'סקירה ואישור במערכת' : 'Review & Approve'}</a>
        <p style="font-size: 13px; color: ${BRAND.colors.textLight}; margin-top: 15px;">
          ${isHebrew ? 'לחיצה תוביל למסך עריכה ואישור מרוכז' : 'Link leads to batch review screen'}
        </p>
      </div>
    </div>
  `;

  return generateEmailLayout(innerContent, title, language);
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

        let mapSnapshotDict = {};
        if (Array.isArray(firstAction.map_snapshot)) {
            mapSnapshotDict = { rules: firstAction.map_snapshot };
        } else if (firstAction.map_snapshot && typeof firstAction.map_snapshot === 'object') {
            mapSnapshotDict = firstAction.map_snapshot;
        }

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
            map_snapshot: mapSnapshotDict,
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

          // Use the embedded render function with new design
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

          // Using invoke 'sendEmail' ensures we use the proper Gmail integration
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
        success: createdBatches.length > 0,
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