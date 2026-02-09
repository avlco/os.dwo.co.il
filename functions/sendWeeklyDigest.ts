import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

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
    success: '#10b981',    // Green
    link: '#b62f12'        // Link
  },
  logoUrl: 'https://dwo.co.il/wp-content/uploads/2020/04/Drori-Stav-logo-2.png', 
  appUrl: 'https://os.dwo.co.il'
};

function generateEmailLayout(contentHtml, title) {
  return `
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body { margin: 0; padding: 0; background-color: ${BRAND.colors.bg}; font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
    .email-wrapper { padding: 20px; }
    .email-container { max-width: 600px; margin: 0 auto; background-color: ${BRAND.colors.card}; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }
    .header { background-color: ${BRAND.colors.card}; padding: 20px; text-align: center; border-bottom: 3px solid ${BRAND.colors.primary}; }
    .content { padding: 30px 25px; color: ${BRAND.colors.text}; line-height: 1.6; text-align: right; }
    .footer { background-color: #f8fafc; padding: 20px; text-align: center; font-size: 12px; color: ${BRAND.colors.textLight}; border-top: 1px solid #e2e8f0; }
    a { color: ${BRAND.colors.link}; text-decoration: none; }
    .logo { height: 50px; width: auto; max-width: 200px; object-fit: contain; }
    
    /* Stats Cards Styling */
    .stats-table { width: 100%; border-collapse: separate; border-spacing: 10px; margin-top: 10px; }
    .stat-cell { background-color: #f8f9fa; border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; text-align: center; width: 50%; vertical-align: middle; }
    .stat-value { font-size: 28px; font-weight: bold; color: ${BRAND.colors.primary}; margin-bottom: 5px; }
    .stat-label { font-size: 14px; color: ${BRAND.colors.textLight}; }
    .highlight-cell { background-color: #fff1f2; border-color: ${BRAND.colors.primary}; }
  </style>
</head>
<body dir="rtl">
  <div class="email-wrapper">
    <div class="email-container">
      <div class="header">
         <img src="${BRAND.logoUrl}" alt="DWO Logo" class="logo" />
      </div>
      <div class="content">
        ${contentHtml}
      </div>
      <div class="footer">
        <p style="margin: 0 0 10px 0;">נשלח אוטומטית ממערכת OS.DWO</p>
        <p style="margin: 0; opacity: 0.7;">DWO - משרד עורכי דין | www.dwo.co.il</p>
      </div>
    </div>
  </div>
</body>
</html>`.trim();
}

// ========================================
// MAIN HANDLER
// ========================================

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only admins can trigger this
    if (user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // Calculate date range (last 7 days)
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Fetch data
    const [mails, tasks, admins] = await Promise.all([
      base44.asServiceRole.entities.Mail.list('-received_at', 1000),
      base44.asServiceRole.entities.Task.list('-created_date', 1000),
      base44.asServiceRole.entities.User.filter({ role: 'admin' }),
    ]);

    // Filter by date range
    const filteredMails = mails.filter(m => new Date(m.received_at) >= weekAgo);
    const filteredTasks = tasks.filter(t => new Date(t.created_date) >= weekAgo);

    // Calculate metrics
    const totalMails = filteredMails.length;
    const autoTriagedMails = filteredMails.filter(m => m.auto_triaged).length;
    const autoTriageRate = totalMails > 0 ? Math.round((autoTriagedMails / totalMails) * 100) : 0;

    const completedTasks = filteredTasks.filter(t => t.status === 'completed');
    const tasksWithOverride = filteredTasks.filter(t => t.manual_override);
    const accuracyRate = filteredTasks.length > 0 
      ? Math.round(((filteredTasks.length - tasksWithOverride.length) / filteredTasks.length) * 100) 
      : 100;

    const totalTimeSaved = filteredTasks.reduce((sum, t) => sum + (t.time_saved_minutes || 0), 0);
    const hoursSaved = Math.round(totalTimeSaved / 60 * 10) / 10;

    // Build Content HTML
    let innerContent = '';
    
    if (totalMails === 0) {
      innerContent = `
        <div style="text-align: center; padding: 30px;">
          <h3 style="color: ${BRAND.colors.secondary}; margin-bottom: 10px;">🌴 שבוע שקט</h3>
          <p style="color: ${BRAND.colors.textLight};">לא התקבלו מיילים חדשים בשבוע האחרון.</p>
        </div>
      `;
    } else {
      innerContent = `
        <h1 style="color: ${BRAND.colors.primary}; font-size: 24px; margin-top: 0; margin-bottom: 5px; text-align: center;">📊 סיכום שבועי - IPMS</h1>
        <p style="text-align: center; color: ${BRAND.colors.textLight}; margin-bottom: 30px; margin-top: 0; font-size: 14px;">
          ${weekAgo.toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' })} - ${now.toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' })}
        </p>

        <table class="stats-table" role="presentation">
          <tr>
            <td class="stat-cell">
              <div class="stat-value">${totalMails}</div>
              <div class="stat-label">מיילים נכנסים</div>
            </td>
            <td class="stat-cell">
              <div class="stat-value">${autoTriageRate}%</div>
              <div class="stat-label">סיווג אוטומטי</div>
            </td>
          </tr>
          <tr>
            <td class="stat-cell">
              <div class="stat-value">${accuracyRate}%</div>
              <div class="stat-label">מדד דיוק</div>
            </td>
            <td class="stat-cell highlight-cell">
              <div class="stat-value">${hoursSaved}</div>
              <div class="stat-label">שעות נחסכו</div>
            </td>
          </tr>
        </table>

        <div style="text-align: center; margin-top: 25px; padding: 15px; background-color: #f8f9fa; border-radius: 6px;">
          <p style="margin: 0; color: ${BRAND.colors.text}; font-size: 14px;">
            <strong>סטטוס משימות:</strong> 
            <span style="color: ${BRAND.colors.success}; font-weight: bold;">${completedTasks.length} הושלמו</span> 
            | 
            <span style="color: ${BRAND.colors.textLight};">${tasksWithOverride.length} תיקונים ידניים</span>
          </p>
        </div>
      `;
    }

    // Generate Full HTML using Design System
    const emailHtml = generateEmailLayout(innerContent, `סיכום שבועי - ${now.toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' })}`);

    // Send to all admins
    const sentTo = [];
    for (const admin of admins) {
      if (admin.email) {
        try {
          await base44.integrations.Core.SendEmail({
            to: admin.email,
            subject: `סיכום שבועי - IPMS (${now.toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' })})`,
            body: emailHtml
          });
          sentTo.push(admin.email);
        } catch (e) {
          console.error('Failed to send to:', admin.email, e);
        }
      }
    }

    return Response.json({
      success: true,
      sent_to: sentTo,
      stats: {
        total_mails: totalMails,
        auto_triage_rate: autoTriageRate,
        accuracy_rate: accuracyRate,
        hours_saved: hoursSaved,
        completed_tasks: completedTasks.length,
      }
    });

  } catch (error) {
    console.error('Error sending weekly digest:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});