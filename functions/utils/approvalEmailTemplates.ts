/**
 * Approval Email Templates
 * Multi-language email templates for approval notifications
 */

/**
 * Get email template based on language
 * @param {string} language - 'he' or 'en'
 * @param {object} data - Template data
 * @returns {{ subject: string, body: string }}
 */
export function getApprovalEmailTemplate(language, data) {
  const templates = {
    he: getHebrewTemplate(data),
    en: getEnglishTemplate(data)
  };
  
  return templates[language] || templates.he;
}

function getHebrewTemplate(data) {
  const { 
    ruleName, 
    mailSubject, 
    mailFrom, 
    caseNumber,
    clientName,
    actionsCount,
    actionsSummary,
    approveUrl,
    rejectUrl,
    expiresAt,
    batchId
  } = data;
  
  const subject = `אישור נדרש: ${ruleName} - ${mailSubject}`;
  
  const body = `
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; direction: rtl; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #1e293b; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
    .content { background: #f8fafc; padding: 20px; border: 1px solid #e2e8f0; }
    .actions-list { background: white; padding: 15px; border-radius: 8px; margin: 15px 0; }
    .action-item { padding: 8px 0; border-bottom: 1px solid #e2e8f0; }
    .action-item:last-child { border-bottom: none; }
    .btn { display: inline-block; padding: 12px 24px; margin: 10px 5px; border-radius: 6px; text-decoration: none; font-weight: bold; }
    .btn-approve { background: #22c55e; color: white; }
    .btn-reject { background: #ef4444; color: white; }
    .btn-edit { background: #3b82f6; color: white; }
    .meta { font-size: 12px; color: #64748b; margin-top: 20px; }
    .warning { background: #fef3c7; border: 1px solid #f59e0b; padding: 10px; border-radius: 6px; margin: 15px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2 style="margin: 0;">🔔 בקשת אישור לאוטומציה</h2>
      <p style="margin: 5px 0 0;">כלל: ${ruleName}</p>
    </div>
    
    <div class="content">
      <h3>פרטי המייל המקורי:</h3>
      <p><strong>נושא:</strong> ${mailSubject}</p>
      <p><strong>מאת:</strong> ${mailFrom}</p>
      ${caseNumber ? `<p><strong>תיק:</strong> ${caseNumber}</p>` : ''}
      ${clientName ? `<p><strong>לקוח:</strong> ${clientName}</p>` : ''}
      
      <h3>פעולות לביצוע (${actionsCount}):</h3>
      <div class="actions-list">
        ${actionsSummary.map(action => `
          <div class="action-item">
            <strong>${getActionTypeLabel(action.action_type, 'he')}</strong>
            ${action.summary ? `<br><span style="color: #64748b;">${action.summary}</span>` : ''}
          </div>
        `).join('')}
      </div>
      
      <div class="warning">
        ⏰ <strong>שים לב:</strong> בקשה זו תפוג בתאריך ${formatDate(expiresAt, 'he')}
      </div>
      
      <div style="text-align: center; margin: 25px 0;">
        <a href="${approveUrl}" class="btn btn-approve">✓ אשר הכל</a>
        <a href="${rejectUrl}" class="btn btn-reject">✗ דחה</a>
      </div>
      
      <p style="text-align: center; color: #64748b;">
        לעריכת הפעולות לפני ביצוע, <a href="${getEditUrl(batchId)}">לחץ כאן</a>
      </p>
      
      <div class="meta">
        <p>מזהה אצווה: ${batchId}</p>
        <p>נוצר: ${formatDate(new Date().toISOString(), 'he')}</p>
      </div>
    </div>
  </div>
</body>
</html>
  `;
  
  return { subject, body };
}

