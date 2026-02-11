import React from 'react';
import { useTranslation } from 'react-i18next';
import { DayPicker } from 'react-day-picker';
import { isSameDay, isAfter, isBefore, addDays } from 'date-fns';
import { useDateTimeSettings } from '../DateTimeSettingsProvider';
import { ITEM_COLORS } from './useCalendarData';
import { Clock, Briefcase } from 'lucide-react';

export default function CalendarSidebar({ currentDate, selectedDate, items, onDateSelect, getCaseNumber }) {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'he';
  const { formatDate } = useDateTimeSettings();
  const today = new Date();

  // Items for selected date or upcoming items
  const displayItems = selectedDate
    ? items.filter(item => isSameDay(item.start, selectedDate)).slice(0, 10)
    : items
        .filter(item => isAfter(item.start, today) || isSameDay(item.start, today))
        .sort((a, b) => a.start - b.start)
        .slice(0, 8);

  // Dates that have items (for dots in mini calendar)
  const datesWithItems = new Set(
    items.map(item => item.start.toDateString())
  );

  return (
    <div className="space-y-4">
      {/* Mini Calendar */}
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-3">
        <DayPicker
          mode="single"
          selected={selectedDate || currentDate}
          onSelect={(date) => date && onDateSelect(date)}
          month={currentDate}
          onMonthChange={() => {}}
          className="!m-0"
          classNames={{
            months: "flex flex-col",
            month: "space-y-2",
            caption: "flex justify-center relative items-center",
            caption_label: "text-sm font-medium text-slate-700 dark:text-slate-300",
            nav: "space-x-1 flex items-center",
            nav_button: "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100",
            table: "w-full border-collapse",
            head_row: "flex",
            head_cell: "text-slate-500 dark:text-slate-400 rounded-md w-8 font-normal text-[0.7rem]",
            row: "flex w-full mt-1",
            cell: "text-center text-sm relative",
            day: "h-8 w-8 p-0 font-normal rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300",
            day_selected: "bg-blue-600 text-white hover:bg-blue-700",
            day_today: "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-bold",
            day_outside: "text-slate-300 dark:text-slate-600",
          }}
          modifiers={{
            hasItems: (date) => datesWithItems.has(date.toDateString()),
          }}
          modifiersClassNames={{
            hasItems: "!font-bold",
          }}
          dir={isRTL ? 'rtl' : 'ltr'}
        />
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 px-2">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-amber-500" />
          <span className="text-[11px] text-slate-500 dark:text-slate-400">{t('docketing.legend_deadline')}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-blue-500" />
          <span className="text-[11px] text-slate-500 dark:text-slate-400">{t('docketing.legend_event')}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-emerald-500" />
          <span className="text-[11px] text-slate-500 dark:text-slate-400">{t('docketing.legend_task')}</span>
        </div>
      </div>

      {/* Items list */}
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
        <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-700">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            {selectedDate
              ? formatDate(selectedDate)
              : t('docketing.upcoming_deadlines')
            }
          </h3>
        </div>
        <div className="max-h-[400px] overflow-y-auto">
          {displayItems.length === 0 ? (
            <p className="text-center text-sm text-slate-400 dark:text-slate-500 py-6">
              {t('docketing.no_events')}
            </p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-700">
              {displayItems.map(item => {
                const colors = ITEM_COLORS[item.color] || ITEM_COLORS.blue;
                return (
                  <div key={item.id} className="px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                    <div className="flex items-start gap-2">
                      <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${colors.dot}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">
                          {item.title}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-slate-400 dark:text-slate-500 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {!selectedDate && formatDate(item.start)}
                            {!item.allDay && item.startMinutes != null && (
                              <> {String(Math.floor(item.startMinutes / 60)).padStart(2, '0')}:{String(item.startMinutes % 60).padStart(2, '0')}</>
                            )}
                          </span>
                          {item.caseId && (
                            <span className="text-xs text-slate-400 dark:text-slate-500 flex items-center gap-1">
                              <Briefcase className="w-3 h-3" />
                              {getCaseNumber(item.caseId)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
