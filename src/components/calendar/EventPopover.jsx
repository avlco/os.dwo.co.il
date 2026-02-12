import React from 'react';
import { useTranslation } from 'react-i18next';
import { useDateTimeSettings } from '../DateTimeSettingsProvider';
import { ITEM_COLORS } from './useCalendarData';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Edit, Trash2, Clock, Briefcase, MapPin, Users, ExternalLink, Video } from 'lucide-react';

const TYPE_LABELS = {
  deadline: { icon: '📌' },
  event: { icon: '📅' },
  task: { icon: '✅' },
};

export default function EventPopover({ item, open, onOpenChange, onEdit, onDelete, getCaseNumber }) {
  const { t } = useTranslation();
  const { formatDate } = useDateTimeSettings();

  if (!item) return null;

  const colors = ITEM_COLORS[item.color] || ITEM_COLORS.blue;
  const typeInfo = TYPE_LABELS[item.type] || TYPE_LABELS.event;

  const formatTime = (minutes) => {
    if (minutes == null) return '';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm dark:bg-slate-800 dark:border-slate-700">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="dark:text-slate-200 flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${colors.dot}`} />
              {item.title}
            </DialogTitle>
            <div className="flex gap-1">
              {item.type !== 'task' && (
                <>
                  <Button variant="ghost" size="icon" onClick={() => onEdit?.(item)} className="dark:hover:bg-slate-700 h-8 w-8">
                    <Edit className="w-4 h-4 text-slate-400" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => onDelete?.(item)} className="dark:hover:bg-slate-700 h-8 w-8">
                    <Trash2 className="w-4 h-4 text-rose-400" />
                  </Button>
                </>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-3 mt-2">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="dark:border-slate-600 dark:text-slate-300">
              {typeInfo.icon} {t(`docketing.legend_${item.type}`)}
            </Badge>
            {item.eventType && (
              <Badge variant="secondary" className="dark:bg-slate-700 dark:text-slate-300">
                {item.eventType}
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-400">
            <Clock className="w-4 h-4" />
            {item.allDay ? (
              <span>{formatDate(item.start)} - {t('docketing.event_all_day')}</span>
            ) : (
              <span>
                {formatDate(item.start)}
                {item.startMinutes != null && ` ${formatTime(item.startMinutes)}`}
                {item.endMinutes != null && ` - ${formatTime(item.endMinutes)}`}
              </span>
            )}
          </div>

          {item.caseId && (
            <div className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-400">
              <Briefcase className="w-4 h-4" />
              <span>{getCaseNumber?.(item.caseId) || item.caseId}</span>
            </div>
          )}

          {item.location && (
            <div className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-400">
              <MapPin className="w-4 h-4" />
              <span>{item.location}</span>
            </div>
          )}

          {item.metadata?.meet_link && (
            <a
              href={item.metadata.meet_link}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              <Video className="w-4 h-4" />
              <span>{t('docketing.meet_link')}</span>
            </a>
          )}

          {(item.metadata?.client_name || item.metadata?.employee_name) && (
            <div className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-400">
              <Users className="w-4 h-4" />
              <span>
                {[item.metadata?.client_name, item.metadata?.employee_name].filter(Boolean).join(', ')}
              </span>
            </div>
          )}

          {item.attendees && item.attendees.length > 0 && !item.metadata?.client_name && !item.metadata?.employee_name && (
            <div className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-400">
              <Users className="w-4 h-4" />
              <span>{item.attendees.join(', ')}</span>
            </div>
          )}

          {item.description && (
            <p className="text-sm text-slate-600 dark:text-slate-400 pt-2 border-t dark:border-slate-700 whitespace-pre-wrap">
              {item.description}
            </p>
          )}

          {item.metadata?.html_link && (
            <a
              href={item.metadata.html_link}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              <ExternalLink className="w-4 h-4" />
              Google Calendar
            </a>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
