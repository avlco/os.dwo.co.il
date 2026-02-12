import React from 'react';
import { DragDropContext } from '@hello-pangea/dnd';
import { useTranslation } from 'react-i18next';
import KanbanColumn from './KanbanColumn';
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

const COLUMN_ORDER = ['pending', 'in_progress', 'awaiting_approval', 'completed'];

export default function KanbanBoard({ tasks, onDragEnd, onTaskClick, getCaseNumber }) {
  const { i18n } = useTranslation();
  const isRTL = i18n.language === 'he';

  const tasksByStatus = {};
  for (const status of COLUMN_ORDER) {
    tasksByStatus[status] = [];
  }

  for (const task of tasks) {
    const status = COLUMN_ORDER.includes(task.status) ? task.status : 'pending';
    tasksByStatus[status].push(task);
  }

  // Sort tasks within each column by sort_order, falling back to created_date
  for (const status of COLUMN_ORDER) {
    tasksByStatus[status].sort((a, b) => {
      if (a.sort_order != null && b.sort_order != null) {
        return a.sort_order - b.sort_order;
      }
      return new Date(b.created_date || 0) - new Date(a.created_date || 0);
    });
  }

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <ScrollArea className="w-full" dir={isRTL ? 'rtl' : 'ltr'}>
        <div className="flex gap-4 pb-4 min-w-max">
          {COLUMN_ORDER.map(status => (
            <KanbanColumn
              key={status}
              status={status}
              tasks={tasksByStatus[status]}
              onTaskClick={onTaskClick}
              getCaseNumber={getCaseNumber}
            />
          ))}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </DragDropContext>
  );
}
