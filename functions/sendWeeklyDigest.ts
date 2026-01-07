import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

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

    // Build HTML email
    const emailHtml = `
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; direction: rtl; background: #f8fafc; margin: 0; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #1e293b 0%, #334155 100%); color: white; padding: 24px; text-align: center; }
    .header h1 { margin: 0; font-size: 24px; }
    .header p { margin: 8px 0 0; opacity: 0.9; font-size: 14px; }
    .content { padding: 24px; }
    .stat-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin-bottom: 24px; }
    .stat-card { background: #f8fafc; border-radius: 8px; padding: 16px; text-align: center; }
    .stat-value { font-size: 32px; font-weight: bold; color: #1e293b; }
    .stat-label { font-size: 14px; color: #64748b; margin-top: 4px; }
    .stat-card.highlight { background: #ecfdf5; }
    .stat-card.highlight .stat-value { color: #059669; }
    .footer { background: #f8fafc; padding: 16px 24px; text-align: center; font-size: 12px; color: #64748b; }
    .quiet-week { text-align: center; padding: 32px; color: #64748b; }
    .quiet-week h3 { color: #1e293b; margin-bottom: 8px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📊 סיכום שבועי - IPMS</h1>
      <p>${weekAgo.toLocaleDateString('he-IL')} - ${now.toLocaleDateString('he-IL')}</p>
    </div>
    <div class="content">
      ${totalMails === 0 ? `
        <div class="quiet-week">
          <h3>🌴 שבוע שקט</h3>
          <p>לא התקבלו מיילים חדשים בשבוע האחרון.</p>
        </div>
      ` : `
        <div class="stat-grid">
          <div class="stat-card">
            <div class="stat-value">${totalMails}</div>
            <div class="stat-label">מיילים נכנסים</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${autoTriageRate}%</div>
            <div class="stat-label">סיווג אוטומטי</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${accuracyRate}%</div>
            <div class="stat-label">מדד דיוק</div>
          </div>
          <div class="stat-card highlight">
            <div class="stat-value">${hoursSaved}</div>
            <div class="stat-label">שעות נחסכו</div>
          </div>
        </div>
        <p style="text-align: center; color: #64748b; font-size: 14px;">
          ${completedTasks.length} משימות הושלמו | ${tasksWithOverride.length} תיקונים ידניים
        </p>
      `}
    </div>
    <div class="footer">
      נשלח אוטומטית ממערכת IPMS
    </div>
  </div>
</body>
</html>
    `.trim();

    // Send to all admins
    const sentTo = [];
    for (const admin of admins) {
      if (admin.email) {
        try {
          await base44.integrations.Core.SendEmail({
            to: admin.email,
            subject: `סיכום שבועי - IPMS (${now.toLocaleDateString('he-IL')})`,
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