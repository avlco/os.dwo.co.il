import React from 'react';
import { useTranslation } from 'react-i18next';
import { isBefore } from 'date-fns';
import { useDateTimeSettings } from '../DateTimeSettingsProvider';
import StatusBadge from '../ui/StatusBadge';
import AssigneeAvatars from './AssigneeAvatars';
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Edit, Trash2, Clock, CheckCircle2 } from 'lucide-react';

export default function TaskListView({
  tasks,
  onToggleComplete,
  onEdit,
  onDelete,
  onTaskClick,
  getCaseNumber,
}) {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'he';
  const { formatDate } = useDateTimeSettings();
  const today = new Date();

  const pendingTasks = tasks.filter(t => t.status !== 'completed' && t.status !== 'cancelled');
  const completedTasks = tasks.filter(t => t.status === 'completed');

  const isOverdue = (task) => {
    if (!task.due_date || task.status === 'completed') return false;
    return isBefore(new Date(task.due_date), today);
  };

  return (
    <div className="space-y-6">
      {/* Pending Tasks */}
      <div>
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-4 flex items-center gap-2">
          <Clock className="w-5 h-5 text-amber-500" />
          {t('tasks_page.open_tasks', { count: pendingTasks.length })}
        </h2>
        <div className="space-y-3">
          {pendingTasks.map((task) => (
            <Card
              key={task.id}
              className={`border transition-colors hover:shadow-md dark:bg-slate-800 dark:border-slate-700 cursor-pointer ${
                isOverdue(task) ? 'border-rose-200 dark:border-rose-800 bg-rose-50/30 dark:bg-rose-900/10' : 'border-slate-200'
              }`}
              onClick={() => onTaskClick?.(task)}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  <Checkbox
                    checked={false}
                    onCheckedChange={(e) => { e?.stopPropagation?.(); onToggleComplete(task); }}
                    onClick={(e) => e.stopPropagation()}
                    className="mt-1"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-slate-800 dark:text-slate-200">{task.title}</p>
                      <StatusBadge status={task.priority} />
                      <StatusBadge status={task.status} />
                      {task.case_id && (
                        <span className="text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded">
                          {getCaseNumber(task.case_id)}
                        </span>
                      )}
                    </div>
                    {task.description && (
                      <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">{task.description}</p>
                    )}
                    <div className="flex items-center gap-3 mt-2">
                      {task.due_date && (
                        <p className={`text-sm ${isOverdue(task) ? 'text-rose-600 dark:text-rose-400 font-medium' : 'text-slate-500 dark:text-slate-400'}`}>
                          {t('tasks_page.due_label')} {formatDate(task.due_date)}
                          {isOverdue(task) && ` ${t('tasks_page.overdue')}`}
                        </p>
                      )}
                      <AssigneeAvatars userIds={task.assigned_to} size="sm" />
                    </div>
                  </div>
                  <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" onClick={() => onEdit(task)} className="dark:hover:bg-slate-700">
                      <Edit className="w-4 h-4 text-slate-400" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => onDelete(task.id)} className="dark:hover:bg-slate-700">
                      <Trash2 className="w-4 h-4 text-rose-400" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {pendingTasks.length === 0 && (
            <p className="text-center text-slate-400 dark:text-slate-500 py-8">{t('tasks_page.no_open')}</p>
          )}
        </div>
      </div>

      {/* Completed Tasks */}
      {completedTasks.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-4 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-green-500" />
            {t('tasks_page.completed_tasks', { count: completedTasks.length })}
          </h2>
          <div className="space-y-3">
            {completedTasks.slice(0, 10).map((task) => (
              <Card key={task.id} className="border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 cursor-pointer" onClick={() => onTaskClick?.(task)}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    <Checkbox
                      checked={true}
                      onCheckedChange={() => onToggleComplete(task)}
                      onClick={(e) => e.stopPropagation()}
                      className="mt-1"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-slate-500 dark:text-slate-400 line-through">{task.title}</p>
                        <AssigneeAvatars userIds={task.assigned_to} size="sm" />
                      </div>
                      {task.completed_at && (
                        <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">
                          {t('tasks_page.completed_on')}{formatDate(task.completed_at)}
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