function getEnglishTemplate(data) {
  const { 
    ruleName, 
    mailSubject, 
    mailFrom, 
    caseNumber,
    clientName,
    actionsCount,
    actionsSummary,
    approveUrl,
    rejectUrl,
    expiresAt,
    batchId
  } = data;
  
  const subject = `Approval Required: ${ruleName} - ${mailSubject}`;
  
  const body = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #1e293b; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
    .content { background: #f8fafc; padding: 20px; border: 1px solid #e2e8f0; }
    .actions-list { background: white; padding: 15px; border-radius: 8px; margin: 15px 0; }
    .action-item { padding: 8px 0; border-bottom: 1px solid #e2e8f0; }
    .action-item:last-child { border-bottom: none; }
    .btn { display: inline-block; padding: 12px 24px; margin: 10px 5px; border-radius: 6px; text-decoration: none; font-weight: bold; }
    .btn-approve { background: #22c55e; color: white; }
    .btn-reject { background: #ef4444; color: white; }
    .btn-edit { background: #3b82f6; color: white; }
    .meta { font-size: 12px; color: #64748b; margin-top: 20px; }
    .warning { background: #fef3c7; border: 1px solid #f59e0b; padding: 10px; border-radius: 6px; margin: 15px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2 style="margin: 0;">🔔 Automation Approval Request</h2>
      <p style="margin: 5px 0 0;">Rule: ${ruleName}</p>
    </div>
    
    <div class="content">
      <h3>Original Email Details:</h3>
      <p><strong>Subject:</strong> ${mailSubject}</p>
      <p><strong>From:</strong> ${mailFrom}</p>
      ${caseNumber ? `<p><strong>Case:</strong> ${caseNumber}</p>` : ''}
      ${clientName ? `<p><strong>Client:</strong> ${clientName}</p>` : ''}
      
      <h3>Actions to Execute (${actionsCount}):</h3>
      <div class="actions-list">
        ${actionsSummary.map(action => `
          <div class="action-item">
            <strong>${getActionTypeLabel(action.action_type, 'en')}</strong>
            ${action.summary ? `<br><span style="color: #64748b;">${action.summary}</span>` : ''}
          </div>
        `).join('')}
      </div>
      
      <div class="warning">
        ⏰ <strong>Note:</strong> This request expires on ${formatDate(expiresAt, 'en')}
      </div>
      
      <div style="text-align: center; margin: 25px 0;">
        <a href="${approveUrl}" class="btn btn-approve">✓ Approve All</a>
        <a href="${rejectUrl}" class="btn btn-reject">✗ Reject</a>
      </div>
      
      <p style="text-align: center; color: #64748b;">
        To edit actions before execution, <a href="${getEditUrl(batchId)}">click here</a>
      </p>
      
      <div class="meta">
        <p>Batch ID: ${batchId}</p>
        <p>Created: ${formatDate(new Date().toISOString(), 'en')}</p>
      </div>
    </div>
  </div>
</body>
</html>
  `;
  
  return { subject, body };
}

/**
 * Get action type label by language
 */
function getActionTypeLabel(actionType, language) {
  const labels = {
    he: {
      send_email: '📧 שליחת מייל',
      create_task: '📝 יצירת משימה',
      billing: '💰 חיוב שעות',
      calendar_event: '📅 אירוע ביומן',
      save_file: '💾 שמירת קבצים',
      create_alert: '🔔 יצירת התרעה'
    },
    en: {
      send_email: '📧 Send Email',
      create_task: '📝 Create Task',
      billing: '💰 Log Billing',
      calendar_event: '📅 Calendar Event',
      save_file: '💾 Save Files',
      create_alert: '🔔 Create Alert'
    }
  };
  
  return labels[language]?.[actionType] || actionType;
}

/**
 * Format date by language
 */
function formatDate(dateString, language) {
  const date = new Date(dateString);
  const options = { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  };
  
  return date.toLocaleDateString(language === 'he' ? 'he-IL' : 'en-US', options);
}

/**
 * Get edit URL for batch
 */
function getEditUrl(batchId) {
  const baseUrl = Deno.env.get("APP_BASE_URL") || 'https://app.base44.com';
  return `${baseUrl}/ApprovalQueue?edit=${batchId}`;
}

/**
 * Generate action summary for email
 */
export function generateActionSummary(action) {
  const { action_type, config } = action;
  
  switch (action_type) {
    case 'send_email':
      return { 
        action_type, 
        summary: `לנמען: ${config?.to || 'לא צוין'}` 
      };
    case 'create_task':
      return { 
        action_type, 
        summary: config?.title || '' 
      };
    case 'billing':
      return { 
        action_type, 
        summary: `${config?.hours || 0} שעות × ${config?.rate || 800} ₪` 
      };
    case 'calendar_event':
      return { 
        action_type, 
        summary: config?.title || '' 
      };
    case 'save_file':
      return { 
        action_type, 
        summary: `נתיב: ${config?.path || ''}` 
      };
    case 'create_alert':
      return { 
        action_type, 
        summary: config?.message || '' 
      };
    default:
      return { action_type, summary: '' };
  }
}