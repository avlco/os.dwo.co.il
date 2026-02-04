import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../../utils';
import { Badge } from "../ui/badge";
import { useDateTimeSettings } from '../DateTimeSettingsProvider';
import { Card, CardContent } from "../ui/card";
import { 
  Mail, 
  MessageSquare, 
  Paperclip, 
  ChevronLeft,
  CheckCircle2,
  XCircle,
  Clock,
  Zap,
  FileText
} from 'lucide-react';

import { useTranslation } from 'react-i18next';

export default function MailThreadCard({ thread, automationLogs = [] }) {
  const { t } = useTranslation();
  const { formatDateTime } = useDateTimeSettings();
  
  const statusConfig = {
    pending: { label: t('mail_thread.new_label'), color: 'bg-blue-100 text-blue-800', icon: Mail },
    matched_for_automation: { label: t('mail_thread.for_automation'), color: 'bg-amber-100 text-amber-800', icon: Zap },
    awaiting_approval: { label: t('mail_thread.awaiting_approval'), color: 'bg-yellow-100 text-yellow-800', icon: Clock },
    automation_complete: { label: t('mail_thread.automation_complete'), color: 'bg-green-100 text-green-800', icon: CheckCircle2 },
    automation_failed: { label: t('mail_thread.automation_failed'), color: 'bg-red-100 text-red-800', icon: XCircle },
    automation_cancelled: { label: t('mail_thread.automation_cancelled'), color: 'bg-gray-100 text-gray-700', icon: XCircle },
    manual_task_created: { label: t('mail_thread.task_created'), color: 'bg-purple-100 text-purple-800', icon: FileText },
    processed: { label: t('mail_thread.processed'), color: 'bg-green-100 text-green-800', icon: CheckCircle2 },
    archived: { label: t('mail_thread.archived'), color: 'bg-gray-100 text-gray-800', icon: Mail }
  };
  const { latestMail, mails, threadId } = thread;
  const mailCount = mails.length;
  const hasMultiple = mailCount > 1;
  
  // בדיקת סטטוס אוטומציה מה-logs
  const threadLogs = automationLogs.filter(log => 
    mails.some(m => log.metadata?.mail_id === m.id)
  );
  const hasAutomation = threadLogs.length > 0;
  const automationSuccess = threadLogs.filter(l => l.status === 'completed').length;
  const automationFailed = threadLogs.filter(l => l.status === 'failed').length;
  
  // סטטוס המייל האחרון
  const status = statusConfig[latestMail.processing_status] || statusConfig.pending;
  const StatusIcon = status.icon;
  
  // בדיקת קבצים מצורפים בכל השרשור
  const totalAttachments = mails.reduce((sum, m) => sum + (m.attachments?.length || 0), 0);
  
  return (
    <Link to={createPageUrl('MailView', { id: latestMail.id, thread: threadId })}>
      <Card className="hover:shadow-md transition-all cursor-pointer border-r-4 hover:border-r-blue-500 dark:bg-slate-800">
        <CardContent className="p-4">
          <div className="flex items-start gap-4">
            {/* אייקון + מספר הודעות */}
            <div className="relative flex-shrink-0">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                hasMultiple ? 'bg-blue-100 dark:bg-blue-900' : 'bg-slate-100 dark:bg-slate-700'
              }`}>
                {hasMultiple ? (
                  <MessageSquare className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                ) : (
                  <Mail className="w-5 h-5 text-slate-500 dark:text-slate-400" />
                )}
              </div>
              {hasMultiple && (
                <span className="absolute -top-1 -right-1 bg-blue-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                  {mailCount}
                </span>
              )}
            </div>
            
            {/* תוכן ראשי */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-medium text-slate-800 dark:text-slate-100 truncate">
                  {latestMail.subject || t('mail_view.no_subject')}
                </h3>
                <span className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                  {formatDateTime(latestMail.received_at, null, 'dd/MM HH:mm')}
                </span>
              </div>
              
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                {latestMail.sender_name || latestMail.sender_email}
              </p>
              
              {latestMail.content_snippet && (
                <p className="text-sm text-slate-500 dark:text-slate-500 mt-2 line-clamp-2">
                  {latestMail.content_snippet}
                </p>
              )}
              
              {/* תגיות */}
              <div className="flex items-center gap-2 mt-3 flex-wrap">
                <Badge className={status.color}>
                  <StatusIcon className="w-3 h-3 ml-1" />
                  {status.label}
                </Badge>
                
                {totalAttachments > 0 && (
                  <Badge variant="outline" className="text-xs">
                    <Paperclip className="w-3 h-3 ml-1" />
                    {totalAttachments}
                  </Badge>
                )}
                
                {hasAutomation && (
                  <div className="flex items-center gap-1">
                    {automationSuccess > 0 && (
                      <Badge variant="success" className="text-xs bg-green-100 text-green-800">
                        <CheckCircle2 className="w-3 h-3 ml-1" />
                        {automationSuccess}
                      </Badge>
                    )}
                    {automationFailed > 0 && (
                      <Badge variant="destructive" className="text-xs">
                        <XCircle className="w-3 h-3 ml-1" />
                        {automationFailed}
                      </Badge>
                    )}
                  </div>
                )}
                
                {latestMail.matched_rule_name && (
                  <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                    <Zap className="w-3 h-3 ml-1" />
                    {latestMail.matched_rule_name}
                  </Badge>
                )}
              </div>
            </div>
            
            {/* חץ */}
            <ChevronLeft className="w-5 h-5 text-slate-400 flex-shrink-0 mt-2" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}