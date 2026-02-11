import React, { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { isSameDay } from 'date-fns';
import EventBlock from './EventBlock';
import { ITEM_COLORS } from './useCalendarData';

const HOUR_HEIGHT = 60; // px per hour
const HOURS = Array.from({ length: 24 }, (_, i) => i);

export default function TimeGrid({ dates, items, onTimeSlotClick, onEventClick }) {
  const { i18n } = useTranslation();
  const isRTL = i18n.language === 'he';
  const gridRef = useRef(null);

  const isSingleDay = dates.length === 1;

  // Separate all-day items and timed items
  const allDayItems = items.filter(item => item.allDay);
  const timedItems = items.filter(item => !item.allDay && item.startMinutes != null);

  // Group items by date
  const getDateItems = (date, list) => list.filter(item => isSameDay(item.start, date));

  const handleGridClick = (date, e) => {
    if (!gridRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const hour = Math.floor(y / HOUR_HEIGHT);
    const minutes = Math.floor((y % HOUR_HEIGHT) / HOUR_HEIGHT * 60);
    const clickedMinutes = hour * 60 + minutes;
    onTimeSlotClick?.(date, clickedMinutes);
  };

  return (
    <div className="flex flex-col">
      {/* All-day section */}
      {allDayItems.length > 0 && (
        <div className="flex border-b border-slate-200 dark:border-slate-700">
          <div className="w-16 flex-shrink-0 py-2 px-2 text-[10px] text-slate-400 dark:text-slate-500 text-center">
            {isRTL ? 'כל היום' : 'All day'}
          </div>
          <div className={`flex-1 grid ${isSingleDay ? 'grid-cols-1' : 'grid-cols-7'}`}>
            {dates.map((date, i) => {
              const dayAllDay = getDateItems(date, allDayItems);
              return (
                <div key={i} className="border-s border-slate-100 dark:border-slate-700/50 py-1 px-1 min-h-[32px]">
                  {dayAllDay.map(item => {
                    const colors = ITEM_COLORS[item.color] || ITEM_COLORS.blue;
                    return (
                      <div
                        key={item.id}
                        onClick={() => onEventClick?.(item)}
                        className={`text-[11px] px-1.5 py-0.5 rounded mb-0.5 truncate cursor-pointer ${colors.bg} ${colors.text}`}
                      >
                        {item.title}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Time grid */}
      <div className="flex overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }} ref={gridRef}>
        {/* Hour labels */}
        <div className="w-16 flex-shrink-0">
          {HOURS.map(hour => (
            <div
              key={hour}
              className="text-[11px] text-slate-400 dark:text-slate-500 text-center border-b border-slate-100 dark:border-slate-700/50"
              style={{ height: HOUR_HEIGHT }}
            >
              <span className="relative -top-2">
                {String(hour).padStart(2, '0')}:00
              </span>
            </div>
          ))}
        </div>

        {/* Day columns */}
        <div className={`flex-1 grid ${isSingleDay ? 'grid-cols-1' : 'grid-cols-7'}`}>
          {dates.map((date, colIdx) => {
            const dayTimed = getDateItems(date, timedItems);
            return (
              <div
                key={colIdx}
                className="relative border-s border-slate-100 dark:border-slate-700/50"
                onClick={(e) => handleGridClick(date, e)}
              >
                {/* Hour grid lines */}
                {HOURS.map(hour => (
                  <div
                    key={hour}
                    className="border-b border-slate-100 dark:border-slate-700/50"
                    style={{ height: HOUR_HEIGHT }}
                  />
                ))}

                {/* Timed events */}
                {dayTimed.map(item => {
                  const top = (item.startMinutes / 60) * HOUR_HEIGHT;
                  const duration = (item.endMinutes - item.startMinutes);
                  const height = Math.max((duration / 60) * HOUR_HEIGHT, 20);
                  return (
                    <EventBlock
                      key={item.id}
                      item={item}
                      style={{ top: `${top}px`, height: `${height}px` }}
                      onClick={onEventClick}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
