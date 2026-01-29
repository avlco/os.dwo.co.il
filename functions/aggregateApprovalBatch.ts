// @ts-nocheck
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ========================================
// 1. CRYPTO ENGINE
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

async function generateApprovalToken(payload, secret) {
  const tokenPayload = {
    ...payload,
    exp: Date.now() + (60 * 60 * 1000), 
    nonce: crypto.randomUUID()
  };
  
  const payloadString = JSON.stringify(tokenPayload);
  const encodedPayload = base64UrlEncodeString(payloadString);
  const signature = await signData(encodedPayload, secret);
  
  return `${encodedPayload}.${signature}`;
}

// ========================================
// 2. EMAIL DESIGN SYSTEM
// ========================================

const BRAND = {
  colors: {
    primary: '#b62f12',    
    secondary: '#545454',  
    bg: '#f3f4f6',         
    card: '#ffffff',       
    text: '#000000',       
    textLight: '#545454',  
    link: '#b62f12',       
    success: '#10b981',    
    danger: '#ef4444'      
  },
  logoUrl: 'https://dwo.co.il/wp-content/uploads/2020/04/Drori-Stav-logo-2.png', 
  appUrl: 'https://os.dwo.co.il'
};

function generateEmailLayout(contentHtml, title, language = 'he') {
  const dir = language === 'he' ? 'rtl' : 'ltr';
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
          <p style="margin: 0 0 10px 0;">DWO - משרד עורכי דין | www.dwo.co.il</p>
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
  const title = isHebrew ? `אישור נדרש: ${batch.automation_rule_name}` : `Approval Required`;
  
  const actionsList = (batch.actions_current || []).map(action => {
    const type = action.action_type || action.action || 'unknown';
    const config = action.config || {};
    let icon = '⚡';
    let desc = type;
    
    if (type === 'send_email') { icon = '📧'; desc = 'שליחת מייל'; }
    if (type === 'create_task') { icon = '✅'; desc = 'יצירת משימה'; }
    if (type === 'billing') { icon = '💰'; desc = 'חיוב שעות'; }
    if (type === 'save_file') { icon = '💾'; desc = 'שמירת קבצים'; }
    if (type === 'calendar_event') { icon = '📅'; desc = 'פגישה ביומן'; }

    return `
      <div style="background: #f8f9fa; padding: 12px; margin-bottom: 10px; border-radius: 6px; border-${align}: 4px solid ${BRAND.colors.primary}; text-align: ${align};">
        <div style="font-weight: bold; color: ${BRAND.colors.text}; font-size: 15px;">${icon} ${desc}</div>
        <div style="color: ${BRAND.colors.textLight}; font-size: 13px; margin-top: 4px;">${JSON.stringify(config).substring(0, 100)}...</div>
      </div>
    `;
  }).join('');

  const btnBase = `display: inline-block; padding: 12px 24px; color: #ffffff !important; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 5px; font-size: 14px;`;
  
  return generateEmailLayout(`
    <h2 style="color: ${BRAND.colors.primary}; text-align: center;">${title}</h2>
    
    <div style="background-color: #ffffff; padding: 5px;">
      <table style="width: 100%; margin-bottom: 20px;">
        <tr>
          <td><strong>נושא:</strong> ${batch.mail_subject || '-'}</td>
        </tr>
        <tr>
          <td><strong>מאת:</strong> ${batch.mail_from || '-'}</td>
        </tr>
        ${caseName ? `<tr><td><strong>תיק:</strong> ${caseName}</td></tr>` : ''}
      </table>
      
      <h3>פעולות ממתינות לאישור:</h3>
      ${actionsList}
      
      <div style="text-align: center; margin-top: 35px;">
        <a href="${approveUrl}" style="${btnBase} background-color: ${BRAND.colors.success};">✅ אישור</a>
        <a href="${editUrl}" style="${btnBase} background-color: #3b82f6;">✏️ עריכה</a>
        <a href="${rejectUrl}" style="${btnBase} background-color: ${BRAND.colors.secondary};">🛑 ביטול</a>
      </div>
    </div>
  `, title, language);
}

// ==========================================
// 4. MAIN FUNCTION LOGIC
// ==========================================
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const base44 = createClientFromRequest(req);
    const { mailId, actionsToApprove, extractedInfo, userId } = await req.json();
    
    if (!mailId || !actionsToApprove?.length) {
      return new Response(JSON.stringify({ success: true, message: 'No actions' }), { headers: corsHeaders });
    }

    const normalizedActions = actionsToApprove.map((action, index) => ({
    ...action,
    action_type: action.action_type || action.action || 'unknown',
    idempotency_key: action.idempotency_key || `${mailId}_${index}_${Date.now()}`,
    enabled: action.enabled !== undefined ? action.enabled : true
}));

    const mail = await base44.entities.Mail.get(mailId);
    if (!mail) throw new Error(`Mail not found: ${mailId}`);

    const actionsByApprover = {};
    for (const action of normalizedActions) {
      const approverEmail = (action.approver_email || '').toLowerCase();
      if (approverEmail) {
        if (!actionsByApprover[approverEmail]) actionsByApprover[approverEmail] = [];
        actionsByApprover[approverEmail].push(action);
      }
    }

    const createdBatches = [];

    for (const [approverEmail, approverActions] of Object.entries(actionsByApprover)) {
      try {
        const firstAction = approverActions[0];
        const existingBatches = await base44.asServiceRole.entities.ApprovalBatch.filter({
          mail_id: mailId, approver_email: approverEmail, status: { $in: ['pending', 'editing'] }
        });

        let batch;
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

        if (existingBatches && existingBatches.length > 0) {
          batch = existingBatches[0];
          await base44.asServiceRole.entities.ApprovalBatch.update(batch.id, {
            actions_current: approverActions, expires_at: expiresAt.toISOString(), user_id: userId || batch.user_id
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
            user_id: userId
          });
        }

        const secret = Deno.env.get('APPROVAL_HMAC_SECRET');
        if (!secret) throw new Error('Missing APPROVAL_HMAC_SECRET');

        const appUrl = Deno.env.get('APP_BASE_URL') || 'https://dwo.base44.app';
        const functionsBase = `${appUrl}/functions/v1`;

        const approveToken = await generateApprovalToken({ batch_id: batch.id, approver_email: approverEmail, action: 'approve' }, secret);
        const rejectToken = await generateApprovalToken({ batch_id: batch.id, approver_email: approverEmail, action: 'reject' }, secret);

        // 🔥 FIX: TRYING LOWERCASE (FLATTENED) NAMES FOR ROUTING
        // Since CamelCase and KebabCase failed, Lowercase is the next logical standard for Deno deployments
        const approveUrl = `${functionsBase}/approveautomationbatchpublic?token=${approveToken}`;
        const rejectUrl = `${functionsBase}/rejectautomationbatchpublic?token=${rejectToken}`;
        const editUrl = `${appUrl}/ApprovalBatchEdit?batchId=${batch.id}`;

        let caseName = null;
        if (batch.case_id) {
           try { const c = await base44.entities.Case.get(batch.case_id); caseName = c?.case_number; } catch(e){}
        }

        const emailHtml = renderApprovalEmail({
          batch: { ...batch, actions_current: batch.actions_current },
          approveUrl, rejectUrl, editUrl, language: 'he', caseName
        });

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