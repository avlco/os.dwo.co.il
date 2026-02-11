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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import AssigneeSelect from './AssigneeSelect';

export default function TaskDialog({
  open,
  onOpenChange,
  formData,
  setFormData,
  onSubmit,
  isEditing,
  isSubmitting,
}) {
  const { t } = useTranslation();

  const { data: cases = [] } = useQuery({
    queryKey: ['cases'],
    queryFn: () => base44.entities.Case.list('-created_date', 500),
  });

  const taskTypes = [
    { value: 'review_oa', label: t('tasks_page.type_review_oa') },
    { value: 'respond_to_client', label: t('tasks_page.type_respond_client') },
    { value: 'draft_report', label: t('tasks_page.type_draft_report') },
    { value: 'file_application', label: t('tasks_page.type_file_application') },
    { value: 'pay_renewal_fee', label: t('tasks_page.type_pay_renewal') },
    { value: 'prepare_response', label: t('tasks_page.type_prepare_response') },
    { value: 'custom', label: t('tasks_page.type_custom') },
  ];

  const priorities = [
    { value: 'low', label: t('tasks_page.priority_low') },
    { value: 'medium', label: t('tasks_page.priority_medium') },
    { value: 'high', label: t('tasks_page.priority_high') },
    { value: 'critical', label: t('tasks_page.priority_critical') },
  ];

  const statuses = [
    { value: 'pending', label: t('tasks_page.status_pending') },
    { value: 'awaiting_approval', label: t('tasks_page.status_awaiting') },
    { value: 'in_progress', label: t('tasks_page.status_in_progress') },
    { value: 'completed', label: t('tasks_page.status_completed') },
    { value: 'cancelled', label: t('tasks_page.status_cancelled') },
  ];

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg dark:bg-slate-800 dark:border-slate-700">
        <DialogHeader>
          <DialogTitle className="dark:text-slate-200">
            {isEditing ? t('tasks_page.dialog_edit') : t('tasks_page.dialog_new')}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label className="dark:text-slate-300">{t('tasks_page.title_field')}</Label>
            <Input
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              required
              className="dark:bg-slate-900 dark:border-slate-600"
            />
          </div>

          <div className="space-y-2">
            <Label className="dark:text-slate-300">{t('tasks_page.description_field')}</Label>
            <Textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
              className="dark:bg-slate-900 dark:border-slate-600"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="dark:text-slate-300">{t('tasks_page.type_field')}</Label>
              <Select value={formData.task_type} onValueChange={(v) => setFormData({ ...formData, task_type: v })}>
                <SelectTrigger className="dark:bg-slate-900 dark:border-slate-600">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
                  {taskTypes.map(type => (
                    <SelectItem key={type.value} value={type.value} className="dark:text-slate-200">{type.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="dark:text-slate-300">{t('tasks_page.priority_field')}</Label>
              <Select value={formData.priority} onValueChange={(v) => setFormData({ ...formData, priority: v })}>
                <SelectTrigger className="dark:bg-slate-900 dark:border-slate-600">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
                  {priorities.map(p => (
                    <SelectItem key={p.value} value={p.value} className="dark:text-slate-200">{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {isEditing && (
            <div className="space-y-2">
              <Label className="dark:text-slate-300">{t('common.status')}</Label>
              <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                <SelectTrigger className="dark:bg-slate-900 dark:border-slate-600">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
                  {statuses.map(s => (
                    <SelectItem key={s.value} value={s.value} className="dark:text-slate-200">{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label className="dark:text-slate-300">{t('tasks_page.assignee_field')}</Label>
            <AssigneeSelect
              value={formData.assigned_to || []}
              onChange={(v) => setFormData({ ...formData, assigned_to: v })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="dark:text-slate-300">{t('tasks_page.case_field')}</Label>
              <Select value={formData.case_id || ''} onValueChange={(v) => setFormData({ ...formData, case_id: v })}>
                <SelectTrigger className="dark:bg-slate-900 dark:border-slate-600">
                  <SelectValue placeholder={t('tasks_page.select_case')} />
                </SelectTrigger>
                <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
                  {cases.map(c => (
                    <SelectItem key={c.id} value={c.id} className="dark:text-slate-200">{c.case_number}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="dark:text-slate-300">{t('tasks_page.due_date_field')}</Label>
              <Input
                type="date"
                value={formData.due_date}
                onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                className="dark:bg-slate-900 dark:border-slate-600"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="dark:border-slate-600">
              {t('tasks_page.cancel')}
            </Button>
            <Button
              type="submit"
              className="bg-slate-800 hover:bg-slate-700 dark:bg-slate-700"
              disabled={isSubmitting}
            >
              {isEditing ? t('tasks_page.update') : t('tasks_page.create')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
