// @ts-nocheck
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ========================================
// 1. CRYPTO ENGINE (Internal Implementation)
// ========================================

function base64UrlEncode(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlEncodeString(str) {
  const encoder = new TextEncoder();
  return base64UrlEncode(encoder.encode(str));
}

async function signData(data, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(data)
  );
  return base64UrlEncode(signature);
}

/**
 * Generates a secure, signed token for public endpoints
 */
async function generateApprovalToken(payload, secret) {
  const tokenPayload = {
    ...payload,
    exp: Date.now() + (60 * 60 * 1000), // 1 hour expiry
    nonce: crypto.randomUUID()
  };
  
  const payloadString = JSON.stringify(tokenPayload);
  const encodedPayload = base64UrlEncodeString(payloadString);
  const signature = await signData(encodedPayload, secret);
  
  return `${encodedPayload}.${signature}`;
}

// ========================================
// 2. DWO EMAIL DESIGN SYSTEM (INLINE CSS)
// ========================================

const BRAND = {
  colors: {
    primary: '#b62f12',    // DWO Red
    secondary: '#545454',  // DWO Dark Gray
    bg: '#f3f4f6',         // Light Grey Background
    card: '#ffffff',       // White Card
    text: '#000000',       // Black Text
    textLight: '#545454',  // Metadata Text
    link: '#b62f12',       // Link
    success: '#10b981',    // Green
    danger: '#ef4444'      // Red
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

  const s = {
    body: `margin: 0; padding: 0; background-color: ${BRAND.colors.bg}; font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;`,
    wrapper: `padding: 20px; background-color: ${BRAND.colors.bg};`,
    container: `max-width: 600px; margin: 0 auto; background-color: ${BRAND.colors.card}; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);`,
    header: `background-color: ${BRAND.colors.card}; padding: 20px; text-align: center; border-bottom: 3px solid ${BRAND.colors.primary};`,
    logo: `height: 50px; width: auto; max-width: 200px; object-fit: contain; display: block; margin: 0 auto;`,
    content: `padding: 30px 25px; color: ${BRAND.colors.text}; line-height: 1.6; font-size: 16px;`,
    footer: `background-color: #f8fafc; padding: 20px; text-align: center; font-size: 12px; color: ${BRAND.colors.textLight}; border-top: 1px solid #e2e8f0;`,
  };

  return `
<!DOCTYPE html>
<html dir="${dir}" lang="${language}">
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
        <td style="${s.content}" dir="${dir}">
          ${contentHtml}
        </td>
      </tr>
      <tr>
        <td style="${s.footer}" dir="${dir}">
          <p style="margin: 0 0 10px 0;">${t.footer_contact}</p>
          <p style="margin: 0; opacity: 0.7;">${t.footer_disclaimer}</p>
        </td>
      </tr>
    </table>
  </div>
</body>
</html>`.trim();
}

// ==========================================
// 3. RENDER LOGIC
// ==========================================
function renderApprovalEmail({ batch, approveUrl, rejectUrl, editUrl, language = 'he', caseName }) {
  const isHebrew = language === 'he';
  const align = isHebrew ? 'right' : 'left';
  
  const title = isHebrew 
    ? `אישור נדרש: ${batch.automation_rule_name}`
    : `Approval Required: ${batch.automation_rule_name}`;
  
  // Build actions list
  const actionsList = (batch.actions_current || []).map(action => {
    let icon = '⚡';
    // Fix: Use normalized action_type
    const type = action.action_type || action.action || 'unknown';
    let desc = type;
    let details = '';
    
    const config = action.config || {};
    
    switch(type) {
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

  // Styles for buttons
  const btnBase = `display: inline-block; padding: 12px 24px; color: #ffffff !important; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 5px; font-size: 14px;`;
  const btnApprove = `${btnBase} background-color: ${BRAND.colors.success};`;
  const btnEdit = `${btnBase} background-color: #3b82f6;`; // Blue
  const btnReject = `${btnBase} background-color: ${BRAND.colors.secondary};`; // Gray/Red equivalent

  // Build Inner Content
  const innerContent = `
    <h2 style="color: ${BRAND.colors.primary}; margin-top: 0; text-align: center; margin-bottom: 25px;">${title}</h2>
    
    <div style="background-color: #ffffff; padding: 5px;">
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 14px;">
        <tr>
          <td style="color: ${BRAND.colors.textLight}; width: 100px; padding: 5px 0; border-bottom: 1px solid #f0f0f0;">${isHebrew ? 'נושא המייל' : 'Subject'}:</td>
          <td style="font-weight: 600; color: ${BRAND.colors.text}; padding: 5px 0; border-bottom: 1px solid #f0f0f0;">${batch.mail_subject || '-'}</td>
        </tr>
        <tr>
          <td style="color: ${BRAND.colors.textLight}; padding: 5px 0; border-bottom: 1px solid #f0f0f0;">${isHebrew ? 'מאת' : 'From'}:</td>
          <td style="font-weight: 600; color: ${BRAND.colors.text}; padding: 5px 0; border-bottom: 1px solid #f0f0f0;">${batch.mail_from || '-'}</td>
        </tr>
        ${caseName ? `
        <tr>
          <td style="color: ${BRAND.colors.textLight}; padding: 5px 0; border-bottom: 1px solid #f0f0f0;">${isHebrew ? 'תיק' : 'Case'}:</td>
          <td style="font-weight: 600; color: ${BRAND.colors.text}; padding: 5px 0; border-bottom: 1px solid #f0f0f0;">${caseName}</td>
        </tr>` : ''}
      </table>
      
      <h3 style="color: ${BRAND.colors.secondary}; font-size: 16px; margin-top: 20px; border-bottom: 1px solid #eee; padding-bottom: 5px; text-align: ${align};">
        ${isHebrew ? 'פעולות ממתינות לאישור' : 'Actions Pending Approval'}
      </h3>
      
      ${actionsList}
      
      <div style="text-align: center; margin-top: 35px; margin-bottom: 20px;">
        <a href="${approveUrl}" style="${btnApprove}">✅ אישור</a>
        <a href="${editUrl}" style="${btnEdit}">✏️ עריכה</a>
        <a href="${rejectUrl}" style="${btnReject}">🛑 ביטול</a>
        
        <p style="font-size: 12px; color: ${BRAND.colors.textLight}; margin-top: 15px;">
          * אישור וביטול הם פעולות מיידיות. עריכה דורשת כניסה למערכת.
        </p>
      </div>
    </div>
  `;

  return generateEmailLayout(innerContent, title, language);
}

// ==========================================
// 4. MAIN FUNCTION LOGIC
// ==========================================
Deno.serve(async (req) => {
  console.log(`[AggregateApproval] 🚀 Function invoked`);
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const base44 = createClientFromRequest(req);
    // 1. RECEIVE userId
    const { mailId, actionsToApprove, extractedInfo, userId } = await req.json();
    
    if (!mailId || !Array.isArray(actionsToApprove) || actionsToApprove.length === 0) {
      return new Response(JSON.stringify({ success: true, message: 'No actions' }), { headers: corsHeaders });
    }

    // 2. DATA NORMALIZATION
    const normalizedActions = actionsToApprove.map((action, index) => ({
      ...action,
      action_type: action.action_type || action.action || 'unknown',
      idempotency_key: action.idempotency_key || `${mailId}_${index}_${Date.now()}`
    }));

    const mail = await base44.entities.Mail.get(mailId);
    if (!mail) throw new Error(`Mail not found: ${mailId}`);

    // Group by approver
    const actionsByApprover = {};
    for (const action of normalizedActions) {
      // NORMALIZE EMAIL TO LOWERCASE
      const approverEmail = (action.approver_email || '').toLowerCase();
      if (approverEmail) {
        if (!actionsByApprover[approverEmail]) actionsByApprover[approverEmail] = [];
        actionsByApprover[approverEmail].push(action);
      }
    }

    const createdBatches = [];

    // Process each approver
    for (const [approverEmail, approverActions] of Object.entries(actionsByApprover)) {
      try {
        const firstAction = approverActions[0];
        
        // 3. CREATE / UPDATE BATCH
        const existingBatches = await base44.asServiceRole.entities.ApprovalBatch.filter({
          mail_id: mailId,
          approver_email: approverEmail,
          status: { $in: ['pending', 'editing'] }
        });

        let batch;
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

        if (existingBatches && existingBatches.length > 0) {
          batch = existingBatches[0];
          await base44.asServiceRole.entities.ApprovalBatch.update(batch.id, {
            actions_current: approverActions,
            expires_at: expiresAt.toISOString(),
            user_id: userId || batch.user_id // Ensure userId is updated if missing
          });
          batch.actions_current = approverActions;
        } else {
          batch = await base44.asServiceRole.entities.ApprovalBatch.create({
            status: 'pending',
            automation_rule_id: firstAction.rule_id,
            automation_rule_name: firstAction.rule_name,
            mail_id: mailId,
            mail_subject: mail.subject,
            mail_from: mail.sender_email,
            case_id: extractedInfo?.case_id || null,
            client_id: extractedInfo?.client_id || null,
            approver_email: approverEmail,
            expires_at: expiresAt.toISOString(),
            extracted_info: extractedInfo || {},
            actions_original: approverActions,
            actions_current: approverActions,
            user_id: userId // <--- CRITICAL: Saves user ownership
          });
        }

        // 4. GENERATE TOKENS AND LINKS (CORRECTED URLs)
        const secret = Deno.env.get('APPROVAL_HMAC_SECRET');
        if (!secret) {
          console.error('CRITICAL: APPROVAL_HMAC_SECRET is missing');
          throw new Error('Server configuration error');
        }

        const appUrl = Deno.env.get('APP_BASE_URL') || 'https://dwo.base44.app';
        const functionsBase = `${appUrl}/functions/v1`;

        const approveToken = await generateApprovalToken({ batch_id: batch.id, approver_email: approverEmail, action: 'approve' }, secret);
        const rejectToken = await generateApprovalToken({ batch_id: batch.id, approver_email: approverEmail, action: 'reject' }, secret);

        // 🔥 FIX: USING KEBAB-CASE FOR PUBLIC ENDPOINTS
       const approveUrl = `${functionsBase}/approve-automation-batch-public?token=${approveToken}`;
       const rejectUrl = `${functionsBase}/reject-automation-batch-public?token=${rejectToken}`;
        const editUrl = `${appUrl}/ApprovalBatchEdit?batchId=${batch.id}`;

        // 5. PREPARE EMAIL CONTENT
        let caseName = null;
        if (batch.case_id) {
           try { const c = await base44.entities.Case.get(batch.case_id); caseName = c?.case_number; } catch(e){}
        }

        const emailHtml = renderApprovalEmail({
          batch: {
            id: batch.id,
            automation_rule_name: batch.automation_rule_name,
            mail_subject: batch.mail_subject,
            mail_from: batch.mail_from,
            actions_current: batch.actions_current
          },
          approveUrl,
          rejectUrl,
          editUrl,
          language: 'he',
          caseName
        });

        // 6. SEND EMAIL
        await base44.functions.invoke('sendEmail', {
          to: approverEmail,
          subject: `אישור נדרש: ${batch.automation_rule_name}`,
          body: emailHtml
        });

        createdBatches.push({ batch_id: batch.id, approver: approverEmail });

      } catch (e) {
        console.error(`Error processing batch for ${approverEmail}:`, e);
      }
    }

    return new Response(JSON.stringify({ success: true, batches: createdBatches }), { headers: corsHeaders });

  } catch (error) {
    console.error('Critical Error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }
});