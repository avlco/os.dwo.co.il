import React from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Video, User } from 'lucide-react';
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import SearchableSelect from '@/components/ui/searchable-select';

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

  const { data: clients = [] } = useQuery({
    queryKey: ['clients'],
    queryFn: () => base44.entities.Client.list('-created_date', 500),
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => base44.entities.User.list(),
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

  const caseOptions = cases.map(c => ({
    value: c.id,
    label: `${c.case_number} - ${c.title}`,
  }));

  const clientOptions = clients.map(c => ({
    value: c.id,
    label: c.name,
  }));

  const userOptions = users.map(u => ({
    value: u.id,
    label: u.full_name || u.email,
  }));

  // Auto-lookup assigned lawyer when case changes (deadline mode)
  const handleCaseChange = (caseId) => {
    const updates = { ...formData, case_id: caseId };
    if (!isEventMode && caseId) {
      const selectedCase = cases.find(c => c.id === caseId);
      if (selectedCase?.assigned_lawyer_id) {
        updates.reminder_recipient_id = selectedCase.assigned_lawyer_id;
      }
    }
    setFormData(updates);
  };

  // Get reminder recipient name
  const reminderRecipient = !isEventMode && formData.reminder_recipient_id
    ? users.find(u => u.id === formData.reminder_recipient_id)
    : null;

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto dark:bg-slate-800 dark:border-slate-700">
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
              {isEventMode ? t('docketing.event_title') : t('docketing.description_field')} <span className="text-rose-500">*</span>
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

          {/* ===== EVENT MODE: Date + Time in one row ===== */}
          {isEventMode && (
            <>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="all_day"
                  checked={formData.all_day}
                  onCheckedChange={(v) => setFormData({ ...formData, all_day: !!v })}
                />
                <Label htmlFor="all_day" className="dark:text-slate-300 text-sm cursor-pointer">
                  {t('docketing.event_all_day')}
                </Label>
              </div>

              <div className={`grid gap-4 ${formData.all_day ? 'grid-cols-1' : 'grid-cols-3'}`}>
                <div className="space-y-2">
                  <Label className="dark:text-slate-300">{t('docketing.event_start')} <span className="text-rose-500">*</span></Label>
                  <Input
                    type="date"
                    value={formData.due_date}
                    onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                    required
                    className="dark:bg-slate-900 dark:border-slate-600"
                  />
                </div>
                {!formData.all_day && (
                  <>
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
                  </>
                )}
              </div>

              {/* Location */}
              <div className="space-y-2">
                <Label className="dark:text-slate-300">{t('docketing.event_location')}</Label>
                <Input
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  className="dark:bg-slate-900 dark:border-slate-600"
                />
              </div>

              {/* Google Meet checkbox */}
              <div className="flex items-center gap-3">
                <Checkbox
                  id="create_meet"
                  checked={formData.create_meet_link || false}
                  onCheckedChange={(v) => setFormData({ ...formData, create_meet_link: !!v })}
                />
                <Label htmlFor="create_meet" className="dark:text-slate-300 flex items-center gap-2 cursor-pointer">
                  <Video className="w-4 h-4 text-blue-500" />
                  {t('docketing.create_meet_link')}
                </Label>
              </div>
            </>
          )}

          {/* ===== DEADLINE MODE: Due Date + Reminders in one row ===== */}
          {!isEventMode && (
            <>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label className="dark:text-slate-300">{t('docketing.due_date_field')} <span className="text-rose-500">*</span></Label>
                  <Input
                    type="date"
                    value={formData.due_date}
                    onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                    required
                    className="dark:bg-slate-900 dark:border-slate-600"
                  />
                </div>
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

              {/* Critical toggle with help text */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="dark:text-slate-300">{t('docketing.critical')}</Label>
                  <p className="text-xs text-slate-400 dark:text-slate-500">{t('docketing.critical_help')}</p>
                </div>
                <Switch
                  checked={formData.is_critical}
                  onCheckedChange={(v) => setFormData({
                    ...formData,
                    is_critical: v,
                    color: v ? 'red' : (formData.color === 'red' ? 'amber' : formData.color)
                  })}
                />
              </div>
            </>
          )}

          {/* Case - Searchable */}
          <div className="space-y-2">
            <Label className="dark:text-slate-300">{t('docketing.case_field')}</Label>
            <SearchableSelect
              value={formData.case_id || ''}
              onValueChange={handleCaseChange}
              options={caseOptions}
              placeholder={t('docketing.select_case')}
              searchPlaceholder={t('common.search_placeholder')}
              emptyMessage={t('docketing.no_cases_found')}
            />
            {/* Show reminder recipient for deadlines */}
            {reminderRecipient && (
              <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                <User className="w-3 h-3" />
                {t('docketing.reminder_to_lawyer')}: {reminderRecipient.full_name}
              </p>
            )}
          </div>

          {/* Participants (event mode only) */}
          {isEventMode && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="dark:text-slate-300">{t('docketing.client_participant')}</Label>
                <SearchableSelect
                  value={formData.client_id || ''}
                  onValueChange={(v) => setFormData({ ...formData, client_id: v })}
                  options={clientOptions}
                  placeholder={t('docketing.select_client')}
                  searchPlaceholder={t('common.search_placeholder')}
                />
              </div>
              <div className="space-y-2">
                <Label className="dark:text-slate-300">{t('docketing.employee_participant')}</Label>
                <SearchableSelect
                  value={formData.employee_id || ''}
                  onValueChange={(v) => setFormData({ ...formData, employee_id: v })}
                  options={userOptions}
                  placeholder={t('docketing.select_employee')}
                  searchPlaceholder={t('common.search_placeholder')}
                />
              </div>
            </div>
          )}

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
