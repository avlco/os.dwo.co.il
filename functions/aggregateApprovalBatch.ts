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
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  return base64UrlEncode(signature);
}

async function generateApprovalToken(payload, secret) {
  const tokenPayload = {
    ...payload,
    exp: Date.now() + 60 * 60 * 1000,
    nonce: crypto.randomUUID(),
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
    danger: '#ef4444',
  },
  logoUrl: 'https://dwo.co.il/wp-content/uploads/2020/04/Drori-Stav-logo-2.png',
  appUrl: 'https://os.dwo.co.il',
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

function escapeHtml(value) {
  if (value === undefined || value === null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function isPresent(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === 'number') return true;
  if (typeof value === 'boolean') return true;
  return String(value).trim() !== '';
}

function stripHtml(html) {
  if (!html) return '';
  return String(html).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function truncateText(text, maxLen = 220) {
  if (!isPresent(text)) return '';
  const s = String(text);
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen).trim() + '…';
}

function toList(value) {
  if (!isPresent(value)) return [];
  if (Array.isArray(value)) return value;
  return [value];
}

function formatList(value) {
  const arr = toList(value)
    .map((v) => {
      if (v && typeof v === 'object') return v.email || v.name || JSON.stringify(v);
      return String(v);
    })
    .map((s) => s.trim())
    .filter(Boolean);

  return arr.join(', ');
}

function yesNo(value, language) {
  const isHebrew = language === 'he';
  return value ? (isHebrew ? 'כן' : 'Yes') : (isHebrew ? 'לא' : 'No');
}

function renderRow({ label, value, align }) {
  if (!isPresent(value)) return '';
  return `
    <div style="margin-top: 6px; font-size: 13px; color: #111827; text-align: ${align};">
      <span style="font-weight: 700;">${escapeHtml(label)}:</span>
      <span style="color: #4b5563;"> ${escapeHtml(value)}</span>
    </div>
  `;
}

function translateExecutionTime(value, language) {
  if (!isPresent(value)) return '';
  const v = String(value);
  if (v === 'automation_rules.execution_time') {
    return language === 'he' ? 'שעת ביצוע' : 'Execution time';
  }
  if (v.includes('.')) {
    const last = v.split('.').pop();
    return last.replace(/_/g, ' ');
  }
  return v;
}

function renderApprovalEmail({
  batch,
  approveUrl,
  rejectUrl,
  editUrl,
  language = 'he',
  caseNumber,
  caseTitle,
  clientName,
  clientCommunicationLanguage = 'he',
}) {
  const isHebrew = language === 'he';
  const align = isHebrew ? 'right' : 'left';
  const title = isHebrew ? `אישור נדרש: ${batch.automation_rule_name}` : `Approval Required`;

  // Determine if the CLIENT will receive content in English (based on their preference)
  const clientWillReceiveEnglish = clientCommunicationLanguage === 'en';

  const actionsList = (batch.actions_current || [])
    .map((action) => {
      const type = action.action_type || action.action || 'unknown';
      const config = action.config || {};
      
      // Check if this specific action has English enabled AND client prefers English
      const actionUsesEnglish = config.language === 'en' || (config.enable_english && clientWillReceiveEnglish);

      let icon = '⚡';
      let desc = type;

      // Set icon and description based on type
      if (type === 'send_email') {
        icon = '📧';
        desc = isHebrew ? 'שליחת מייל' : 'Send email';
      } else if (type === 'create_task') {
        icon = '✅';
        desc = isHebrew ? 'יצירת משימה' : 'Create task';
      } else if (type === 'billing') {
        icon = '💰';
        desc = isHebrew ? 'חיוב שעות' : 'Billable hours';
      } else if (type === 'save_file') {
        icon = '💾';
        desc = isHebrew ? 'שמירת קבצים ב-Dropbox' : 'Save files to Dropbox';
      } else if (type === 'calendar_event') {
        icon = '📅';
        desc = isHebrew ? 'אירוע ביומן' : 'Calendar event';
      } else if (type === 'create_alert') {
        icon = '⏰';
        desc = isHebrew ? 'התרעה / דוקטינג' : 'Alert / Docketing';
      }

      const isDocketing =
        type === 'docketing' ||
        type === 'alert' ||
        type === 'docking' ||
        type === 'docketing_alert';

      if (isDocketing) {
        icon = '⏰';
        desc = isHebrew ? 'התרעה / דוקטינג' : 'Alert / docketing';
      }

      const timing =
        config.timing ||
        config.schedule ||
        config.scheduled_for ||
        config.start_date ||
        config.date;

      const timeRaw =
        config.time ||
        config.execution_time ||
        config.execution_time_value ||
        config.hour ||
        config.time_of_day;

      const timeValue = translateExecutionTime(timeRaw, language);
      
      // Language indicator for approval email
      const langIndicator = actionUsesEnglish 
        ? (isHebrew ? '🇬🇧 אנגלית' : '🇬🇧 English')
        : (isHebrew ? '🇮🇱 עברית' : '🇮🇱 Hebrew');

      // 1) חיוב שעות (billing)
      if (type === 'billing') {
        const hours = config.hours;
        const rate = config.rate ?? config.hourly_rate;
        const descText = config.description || config.desc || config.notes;

        const total =
          isPresent(hours) && isPresent(rate)
            ? parseFloat(hours) * parseFloat(rate)
            : null;

        const totalText =
          isPresent(total) && !Number.isNaN(total) ? `₪${total.toFixed(2)}` : '';

        return `
          <div style="background: #f8f9fa; padding: 12px; margin-bottom: 10px; border-radius: 6px; border-${align}: 4px solid ${BRAND.colors.primary}; text-align: ${align};">
            <div style="font-weight: bold; color: ${BRAND.colors.text}; font-size: 15px;">${icon} ${escapeHtml(desc)}</div>
            ${renderRow({ label: isHebrew ? 'שעות' : 'Hours', value: hours, align })}
            ${renderRow({ label: isHebrew ? 'תעריף לשעה (₪)' : 'Rate (₪)', value: isPresent(rate) ? `₪${rate}` : '', align })}
            ${renderRow({ label: isHebrew ? 'תיאור' : 'Description', value: descText, align })}
            ${renderRow({ label: isHebrew ? 'סה״כ' : 'Total', value: totalText, align })}
          </div>
        `;
      }

      // 2) התרעה / דוקטינג (create_alert) - MOVED BEFORE fallback
      if (type === 'create_alert') {
        const alertType = config.alert_type || config.deadline_type;
        const message = config.message || config.description;
        const dueDate = config.due_date;
        const timingInfo = config.timing_offset ? 
          `${config.timing_offset} ${config.timing_unit || 'days'} ${config.timing_direction || 'after'}` : '';

        return `
          <div style="background: #f8f9fa; padding: 12px; margin-bottom: 10px; border-radius: 6px; border-${align}: 4px solid ${BRAND.colors.primary}; text-align: ${align};">
            <div style="font-weight: bold; color: ${BRAND.colors.text}; font-size: 15px;">${icon} ${escapeHtml(desc)}</div>
            ${renderRow({ label: isHebrew ? 'סוג התרעה' : 'Alert Type', value: alertType, align })}
            ${renderRow({ label: isHebrew ? 'הודעה' : 'Message', value: truncateText(message, 260), align })}
            ${renderRow({ label: isHebrew ? 'תאריך יעד' : 'Due Date', value: dueDate, align })}
            ${renderRow({ label: isHebrew ? 'תזמון' : 'Timing', value: timingInfo, align })}
            ${renderRow({ label: isHebrew ? 'שפת התוכן' : 'Content Language', value: langIndicator, align })}
          </div>
        `;
      }

      // 3) התרעה / דוקטינג (legacy types)
      if (isDocketing) {
        const kind = config.kind || config.type || config.alert_type;
        const message = config.message || config.text || config.body;

        return `
          <div style="background: #f8f9fa; padding: 12px; margin-bottom: 10px; border-radius: 6px; border-${align}: 4px solid ${BRAND.colors.primary}; text-align: ${align};">
            <div style="font-weight: bold; color: ${BRAND.colors.text}; font-size: 15px;">${icon} ${escapeHtml(desc)}</div>
            ${renderRow({ label: isHebrew ? 'סוג' : 'Type', value: kind, align })}
            ${renderRow({ label: isHebrew ? 'תזמון' : 'Timing', value: timing, align })}
            ${renderRow({ label: isHebrew ? 'שעה' : 'Time', value: timeValue, align })}
            ${renderRow({ label: isHebrew ? 'הודעה' : 'Message', value: truncateText(message, 260), align })}
            ${renderRow({ label: isHebrew ? 'שפת התוכן' : 'Content Language', value: langIndicator, align })}
          </div>
        `;
      }

      // 4) אירוע ביומן (calendar_event)
      if (type === 'calendar_event') {
        const eventName = config.title || config.name || config.summary;
        const eventDesc = config.description || config.body || config.notes;
        const participants = config.attendees || config.participants;
        const videoLink =
          config.video_link ||
          config.meet_link ||
          config.conference_link ||
          config.url;

        return `
          <div style="background: #f8f9fa; padding: 12px; margin-bottom: 10px; border-radius: 6px; border-${align}: 4px solid ${BRAND.colors.primary}; text-align: ${align};">
            <div style="font-weight: bold; color: ${BRAND.colors.text}; font-size: 15px;">${icon} ${escapeHtml(desc)}</div>
            ${renderRow({ label: isHebrew ? 'שם האירוע' : 'Event name', value: eventName, align })}
            ${renderRow({ label: isHebrew ? 'תיאור האירוע' : 'Event description', value: truncateText(stripHtml(eventDesc), 260), align })}
            ${renderRow({ label: isHebrew ? 'תזמון' : 'Timing', value: timing || config.start_date || config.start_time, align })}
            ${renderRow({ label: isHebrew ? 'שעה' : 'Time', value: timeValue || config.time_of_day, align })}
            ${renderRow({ label: isHebrew ? 'משתתפים' : 'Participants', value: formatList(participants), align })}
            ${renderRow({ label: isHebrew ? 'קישור וידאו' : 'Video link', value: videoLink, align })}
            ${renderRow({ label: isHebrew ? 'שפת התוכן' : 'Content Language', value: langIndicator, align })}
          </div>
        `;
      }

      // 5) שליחת מייל (send_email)
      if (type === 'send_email') {
        const recipients = config.to || config.recipients || config.recipient;
        const subject = config.subject;
        const content = config.body || config.content || config.html || config.text;

        return `
          <div style="background: #f8f9fa; padding: 12px; margin-bottom: 10px; border-radius: 6px; border-${align}: 4px solid ${BRAND.colors.primary}; text-align: ${align};">
            <div style="font-weight: bold; color: ${BRAND.colors.text}; font-size: 15px;">${icon} ${escapeHtml(desc)}</div>
            ${renderRow({ label: isHebrew ? 'נמענים' : 'Recipients', value: formatList(recipients), align })}
            ${renderRow({ label: isHebrew ? 'נושא' : 'Subject', value: subject, align })}
            ${renderRow({ label: isHebrew ? 'תוכן' : 'Content', value: truncateText(stripHtml(content), 320), align })}
            ${renderRow({ label: isHebrew ? 'שפת התוכן' : 'Content Language', value: langIndicator, align })}
          </div>
        `;
      }

      // 6) שמירת קבצים ב-Dropbox (save_file)
      if (type === 'save_file') {
        const docType = config.documentType || config.document_type;
        const attachmentCount = config.attachmentCount;
        const filenameTemplate = config.filename_template;

        return `
          <div style="background: #f8f9fa; padding: 12px; margin-bottom: 10px; border-radius: 6px; border-${align}: 4px solid ${BRAND.colors.primary}; text-align: ${align};">
            <div style="font-weight: bold; color: ${BRAND.colors.text}; font-size: 15px;">${icon} ${escapeHtml(desc)}</div>
            ${renderRow({ label: isHebrew ? 'סוג מסמך' : 'Document Type', value: docType, align })}
            ${renderRow({ label: isHebrew ? 'תבנית שם קובץ' : 'Filename Template', value: filenameTemplate, align })}
            ${renderRow({ label: isHebrew ? 'קבצים מצורפים' : 'Attachments', value: attachmentCount, align })}
          </div>
        `;
      }

      // 7) fallback מינימלי - for unknown action types
      const fallback = truncateText(JSON.stringify(config), 180);
      return `
        <div style="background: #f8f9fa; padding: 12px; margin-bottom: 10px; border-radius: 6px; border-${align}: 4px solid ${BRAND.colors.primary}; text-align: ${align};">
          <div style="font-weight: bold; color: ${BRAND.colors.text}; font-size: 15px;">${icon} ${escapeHtml(desc)}</div>
          ${renderRow({ label: isHebrew ? 'פרטים' : 'Details', value: fallback, align })}
        </div>
      `;
    })
    .join('');

  const btnBase =
    'display: inline-block; padding: 12px 24px; color: #ffffff !important; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 5px; font-size: 14px;';

  return generateEmailLayout(
    `
    <h2 style="color: ${BRAND.colors.primary}; text-align: center;">${escapeHtml(title)}</h2>

    <div style="background-color: #ffffff; padding: 5px;">
      <table style="width: 100%; margin-bottom: 20px;">
  <tr>
    <td><strong>נושא:</strong> ${escapeHtml(batch.mail_subject || '-')}</td>
  </tr>
  <tr>
    <td><strong>מאת:</strong> ${escapeHtml(batch.mail_from || '-')}</td>
  </tr>
  <tr>
    <td><strong>שם הלקוח:</strong> ${escapeHtml(clientName || '-')}</td>
  </tr>
  <tr>
    <td><strong>שם התיק:</strong> ${escapeHtml(caseTitle || '-')}</td>
  </tr>
  <tr>
    <td><strong>מספר התיק:</strong> ${escapeHtml(caseNumber || '-')}</td>
  </tr>
  <tr>
    <td><strong>שפת תקשורת:</strong> ${escapeHtml(clientCommunicationLanguage === 'en' ? 'אנגלית' : 'עברית')}</td>
  </tr>
</table>

      <h3>פעולות ממתינות לאישור:</h3>
      ${actionsList}

      <div style="text-align: center; margin-top: 35px;">
        <a href="${approveUrl}" style="${btnBase} background-color: ${BRAND.colors.success};">✅ אישור</a>
        <a href="${editUrl}" style="${btnBase} background-color: #3b82f6;">✏️ עריכה</a>
        <a href="${rejectUrl}" style="${btnBase} background-color: ${BRAND.colors.secondary};">🛑 ביטול</a>
      </div>
    </div>
  `,
    title,
    language
  );
}

// ==========================================
// 4. MAIN FUNCTION LOGIC
// ==========================================

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const base44 = createClientFromRequest(req);
    const { mailId, actionsToApprove, extractedInfo, userId, clientLanguage } = await req.json();

    if (!mailId || !actionsToApprove?.length) {
      return new Response(JSON.stringify({ success: true, message: 'No actions' }), {
        headers: corsHeaders,
      });
    }

    const normalizedActions = actionsToApprove.map((action, index) => ({
      ...action,
      enabled: action.enabled !== undefined ? action.enabled : true,
      action_type: action.action_type || action.action || 'unknown',
      idempotency_key: action.idempotency_key || `${mailId}_${index}_${Date.now()}`,
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
          mail_id: mailId,
          approver_email: approverEmail,
          status: { $in: ['pending', 'editing'] },
        });

        let batch;
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

        if (existingBatches && existingBatches.length > 0) {
          batch = existingBatches[0];
          await base44.asServiceRole.entities.ApprovalBatch.update(batch.id, {
            actions_current: approverActions,
            expires_at: expiresAt.toISOString(),
            user_id: userId || batch.user_id,
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
            user_id: userId,
          });
        }

        const secret = Deno.env.get('APPROVAL_HMAC_SECRET');
        if (!secret) throw new Error('Missing APPROVAL_HMAC_SECRET');

        const appUrl = Deno.env.get('APP_BASE_URL') || 'https://dwo.base44.app';

        const approveToken = await generateApprovalToken(
          { batch_id: batch.id, approver_email: approverEmail, action: 'approve' },
          secret
        );
        const rejectToken = await generateApprovalToken(
          { batch_id: batch.id, approver_email: approverEmail, action: 'reject' },
          secret
        );

        const approveUrl = `${appUrl}/ApproveBatch?token=${approveToken}`;
        const rejectUrl = `${appUrl}/ApproveBatch?token=${rejectToken}`;
        const editUrl = `${appUrl}/ApprovalBatchEdit?batchId=${batch.id}`;

        let caseNumber = null;
        let caseTitle = null;
        if (batch.case_id) {
          try {
            const c = await base44.entities.Case.get(batch.case_id);
            caseNumber = c?.case_number || null;
            caseTitle = c?.title || null;
          } catch (e) {}
        }

        // Determine client communication language and name
        let clientCommunicationLanguage = clientLanguage || 'he';
        let clientName = null;
        if (batch.client_id) {
          try {
            const client = await base44.entities.Client.get(batch.client_id);
            clientName = client?.name || null;
            if (!clientLanguage && client?.communication_language) {
              clientCommunicationLanguage = client.communication_language;
            }
          } catch (e) {}
        }
        
        console.log(`[AggregateApprovalBatch] Client communication language: ${clientCommunicationLanguage}`);
        console.log(`[AggregateApprovalBatch] Actions count: ${batch.actions_current?.length || 0}`);

        const emailHtml = renderApprovalEmail({
  batch: { ...batch, actions_current: batch.actions_current },
  approveUrl,
  rejectUrl,
  editUrl,
  language: 'he', // Approval email UI is always in Hebrew (for the approver)
  caseNumber,
  caseTitle,
  clientName,
  clientCommunicationLanguage, // This indicates whether the CLIENT will receive English versions
});


        await base44.functions.invoke('sendEmail', {
          to: approverEmail,
          subject: `אישור נדרש: ${batch.automation_rule_name}`,
          body: emailHtml,
        });

        createdBatches.push({ batch_id: batch.id, approver: approverEmail });
      } catch (e) {
        console.error(`Error processing batch for ${approverEmail}:`, e);
      }
    }

    return new Response(JSON.stringify({ success: true, batches: createdBatches }), { headers: corsHeaders });
  } catch (error) {
    console.error('Critical Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});