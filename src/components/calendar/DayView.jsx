import React from 'react';
import { useTranslation } from 'react-i18next';
import { format, isToday } from 'date-fns';
import TimeGrid from './TimeGrid';

export default function DayView({ currentDate, items, onTimeSlotClick, onEventClick }) {
  const { t, i18n } = useTranslation();
  const isHe = i18n.language === 'he';
  const today = isToday(currentDate);

  const dayOfWeek = currentDate.getDay();
  const weekDays = isHe ? t('docketing.week_days', { returnObjects: true }) : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
      {/* Day header */}
      <div className="flex">
        <div className="w-16 flex-shrink-0" />
        <div className="flex-1">
          <div className="text-center py-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
            <div className="text-sm text-slate-500 dark:text-slate-400">
              {weekDays[dayOfWeek]}
            </div>
            <div className={`
              text-2xl font-bold mt-1
              ${today
                ? 'w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center mx-auto'
                : 'text-slate-700 dark:text-slate-300'
              }
            `}>
              {format(currentDate, 'd')}
            </div>
          </div>
        </div>
      </div>

      {/* Time grid */}
      <TimeGrid
        dates={[currentDate]}
        items={items}
        onTimeSlotClick={onTimeSlotClick}
        onEventClick={onEventClick}
      />
    </div>
  );
}
