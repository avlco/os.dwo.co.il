/**
 * Email Templates for Approval Batch System
 * Supports Hebrew (RTL) and English (LTR)
 */

const translations = {
  he: {
    title: 'בקשת אישור אוטומציה',
    rule: 'כלל',
    mail: 'מייל',
    from: 'מאת',
    case: 'תיק',
    client: 'לקוח',
    actions: 'פעולות לביצוע',
    actionsCount: 'פעולות',
    approveBtn: '✅ אשר מהיר',
    editBtn: '✏️ פתח לעריכה',
    expiry: 'הקישור לאישור מהיר תקף ל-60 דקות. לאחר מכן, יש לאשר מתוך המערכת.',
    footer: 'הודעה זו נשלחה אוטומטית ממערכת ניהול התיקים.',
    actionLabels: {
      send_email: 'שליחת מייל',
      create_task: 'יצירת משימה',
      billing: 'חיוב שעות',
      calendar_event: 'אירוע ביומן',
      save_file: 'שמירת קבצים',
      create_alert: 'יצירת התרעה'
    }
  },
  en: {
    title: 'Automation Approval Request',
    rule: 'Rule',
    mail: 'Email',
    from: 'From',
    case: 'Case',
    client: 'Client',
    actions: 'Actions to Execute',
    actionsCount: 'actions',
    approveBtn: '✅ Quick Approve',
    editBtn: '✏️ Open for Editing',
    expiry: 'Quick approval link valid for 60 minutes. After that, approve from the system.',
    footer: 'This message was sent automatically from the case management system.',
    actionLabels: {
      send_email: 'Send Email',
      create_task: 'Create Task',
      billing: 'Log Time',
      calendar_event: 'Calendar Event',
      save_file: 'Save Files',
      create_alert: 'Create Alert'
    }
  }
};

/**
 * Render approval email HTML
 * @param {object} data - Email data
 * @returns {string} - HTML email content
 */
export function renderApprovalEmail(data) {
  const { batch, approveUrl, editUrl, language = 'he', caseName, clientName } = data;
  const t = translations[language] || translations.he;
  const isRTL = language === 'he';
  const dir = isRTL ? 'rtl' : 'ltr';
  const align = isRTL ? 'right' : 'left';

  // Build actions list
  const enabledActions = (batch.actions_current || []).filter(a => a.enabled);
  const actionsList = enabledActions
    .map(a => {
      const label = t.actionLabels[a.action_type] || a.action_type;
      return `<li style="padding: 4px 0;">${label}</li>`;
    })
    .join('');

  const actionsCountText = `${enabledActions.length} ${t.actionsCount}`;

  return `
<!DOCTYPE html>
<html dir="${dir}" lang="${language}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${t.title}</title>
</head>
<body style="margin: 0; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; background-color: #f3f4f6; direction: ${dir};">
  <table role="presentation" style="width: 100%; max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
    
    <!-- Header -->
    <tr>
      <td style="padding: 24px; background: linear-gradient(135deg, #1e293b 0%, #334155 100%); text-align: ${align};">
        <h1 style="margin: 0; color: white; font-size: 20px; font-weight: 600;">${t.title}</h1>
      </td>
    </tr>
    
    <!-- Content -->
    <tr>
      <td style="padding: 24px; text-align: ${align};">
        
        <!-- Rule & Mail Info -->
        <div style="background: #f8fafc; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
          <p style="margin: 0 0 8px 0; color: #64748b; font-size: 14px;">
            <strong>${t.rule}:</strong> 
            <span style="color: #1e293b;">${batch.automation_rule_name || '-'}</span>
          </p>
          <p style="margin: 0 0 8px 0; color: #64748b; font-size: 14px;">
            <strong>${t.mail}:</strong> 
            <span style="color: #1e293b;">${batch.mail_subject || '-'}</span>
          </p>
          <p style="margin: 0 0 8px 0; color: #64748b; font-size: 14px;">
            <strong>${t.from}:</strong> 
            <span style="color: #1e293b;">${batch.mail_from || '-'}</span>
          </p>
          ${caseName ? `
          <p style="margin: 0 0 8px 0; color: #64748b; font-size: 14px;">
            <strong>${t.case}:</strong> 
            <span style="color: #1e293b;">${caseName}</span>
          </p>
          ` : ''}
          ${clientName ? `
          <p style="margin: 0; color: #64748b; font-size: 14px;">
            <strong>${t.client}:</strong> 
            <span style="color: #1e293b;">${clientName}</span>
          </p>
          ` : ''}
        </div>
        
        <!-- Actions -->
        <div style="margin-bottom: 24px;">
          <h3 style="margin: 0 0 12px 0; color: #1e293b; font-size: 16px; font-weight: 600;">
            ${t.actions} (${actionsCountText})
          </h3>
          <ul style="margin: 0; padding: ${isRTL ? '0 20px 0 0' : '0 0 0 20px'}; color: #475569; font-size: 14px; list-style-type: disc;">
            ${actionsList}
          </ul>
        </div>
        
        <!-- Buttons -->
        <div style="text-align: center; margin-bottom: 24px;">
          <a href="${approveUrl}" 
             style="display: inline-block; background: #10b981; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; margin: 8px;">
            ${t.approveBtn}
          </a>
          <br>
          <a href="${editUrl}" 
             style="display: inline-block; color: #3b82f6; text-decoration: none; padding: 12px 24px; font-size: 14px; margin: 8px;">
            ${t.editBtn}
          </a>
        </div>
        
        <!-- Expiry Notice -->
        <p style="margin: 0; padding: 16px; background: #fef3c7; border-radius: 8px; color: #92400e; font-size: 13px; text-align: center;">
          ⏰ ${t.expiry}
        </p>
        
      </td>
    </tr>
    
    <!-- Footer -->
    <tr>
      <td style="padding: 16px 24px; background: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center;">
        <p style="margin: 0; color: #94a3b8; font-size: 12px;">
          ${t.footer}
        </p>
      </td>
    </tr>
    
  </table>
</body>
</html>
  `.trim();
}

/**
 * Render simple approval confirmation email
 * @param {object} data - Confirmation data
 * @returns {string} - HTML email content
 */
export function renderApprovalConfirmationEmail(data) {
  const { batch, executionSummary, language = 'he' } = data;
  const isRTL = language === 'he';
  const dir = isRTL ? 'rtl' : 'ltr';
  
  const title = isRTL ? 'אישור בוצע בהצלחה' : 'Approval Executed Successfully';
  const successText = isRTL 
    ? `${executionSummary.success} פעולות בוצעו בהצלחה`
    : `${executionSummary.success} actions executed successfully`;

  return `
<!DOCTYPE html>
<html dir="${dir}">
<head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; padding: 20px; direction: ${dir};">
  <h2 style="color: #10b981;">✅ ${title}</h2>
  <p><strong>${batch.automation_rule_name}</strong></p>
  <p>${successText}</p>
</body>
</html>
  `.trim();
}