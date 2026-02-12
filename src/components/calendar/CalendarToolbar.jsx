import React from 'react';
import { useTranslation } from 'react-i18next';
import { format, addMonths, subMonths, addWeeks, subWeeks, addDays, subDays } from 'date-fns';
import { he } from 'date-fns/locale';
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Plus, Calendar, RefreshCw } from 'lucide-react';

export default function CalendarToolbar({
  viewMode,
  onViewModeChange,
  currentDate,
  onDateChange,
  onNewEvent,
  onNewDeadline,
  onSyncCalendar,
  isSyncing,
}) {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'he';

  const navigatePrev = () => {
    if (viewMode === 'month') onDateChange(subMonths(currentDate, 1));
    else if (viewMode === 'week') onDateChange(subWeeks(currentDate, 1));
    else onDateChange(subDays(currentDate, 1));
  };

  const navigateNext = () => {
    if (viewMode === 'month') onDateChange(addMonths(currentDate, 1));
    else if (viewMode === 'week') onDateChange(addWeeks(currentDate, 1));
    else onDateChange(addDays(currentDate, 1));
  };

  const goToToday = () => onDateChange(new Date());

  const locale = i18n.language === 'he' ? he : undefined;
  const dateLabel = viewMode === 'month'
    ? format(currentDate, 'MMMM yyyy', { locale })
    : viewMode === 'week'
      ? format(currentDate, 'MMMM yyyy', { locale })
      : format(currentDate, 'EEEE, d MMMM yyyy', { locale });

  const PrevIcon = isRTL ? ChevronRight : ChevronLeft;
  const NextIcon = isRTL ? ChevronLeft : ChevronRight;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-200">
            {t('docketing.title')}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {onSyncCalendar && (
            <Button
              onClick={onSyncCalendar}
              variant="outline"
              size="icon"
              disabled={isSyncing}
              className="dark:border-slate-600"
              title={t('docketing.sync_calendar')}
            >
              <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
            </Button>
          )}
          <Button onClick={onNewDeadline} variant="outline" className="gap-1.5 dark:border-slate-600">
            <Calendar className="w-4 h-4" />
            {t('docketing.new_deadline')}
          </Button>
          <Button onClick={onNewEvent} className="gap-1.5 bg-slate-800 hover:bg-slate-700 dark:bg-slate-700">
            <Plus className="w-4 h-4" />
            {t('docketing.new_event')}
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={goToToday} className="dark:border-slate-600">
            {t('docketing.today')}
          </Button>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={navigatePrev} className="h-8 w-8">
              <PrevIcon className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={navigateNext} className="h-8 w-8">
              <NextIcon className="w-4 h-4" />
            </Button>
          </div>
          <h2 className="text-lg font-semibold text-slate-700 dark:text-slate-300 min-w-[180px]">
            {dateLabel}
          </h2>
        </div>

        <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
          <Button
            variant={viewMode === 'month' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => onViewModeChange('month')}
            className={viewMode === 'month' ? 'shadow-sm' : 'hover:bg-slate-200 dark:hover:bg-slate-700'}
          >
            {t('docketing.month_view')}
          </Button>
          <Button
            variant={viewMode === 'week' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => onViewModeChange('week')}
            className={viewMode === 'week' ? 'shadow-sm' : 'hover:bg-slate-200 dark:hover:bg-slate-700'}
          >
            {t('docketing.week_view')}
          </Button>
          <Button
            variant={viewMode === 'day' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => onViewModeChange('day')}
            className={viewMode === 'day' ? 'shadow-sm' : 'hover:bg-slate-200 dark:hover:bg-slate-700'}
          >
            {t('docketing.day_view')}
          </Button>
        </div>
      </div>
    </div>
  );
}
