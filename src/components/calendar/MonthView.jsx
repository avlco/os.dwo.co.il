import React from 'react';
import { useTranslation } from 'react-i18next';
import { getMonthGrid } from './useCalendarData';
import DayCell from './DayCell';

const WEEK_DAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function MonthView({ currentDate, items, selectedDate, onDateClick }) {
  const { t, i18n } = useTranslation();
  const weekDays = i18n.language === 'he' ? t('docketing.week_days', { returnObjects: true }) : WEEK_DAYS_EN;

  const days = getMonthGrid(currentDate);

  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
      {/* Header row */}
      <div className="grid grid-cols-7">
        {weekDays.map((day, i) => (
          <div
            key={i}
            className="text-center text-xs font-semibold text-slate-500 dark:text-slate-400 py-2 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Day cells grid */}
      <div className="grid grid-cols-7">
        {days.map((day, i) => (
          <DayCell
            key={i}
            date={day}
            currentMonth={currentDate}
            items={items}
            onDateClick={onDateClick}
            isSelected={selectedDate && day.toDateString() === selectedDate.toDateString()}
          />
        ))}
      </div>
    </div>
  );
}
