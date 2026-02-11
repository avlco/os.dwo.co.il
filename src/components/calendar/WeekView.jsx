import React from 'react';
import { useTranslation } from 'react-i18next';
import { startOfWeek, addDays, format, isToday } from 'date-fns';
import TimeGrid from './TimeGrid';

const WEEK_DAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function WeekView({ currentDate, items, onTimeSlotClick, onEventClick }) {
  const { t, i18n } = useTranslation();
  const isHe = i18n.language === 'he';
  const weekDayLabels = isHe ? t('docketing.week_days', { returnObjects: true }) : WEEK_DAYS_EN;

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 });
  const dates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
      {/* Day headers */}
      <div className="flex">
        <div className="w-16 flex-shrink-0" />
        <div className="flex-1 grid grid-cols-7">
          {dates.map((date, i) => {
            const today = isToday(date);
            return (
              <div
                key={i}
                className="text-center py-2 border-s border-b border-slate-100 dark:border-slate-700/50 bg-slate-50 dark:bg-slate-900/50"
              >
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  {weekDayLabels[i]}
                </div>
                <div className={`
                  text-lg font-semibold mt-0.5
                  ${today
                    ? 'w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center mx-auto'
                    : 'text-slate-700 dark:text-slate-300'
                  }
                `}>
                  {format(date, 'd')}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Time grid */}
      <TimeGrid
        dates={dates}
        items={items}
        onTimeSlotClick={onTimeSlotClick}
        onEventClick={onEventClick}
      />
    </div>
  );
}
