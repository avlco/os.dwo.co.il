import React from 'react';
import { ITEM_COLORS } from './useCalendarData';

const TYPE_ICONS = {
  deadline: '📌',
  event: '📅',
  task: '✅',
};

export default function EventBlock({ item, style, onClick }) {
  const colors = ITEM_COLORS[item.color] || ITEM_COLORS.blue;
  const icon = TYPE_ICONS[item.type] || '';

  const formatTime = (minutes) => {
    if (minutes == null) return '';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };

  return (
    <div
      onClick={(e) => { e.stopPropagation(); onClick?.(item); }}
      style={style}
      className={`
        absolute inset-x-1 rounded-md px-2 py-1 cursor-pointer overflow-hidden
        border-s-[3px] ${colors.border} ${colors.light}
        hover:shadow-md transition-shadow z-10
      `}
    >
      <div className="flex items-center gap-1">
        <span className="text-[10px]">{icon}</span>
        <span className={`text-[11px] font-medium truncate ${colors.text}`}>
          {item.title}
        </span>
      </div>
      {item.startMinutes != null && (
        <p className={`text-[10px] ${colors.text} opacity-75`}>
          {formatTime(item.startMinutes)} - {formatTime(item.endMinutes)}
        </p>
      )}
    </div>
  );
}
