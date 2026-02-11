import React from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const COLOR_OPTIONS = [
  { value: 'blue', label: 'color_blue', class: 'bg-blue-500' },
  { value: 'red', label: 'color_red', class: 'bg-rose-500' },
  { value: 'green', label: 'color_green', class: 'bg-emerald-500' },
  { value: 'purple', label: 'color_purple', class: 'bg-purple-500' },
  { value: 'orange', label: 'color_orange', class: 'bg-orange-500' },
  { value: 'amber', label: 'color_amber', class: 'bg-amber-500' },
];

export default function EventDialog({
  open,
  onOpenChange,
  formData,
  setFormData,
  onSubmit,
  isEditing,
  isSubmitting,
  mode = 'event', // 'event' | 'deadline'
}) {
  const { t } = useTranslation();

  const { data: cases = [] } = useQuery({
    queryKey: ['cases'],
    queryFn: () => base44.entities.Case.list('-created_date', 500),
  });

  const eventTypes = [
    { value: 'meeting', label: t('docketing.type_meeting') },
    { value: 'hearing', label: t('docketing.type_hearing') },
    { value: 'call', label: t('docketing.type_call') },
    { value: 'reminder', label: t('docketing.type_reminder') },
    { value: 'custom', label: t('docketing.type_custom') },
  ];

  const deadlineTypes = [
    { value: 'office_action_response', label: t('docketing.type_office_action') },
    { value: 'renewal', label: t('docketing.type_renewal') },
    { value: 'opposition_response', label: t('docketing.type_opposition') },
    { value: 'appeal', label: t('docketing.type_appeal') },
    { value: 'payment', label: t('docketing.type_payment') },
    { value: 'filing', label: t('docketing.type_filing') },
    { value: 'custom', label: t('docketing.type_custom') },
  ];

  const isEventMode = mode === 'event';
  const types = isEventMode ? eventTypes : deadlineTypes;

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg dark:bg-slate-800 dark:border-slate-700">
        <DialogHeader>
          <DialogTitle className="dark:text-slate-200">
            {isEditing
              ? (isEventMode ? t('docketing.edit_event') : t('docketing.edit_deadline'))
              : (isEventMode ? t('docketing.new_event') : t('docketing.new_deadline'))
            }
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          {/* Title / Description */}
          <div className="space-y-2">
            <Label className="dark:text-slate-300">
              {isEventMode ? t('docketing.event_title') : t('docketing.description_field')}
            </Label>
            <Input
              value={isEventMode ? formData.title : formData.description}
              onChange={(e) => setFormData({
                ...formData,
                [isEventMode ? 'title' : 'description']: e.target.value
              })}
              required
              className="dark:bg-slate-900 dark:border-slate-600"
            />
          </div>

          {isEventMode && (
            <div className="space-y-2">
              <Label className="dark:text-slate-300">{t('docketing.event_description')}</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={2}
                className="dark:bg-slate-900 dark:border-slate-600"
              />
            </div>
          )}

          {/* Type + Color */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="dark:text-slate-300">
                {isEventMode ? t('docketing.event_type') : t('docketing.type_field')}
              </Label>
              <Select
                value={isEventMode ? formData.event_type : formData.deadline_type}
                onValueChange={(v) => setFormData({
                  ...formData,
                  [isEventMode ? 'event_type' : 'deadline_type']: v
                })}
              >
                <SelectTrigger className="dark:bg-slate-900 dark:border-slate-600">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
                  {types.map(type => (
                    <SelectItem key={type.value} value={type.value} className="dark:text-slate-200">
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="dark:text-slate-300">{t('docketing.event_color')}</Label>
              <div className="flex items-center gap-2 pt-1">
                {COLOR_OPTIONS.map(c => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setFormData({ ...formData, color: c.value })}
                    className={`w-7 h-7 rounded-full ${c.class} transition-transform ${
                      formData.color === c.value ? 'ring-2 ring-offset-2 ring-slate-400 dark:ring-offset-slate-800 scale-110' : 'hover:scale-105'
                    }`}
                    title={t(`docketing.${c.label}`)}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Date */}
          <div className="space-y-2">
            <Label className="dark:text-slate-300">
              {isEventMode ? t('docketing.event_start') : t('docketing.due_date_field')}
            </Label>
            <Input
              type="date"
              value={formData.due_date}
              onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
              required
              className="dark:bg-slate-900 dark:border-slate-600"
            />
          </div>

          {/* All day toggle + time fields for events */}
          {isEventMode && (
            <>
              <div className="flex items-center justify-between">
                <Label className="dark:text-slate-300">{t('docketing.event_all_day')}</Label>
                <Switch
                  checked={formData.all_day}
                  onCheckedChange={(v) => setFormData({ ...formData, all_day: v })}
                />
              </div>

              {!formData.all_day && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="dark:text-slate-300">{t('docketing.event_start_time')}</Label>
                    <Input
                      type="time"
                      value={formData.start_time}
                      onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                      className="dark:bg-slate-900 dark:border-slate-600"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="dark:text-slate-300">{t('docketing.event_end_time')}</Label>
                    <Input
                      type="time"
                      value={formData.end_time}
                      onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                      className="dark:bg-slate-900 dark:border-slate-600"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label className="dark:text-slate-300">{t('docketing.event_location')}</Label>
                <Input
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  className="dark:bg-slate-900 dark:border-slate-600"
                />
              </div>
            </>
          )}

          {/* Deadline-specific: reminders + critical */}
          {!isEventMode && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="dark:text-slate-300">{t('docketing.reminder_1')}</Label>
                  <Input
                    type="date"
                    value={formData.reminder_date_1}
                    onChange={(e) => setFormData({ ...formData, reminder_date_1: e.target.value })}
                    className="dark:bg-slate-900 dark:border-slate-600"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="dark:text-slate-300">{t('docketing.reminder_2')}</Label>
                  <Input
                    type="date"
                    value={formData.reminder_date_2}
                    onChange={(e) => setFormData({ ...formData, reminder_date_2: e.target.value })}
                    className="dark:bg-slate-900 dark:border-slate-600"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <Label className="dark:text-slate-300">{t('docketing.critical')}</Label>
                <Switch
                  checked={formData.is_critical}
                  onCheckedChange={(v) => setFormData({ ...formData, is_critical: v })}
                />
              </div>
            </>
          )}

          {/* Case */}
          <div className="space-y-2">
            <Label className="dark:text-slate-300">{t('docketing.case_field')}</Label>
            <Select value={formData.case_id || ''} onValueChange={(v) => setFormData({ ...formData, case_id: v })}>
              <SelectTrigger className="dark:bg-slate-900 dark:border-slate-600">
                <SelectValue placeholder={t('docketing.select_case')} />
              </SelectTrigger>
              <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
                {cases.map(c => (
                  <SelectItem key={c.id} value={c.id} className="dark:text-slate-200">
                    {c.case_number} - {c.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="dark:border-slate-600">
              {t('docketing.cancel')}
            </Button>
            <Button
              type="submit"
              className="bg-slate-800 hover:bg-slate-700 dark:bg-slate-700"
              disabled={isSubmitting}
            >
              {isEditing ? t('docketing.save') : t('docketing.create')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
