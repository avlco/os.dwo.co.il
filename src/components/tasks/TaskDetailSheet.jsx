import React from 'react';
import { useTranslation } from 'react-i18next';
import { useDateTimeSettings } from '../DateTimeSettingsProvider';
import { isBefore } from 'date-fns';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import StatusBadge from '../ui/StatusBadge';
import AssigneeAvatars from './AssigneeAvatars';
import { Edit, Trash2, Calendar, Briefcase, User, Clock, Paperclip, Mail, ExternalLink } from 'lucide-react';

export default function TaskDetailSheet({ task, open, onOpenChange, onEdit, onDelete, getCaseNumber }) {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'he';
  const { formatDate } = useDateTimeSettings();

  if (!task) return null;

  const today = new Date();
  const isOverdue = task.due_date && task.status !== 'completed' && isBefore(new Date(task.due_date), today);

  const taskTypes = {
    review_oa: t('tasks_page.type_review_oa'),
    respond_to_client: t('tasks_page.type_respond_client'),
    draft_report: t('tasks_page.type_draft_report'),
    file_application: t('tasks_page.type_file_application'),
    pay_renewal_fee: t('tasks_page.type_pay_renewal'),
    prepare_response: t('tasks_page.type_prepare_response'),
    custom: t('tasks_page.type_custom'),
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side={isRTL ? 'left' : 'right'} className="w-[450px] sm:w-[520px] dark:bg-slate-800 dark:border-slate-700 overflow-y-auto">
        <SheetHeader className="pb-4 border-b dark:border-slate-700">
          <div className="flex items-center justify-between gap-2">
            <SheetTitle className="dark:text-slate-200 text-start flex-1">
              {task.title}
            </SheetTitle>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" onClick={() => onEdit(task)} className="dark:hover:bg-slate-700">
                <Edit className="w-4 h-4 text-slate-400" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => onDelete(task.id)} className="dark:hover:bg-slate-700">
                <Trash2 className="w-4 h-4 text-rose-400" />
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap mt-2">
            <StatusBadge status={task.status} />
            <StatusBadge status={task.priority} />
            {task.task_type && task.task_type !== 'custom' && (
              <Badge variant="outline" className="dark:border-slate-600 dark:text-slate-300">
                {taskTypes[task.task_type] || task.task_type}
              </Badge>
            )}
          </div>
        </SheetHeader>

        <div className="mt-6 space-y-5">
          {task.description && (
            <div>
              <h4 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">
                {t('tasks_page.description_field')}
              </h4>
              <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                {task.description}
              </p>
            </div>
          )}

          <div className="space-y-3">
            {task.case_id && (
              <div className="flex items-center gap-3">
                <Briefcase className="w-4 h-4 text-slate-400" />
                <span className="text-sm text-slate-700 dark:text-slate-300">
                  {getCaseNumber(task.case_id)}
                </span>
              </div>
            )}

            {task.due_date && (
              <div className="flex items-center gap-3">
                <Calendar className="w-4 h-4 text-slate-400" />
                <span className={`text-sm ${
                  isOverdue
                    ? 'text-rose-600 dark:text-rose-400 font-medium'
                    : 'text-slate-700 dark:text-slate-300'
                }`}>
                  {formatDate(task.due_date)}
                  {isOverdue && ` ${t('tasks_page.overdue')}`}
                </span>
              </div>
            )}

            {task.assigned_to && task.assigned_to.length > 0 && (
              <div className="flex items-center gap-3">
                <User className="w-4 h-4 text-slate-400" />
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-500 dark:text-slate-400">
                    {t('tasks_page.assigned_to')}
                  </span>
                  <AssigneeAvatars userIds={task.assigned_to} size="sm" maxShow={5} />
                </div>
              </div>
            )}

            {task.created_date && (
              <div className="flex items-center gap-3">
                <Clock className="w-4 h-4 text-slate-400" />
                <span className="text-sm text-slate-500 dark:text-slate-400">
                  {t('tasks_page.created_on')}{formatDate(task.created_date)}
                </span>
              </div>
            )}

            {task.completed_at && (
              <div className="flex items-center gap-3">
                <Clock className="w-4 h-4 text-green-500" />
                <span className="text-sm text-green-600 dark:text-green-400">
                  {t('tasks_page.completed_on')}{formatDate(task.completed_at)}
                </span>
              </div>
            )}

            {task.metadata?.source_mail_id && (
              <div className="flex items-center gap-3">
                <Mail className="w-4 h-4 text-slate-400" />
                <span className="text-sm text-slate-500 dark:text-slate-400">
                  {t('tasks_page.source_mail', 'נוצר ממייל')}
                </span>
              </div>
            )}

            {task.metadata?.dropbox_link && (
              <div className="flex items-center gap-3">
                <ExternalLink className="w-4 h-4 text-slate-400" />
                <a
                  href={task.metadata.dropbox_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                >
                  {t('tasks_page.view_in_dropbox', 'צפה ב-Dropbox')}
                </a>
              </div>
            )}
          </div>

          {/* Attachments */}
          {((task.metadata?.attachments || task.attachments || []).length > 0) && (
            <div>
              <h4 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">
                {t('tasks_page.attachments')}
              </h4>
              <div className="space-y-2">
                {(task.metadata?.attachments || task.attachments || []).map((att, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm bg-slate-50 dark:bg-slate-900 rounded-lg px-3 py-2">
                    <Paperclip className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    {att.url ? (
                      <a
                        href={att.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="truncate flex-1 text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        {att.name}
                      </a>
                    ) : (
                      <span className="truncate flex-1 dark:text-slate-300">{att.name}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
