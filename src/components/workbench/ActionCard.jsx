import React from 'react';
import { useTranslation } from 'react-i18next';
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Clock, Calendar, FileText, Paperclip, RefreshCw, Mail, Cloud, Loader2, Receipt } from 'lucide-react';

const actionIcons = {
  log_time: Clock,
  create_deadline: Calendar,
  create_task: FileText,
  attach_document: Paperclip,
  update_case_status: RefreshCw,
  send_email: Mail,
  create_calendar_event: Calendar,
  upload_to_dropbox: Cloud,
  create_invoice_draft: Receipt,
};

const actionColors = {
  log_time: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
  create_deadline: 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
  create_task: 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400',
  attach_document: 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400',
  update_case_status: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400',
  send_email: 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400',
  create_calendar_event: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
  upload_to_dropbox: 'bg-cyan-100 text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-400',
  create_invoice_draft: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400',
};

export default function ActionCard({ action, selected, onToggle, onUpdate, isProcessing }) {
  const { i18n } = useTranslation();
  const isRTL = i18n.language === 'he';
  const Icon = actionIcons[action.action_type] || FileText;
  const colorClass = actionColors[action.action_type] || 'bg-slate-100 text-slate-600';

  return (
    <Card className={`transition-all ${selected ? 'ring-2 ring-blue-500 dark:ring-blue-400' : 'opacity-70'} dark:bg-slate-800 dark:border-slate-700`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Checkbox
            checked={selected}
            onCheckedChange={onToggle}
            className="mt-1"
          />
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${colorClass}`}>
            {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Icon className="w-5 h-5" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-slate-800 dark:text-slate-200 text-sm">
              {action.action_label || action.action_type}
            </p>
            
            {action.action_type === 'log_time' && (
              <div className="flex items-center gap-2 mt-2">
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {isRTL ? 'שעות:' : 'Hours:'}
                </span>
                <Input
                  type="number"
                  step="0.25"
                  min="0"
                  value={action.hours || 0}
                  onChange={(e) => onUpdate({ ...action, hours: parseFloat(e.target.value) || 0 })}
                  className="w-20 h-7 text-sm dark:bg-slate-900 dark:border-slate-600"
                  disabled={!selected}
                />
              </div>
            )}

            {action.action_type === 'create_deadline' && action.days_offset !== undefined && (
              <div className="flex items-center gap-2 mt-2">
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {isRTL ? 'בעוד' : 'In'} {action.days_offset} {isRTL ? 'ימים' : 'days'}
                </span>
              </div>
            )}

            {action.action_type === 'create_task' && action.task_title && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 truncate">
                {action.task_title}
              </p>
            )}

            {action.action_type === 'update_case_status' && action.new_status && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {isRTL ? 'סטטוס חדש:' : 'New status:'} {action.new_status}
              </p>
            )}
            
            {action.action_type === 'upload_to_dropbox' && action.dropbox_folder_path && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 truncate">
                {isRTL ? 'נתיב:' : 'Path:'} {action.dropbox_folder_path}
              </p>
            )}

            {action.action_type === 'create_calendar_event' && action.calendar_event_template?.title_template && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 truncate">
                {action.calendar_event_template.title_template}
              </p>
            )}

            {action.action_type === 'send_email' && action.auto_reply_template && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 truncate">
                {action.auto_reply_template.substring(0, 50)}...
              </p>
            )}

            {action.action_type === 'create_invoice_draft' && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {isRTL ? 'יצירת טיוטת חשבונית' : 'Create invoice draft'}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}