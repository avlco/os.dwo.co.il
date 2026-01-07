import React from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  CheckCircle2, 
  XCircle, 
  ExternalLink, 
  Clock, 
  Calendar, 
  FileText, 
  Mail, 
  Cloud,
  Receipt,
  ArrowRight,
  ArrowLeft
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../../utils';

const actionIcons = {
  log_time: Clock,
  create_deadline: Calendar,
  create_task: FileText,
  send_email: Mail,
  create_calendar_event: Calendar,
  upload_to_dropbox: Cloud,
  create_invoice_draft: Receipt,
};

const actionLabels = {
  log_time: { he: 'רישום שעות', en: 'Log Time' },
  create_deadline: { he: 'יצירת מועד', en: 'Create Deadline' },
  create_task: { he: 'יצירת משימה', en: 'Create Task' },
  send_email: { he: 'שליחת מייל', en: 'Send Email' },
  create_calendar_event: { he: 'יצירת אירוע יומן', en: 'Calendar Event' },
  upload_to_dropbox: { he: 'העלאה ל-Dropbox', en: 'Upload to Dropbox' },
  create_invoice_draft: { he: 'יצירת טיוטת חשבונית', en: 'Create Invoice Draft' },
  update_case_status: { he: 'עדכון סטטוס תיק', en: 'Update Case Status' },
};

export default function ExecutionSummary({ results, onClose }) {
  const { i18n } = useTranslation();
  const isRTL = i18n.language === 'he';

  const successCount = results.filter(r => r.status === 'success').length;
  const errorCount = results.filter(r => r.status === 'error').length;

  const BackArrow = isRTL ? ArrowRight : ArrowLeft;

  const getActionLink = (result) => {
    const data = result.data?.executed_actions?.[0];
    if (!data) return null;

    switch (result.action) {
      case 'log_time':
        return data.id ? { url: createPageUrl('Financials'), label: isRTL ? 'צפה בחיובים' : 'View Financials' } : null;
      case 'create_deadline':
        return data.id ? { url: createPageUrl('Docketing'), label: isRTL ? 'צפה במועדים' : 'View Deadlines' } : null;
      case 'create_task':
        return data.id ? { url: createPageUrl(`Workbench?taskId=${data.id}`), label: isRTL ? 'צפה במשימה' : 'View Task' } : null;
      case 'upload_to_dropbox':
        return data.dropbox_url ? { url: data.dropbox_url, label: isRTL ? 'צפה ב-Dropbox' : 'View in Dropbox', external: true } : null;
      case 'create_calendar_event':
        return data.calendar_link ? { url: data.calendar_link, label: isRTL ? 'פתח ביומן' : 'Open in Calendar', external: true } : null;
      case 'create_invoice_draft':
        return data.id ? { url: createPageUrl('Financials'), label: isRTL ? 'צפה בחשבוניות' : 'View Invoices' } : null;
      default:
        return null;
    }
  };

  return (
    <Card className="dark:bg-slate-800 dark:border-slate-700">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl dark:text-slate-200">
            {isRTL ? 'סיכום ביצוע' : 'Execution Summary'}
          </CardTitle>
          <div className="flex gap-2">
            {successCount > 0 && (
              <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                {successCount} {isRTL ? 'הצליחו' : 'succeeded'}
              </Badge>
            )}
            {errorCount > 0 && (
              <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                {errorCount} {isRTL ? 'נכשלו' : 'failed'}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {results.map((result, index) => {
          const Icon = actionIcons[result.action] || FileText;
          const isSuccess = result.status === 'success';
          const link = getActionLink(result);
          const label = actionLabels[result.action] || { he: result.action, en: result.action };

          return (
            <div 
              key={index}
              className={`flex items-center gap-3 p-3 rounded-lg border ${
                isSuccess 
                  ? 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800' 
                  : 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800'
              }`}
            >
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                isSuccess ? 'bg-green-100 dark:bg-green-900/40' : 'bg-red-100 dark:bg-red-900/40'
              }`}>
                {isSuccess ? (
                  <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Icon className={`w-4 h-4 ${isSuccess ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`} />
                  <p className={`font-medium text-sm ${
                    isSuccess ? 'text-green-800 dark:text-green-300' : 'text-red-800 dark:text-red-300'
                  }`}>
                    {isRTL ? label.he : label.en}
                  </p>
                </div>
                {!isSuccess && result.error && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                    {result.error}
                  </p>
                )}
                {isSuccess && result.data?.executed_actions?.[0] && (
                  <div className="text-xs text-green-700 dark:text-green-400 mt-1">
                    {result.action === 'log_time' && result.data.executed_actions[0].hours && (
                      <span>{result.data.executed_actions[0].hours} {isRTL ? 'שעות' : 'hours'} @ ₪{result.data.executed_actions[0].rate || 0}/{isRTL ? 'שעה' : 'hr'}</span>
                    )}
                    {result.action === 'upload_to_dropbox' && result.data.executed_actions[0].filename && (
                      <span>{result.data.executed_actions[0].filename} → {result.data.executed_actions[0].destination}</span>
                    )}
                    {result.action === 'create_calendar_event' && result.data.executed_actions[0].title && (
                      <span>{result.data.executed_actions[0].title}</span>
                    )}
                    {result.action === 'send_email' && result.data.executed_actions[0].to && (
                      <span>{isRTL ? 'נשלח ל:' : 'Sent to:'} {result.data.executed_actions[0].to}</span>
                    )}
                  </div>
                )}
              </div>
              {link && (
                <a
                  href={link.url}
                  target={link.external ? '_blank' : '_self'}
                  rel={link.external ? 'noopener noreferrer' : undefined}
                  className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline flex-shrink-0"
                >
                  {link.label}
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          );
        })}

        <div className="pt-4 border-t dark:border-slate-700">
          <Link to={createPageUrl('MailRoom')}>
            <Button className="w-full gap-2 bg-slate-800 hover:bg-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600">
              <BackArrow className="w-4 h-4" />
              {isRTL ? 'חזרה לחדר דואר' : 'Back to Mail Room'}
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}