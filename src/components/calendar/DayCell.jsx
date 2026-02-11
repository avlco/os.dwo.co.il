import React from 'react';
import { isSameDay, isSameMonth, isToday } from 'date-fns';
import { ITEM_COLORS } from './useCalendarData';

export default function DayCell({ date, currentMonth, items, onDateClick, isSelected }) {
  const isCurrentMonth = isSameMonth(date, currentMonth);
  const today = isToday(date);
  const dayItems = items.filter(item => isSameDay(item.start, date));
  const visibleItems = dayItems.slice(0, 3);
  const moreCount = dayItems.length - 3;

  return (
    <div
      onClick={() => onDateClick(date)}
      className={`
        min-h-[100px] border border-slate-100 dark:border-slate-700/50 p-1.5 cursor-pointer
        transition-colors relative
        ${!isCurrentMonth ? 'bg-slate-50/50 dark:bg-slate-900/30' : 'bg-white dark:bg-slate-800'}
        ${isSelected ? 'ring-2 ring-blue-400 dark:ring-blue-500 z-10' : ''}
        hover:bg-blue-50/50 dark:hover:bg-blue-900/10
      `}
    >
      <div className="flex items-center justify-between mb-1">
        <span className={`
          text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full
          ${today ? 'bg-blue-600 text-white' : ''}
          ${!isCurrentMonth ? 'text-slate-300 dark:text-slate-600' : 'text-slate-700 dark:text-slate-300'}
        `}>
          {date.getDate()}
        </span>
      </div>

      <div className="space-y-0.5">
        {visibleItems.map(item => {
          const colors = ITEM_COLORS[item.color] || ITEM_COLORS.blue;
          return (
            <div
              key={item.id}
              className={`text-[11px] px-1.5 py-0.5 rounded truncate ${colors.bg} ${colors.text}`}
              title={item.title}
            >
              {!item.allDay && item.startMinutes != null && (
                <span className="font-medium">
                  {String(Math.floor(item.startMinutes / 60)).padStart(2, '0')}:{String(item.startMinutes % 60).padStart(2, '0')}{' '}
                </span>
              )}
              {item.title}
            </div>
          );
        })}
        {moreCount > 0 && (
          <div className="text-[10px] text-slate-400 dark:text-slate-500 px-1.5">
            +{moreCount}
          </div>
        )}
      </div>
    </div>
  );
}
