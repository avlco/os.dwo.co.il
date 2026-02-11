import React from 'react';
import { Draggable } from '@hello-pangea/dnd';
import { useTranslation } from 'react-i18next';
import { isBefore } from 'date-fns';
import { useDateTimeSettings } from '../DateTimeSettingsProvider';
import StatusBadge from '../ui/StatusBadge';
import AssigneeAvatars from './AssigneeAvatars';
import { Clock, Briefcase } from 'lucide-react';

export default function TaskCard({ task, index, onClick, getCaseNumber }) {
  const { t } = useTranslation();
  const { formatDate } = useDateTimeSettings();
  const today = new Date();

  const isOverdue = task.due_date && task.status !== 'completed' && isBefore(new Date(task.due_date), today);

  return (
    <Draggable draggableId={String(task.id)} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          onClick={() => onClick?.(task)}
          className={`
            p-3 rounded-lg border cursor-pointer transition-shadow
            ${snapshot.isDragging
              ? 'shadow-lg ring-2 ring-blue-300 dark:ring-blue-600 bg-white dark:bg-slate-700'
              : 'bg-white dark:bg-slate-800 hover:shadow-md'
            }
            ${isOverdue
              ? 'border-rose-200 dark:border-rose-800'
              : 'border-slate-200 dark:border-slate-700'
            }
          `}
        >
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200 line-clamp-2 flex-1">
                {task.title}
              </p>
              <StatusBadge status={task.priority} />
            </div>

            {task.description && (
              <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                {task.description}
              </p>
            )}

            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                {task.case_id && (
                  <span className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">
                    <Briefcase className="w-3 h-3" />
                    {getCaseNumber(task.case_id)}
                  </span>
                )}
                {task.due_date && (
                  <span className={`flex items-center gap-1 text-xs px-1.5 py-0.5 rounded ${
                    isOverdue
                      ? 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/30'
                      : 'text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700'
                  }`}>
                    <Clock className="w-3 h-3" />
                    {formatDate(task.due_date)}
                  </span>
                )}
              </div>
              <AssigneeAvatars userIds={task.assigned_to} size="sm" />
            </div>
          </div>
        </div>
      )}
    </Draggable>
  );
}
