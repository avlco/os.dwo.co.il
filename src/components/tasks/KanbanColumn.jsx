import React from 'react';
import { Droppable } from '@hello-pangea/dnd';
import { useTranslation } from 'react-i18next';
import TaskCard from './TaskCard';

const STATUS_COLORS = {
  pending: 'bg-amber-500',
  awaiting_approval: 'bg-purple-500',
  in_progress: 'bg-blue-500',
  completed: 'bg-green-500',
  cancelled: 'bg-slate-400',
};

export default function KanbanColumn({ status, tasks, onTaskClick, getCaseNumber }) {
  const { t } = useTranslation();

  const statusLabel = t(`tasks_page.column_${status}`);
  const dotColor = STATUS_COLORS[status] || 'bg-slate-400';

  return (
    <div className="flex flex-col min-w-[280px] max-w-[320px] flex-1">
      <div className="flex items-center gap-2 px-3 py-2 mb-3 text-start">
        <div className={`w-2.5 h-2.5 rounded-full ${dotColor}`} />
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
          {statusLabel}
        </h3>
        <span className="text-xs text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded-full">
          {tasks.length}
        </span>
      </div>

      <Droppable droppableId={status}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`
              flex-1 space-y-2 p-2 rounded-lg min-h-[200px] transition-colors
              ${snapshot.isDraggingOver
                ? 'bg-blue-50 dark:bg-blue-900/20 border-2 border-dashed border-blue-300 dark:border-blue-600'
                : 'bg-slate-50 dark:bg-slate-900/50 border-2 border-transparent'
              }
            `}
          >
            {tasks.map((task, index) => (
              <TaskCard
                key={task.id}
                task={task}
                index={index}
                onClick={onTaskClick}
                getCaseNumber={getCaseNumber}
              />
            ))}
            {provided.placeholder}
            {tasks.length === 0 && !snapshot.isDraggingOver && (
              <p className="text-center text-xs text-slate-400 dark:text-slate-500 py-8">
                {t('tasks_page.no_open')}
              </p>
            )}
          </div>
        )}
      </Droppable>
    </div>
  );
}
