import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../../utils';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import { Badge } from "../ui/badge";
import { Card, CardContent } from "../ui/card";
import { Button } from "../ui/button";
import { 
  CheckCircle2,
  XCircle,
  Mail,
  Clock,
  Zap,
  ChevronLeft,
  FileText,
  Calendar,
  DollarSign,
  Send
} from 'lucide-react';

const actionIcons = {
  send_email: Send,
  create_task: FileText,
  billing: DollarSign,
  calendar_event: Calendar,
  save_file: FileText,
  create_deadline: Clock
};

const actionLabels = {
  send_email: 'שליחת מייל',
  create_task: 'יצירת משימה',
  billing: 'חיוב שעות',
  calendar_event: 'אירוע יומן',
  save_file: 'שמירת קבצים',
  create_deadline: 'יצירת דדליין'
};

export default function AutomationLogCard({ log, relatedMail }) {
  const isSuccess = log.status === 'completed';
  const isPartialSuccess = log.status === 'completed_with_errors';
  const isFailed = log.status === 'failed';
  const isCancelled = log.status === 'cancelled';
  const isPending = log.status === 'pending';
  const metadata = log.metadata || {};
  const actionsSummary = metadata.actions_summary || [];
  
  // קביעת צבע הגבול והאייקון
  const getBorderColor = () => {
    if (isSuccess) return 'border-r-green-500';
    if (isPartialSuccess) return 'border-r-amber-500';
    if (isCancelled) return 'border-r-gray-400';
    if (isPending) return 'border-r-blue-400';
    return 'border-r-red-500';
  };

  const getStatusBadge = () => {
    if (isSuccess) return { label: 'הצליח', color: 'bg-green-100 text-green-800' };
    if (isPartialSuccess) return { label: 'הצליח חלקית', color: 'bg-amber-100 text-amber-800' };
    if (isCancelled) return { label: 'בוטל', color: 'bg-gray-100 text-gray-700' };
    if (isPending) return { label: 'ממתין לאישור', color: 'bg-blue-100 text-blue-800' };
    return { label: 'נכשל', color: 'bg-red-100 text-red-800' };
  };

  const statusBadge = getStatusBadge();

  return (
    <Card className={`border-r-4 ${getBorderColor()} dark:bg-slate-800`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            {/* כותרת + סטטוס */}
            <div className="flex items-center gap-3 mb-2">
              {isSuccess ? (
                <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
              ) : isPartialSuccess ? (
                <Clock className="w-5 h-5 text-amber-600 flex-shrink-0" />
              ) : isCancelled ? (
                <XCircle className="w-5 h-5 text-gray-500 flex-shrink-0" />
              ) : isPending ? (
                <Clock className="w-5 h-5 text-blue-600 flex-shrink-0" />
              ) : (
                <XCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
              )}
              <h3 className="font-semibold text-slate-800 dark:text-slate-100">
                {metadata.rule_name || 'חוק לא ידוע'}
              </h3>
              <Badge className={statusBadge.color}>
                {statusBadge.label}
              </Badge>
            </div>
            
            {/* קישור למייל */}
            {metadata.mail_id && (
              <Link 
                to={createPageUrl('MailView', { id: metadata.mail_id })}
                className="flex items-center gap-2 text-sm text-blue-600 hover:underline mb-3"
              >
                <Mail className="w-4 h-4" />
                {metadata.mail_subject || 'ללא נושא'}
              </Link>
            )}
            
            {/* פעולות שבוצעו */}
            {actionsSummary.length > 0 && (
              <div className="mt-3">
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">פעולות:</p>
                <div className="flex flex-wrap gap-2">
                  {actionsSummary.map((action, idx) => {
                    const actionType = typeof action === 'string' 
                      ? action.split(':')[0].trim() 
                      : (action.action || action.action_type || 'unknown');
                    
                    // קביעת סטטוס וצבע לפעולה בודדת
                    let actionStatusText = '';
                    let actionBadgeClass = '';
                    
                    if (typeof action === 'string') {
                      if (action.includes('✅')) {
                        actionStatusText = '✅';
                        actionBadgeClass = 'bg-green-50 border-green-200';
                      } else if (action.includes('⏸️') || action.includes('Batch')) {
                        actionStatusText = '⏳';
                        actionBadgeClass = 'bg-blue-50 border-blue-200';
                      } else if (action.includes('⏭️')) {
                        actionStatusText = '⏭️';
                        actionBadgeClass = 'bg-gray-50 border-gray-200';
                      } else {
                        actionStatusText = '❌';
                        actionBadgeClass = 'bg-red-50 border-red-200';
                      }
                    } else {
                      switch (action.status) {
                        case 'success':
                          actionStatusText = '✅';
                          actionBadgeClass = 'bg-green-50 border-green-200';
                          break;
                        case 'pending_batch':
                          actionStatusText = '⏳';
                          actionBadgeClass = 'bg-blue-50 border-blue-200';
                          break;
                        case 'skipped':
                          actionStatusText = '⏭️';
                          actionBadgeClass = 'bg-gray-50 border-gray-200';
                          break;
                        case 'failed':
                        default:
                          actionStatusText = '❌';
                          actionBadgeClass = 'bg-red-50 border-red-200';
                          break;
                      }
                    }
                    
                    const Icon = actionIcons[actionType] || Zap;
                    
                    return (
                      <Badge 
                        key={idx} 
                        variant="outline" 
                        className={`text-xs ${actionBadgeClass}`}
                      >
                        <Icon className="w-3 h-3 ml-1" />
                        {actionLabels[actionType] || actionType}
                        {` ${actionStatusText}`}
                      </Badge>
                    );
                  })}
                </div>
              </div>
            )}
            
            {/* הודעת שגיאה */}
            {(isFailed || isPartialSuccess) && metadata.error_message && (
              <div className="mt-3 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-sm text-red-700 dark:text-red-300">
                {metadata.error_message}
              </div>
            )}
          </div>
          
          {/* תאריך וזמן - שימוש בתאריך logged_at אם קיים, אחרת created_date */}
          <div className="text-left text-sm text-slate-500 dark:text-slate-400 flex-shrink-0">
            {(() => {
              const dateToUse = metadata.logged_at || log.created_date;
              const dateObj = new Date(dateToUse);
              return (
                <>
                  <p>{format(dateObj, 'dd/MM/yyyy', { locale: he })}</p>
                  <p>{format(dateObj, 'HH:mm:ss', { locale: he })}</p>
                </>
              );
            })()}
            {metadata.execution_time_ms && (
              <p className="mt-1 text-xs flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {metadata.execution_time_ms}ms
              </p>
            )}
          </div>
        </div>
        
        {/* קישור לפרטים מלאים */}
        {metadata.mail_id && (
          <div className="mt-4 pt-3 border-t dark:border-slate-700">
            <Link to={createPageUrl('MailView', { id: metadata.mail_id })}>
              <Button variant="ghost" size="sm" className="w-full justify-center gap-2">
                צפייה בפרטים מלאים
                <ChevronLeft className="w-4 h-4" />
              </Button>
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}