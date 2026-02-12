import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Paperclip, X, Upload, Loader2 } from 'lucide-react';
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
import SearchableSelect from '@/components/ui/searchable-select';
import SearchableMultiSelect from '@/components/ui/searchable-multi-select';

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
  const [uploading, setUploading] = useState(false);

  const { data: cases = [] } = useQuery({
    queryKey: ['cases'],
    queryFn: () => base44.entities.Case.list('-created_date', 500),
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => base44.entities.User.list(),
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

  const caseOptions = cases.map(c => ({
    value: c.id,
    label: `${c.case_number} - ${c.title}`,
  }));

  const userOptions = users.map(u => ({
    value: u.id,
    label: u.full_name || u.email,
  }));

  const handleFileAttach = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      // Read file as base64
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result;
          // Remove data URL prefix (data:...;base64,)
          const base64Data = result.split(',')[1];
          resolve(base64Data);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      // Upload to Dropbox
      const result = await base44.functions.invoke('uploadDocumentToDropbox', {
        file_content_base64: base64,
        file_name: file.name,
        custom_path: '/Tasks/Attachments',
        document_type: 'other',
        description: `Task attachment: ${file.name}`,
      });

      const resultData = result?.data || result;
      const newAttachment = {
        name: file.name,
        url: resultData?.shared_link || resultData?.file_url || '',
        dropbox_path: resultData?.dropbox_path || '',
        uploaded_at: new Date().toISOString(),
      };

      setFormData(prev => ({
        ...prev,
        attachments: [...(prev.attachments || []), newAttachment],
      }));
    } catch (err) {
      console.error('File upload failed:', err);
      // Still add as metadata-only attachment
      const newAttachment = {
        name: file.name,
        url: '',
        uploaded_at: new Date().toISOString(),
      };
      setFormData(prev => ({
        ...prev,
        attachments: [...(prev.attachments || []), newAttachment],
      }));
    } finally {
      setUploading(false);
      // Reset file input
      e.target.value = '';
    }
  };

  const removeAttachment = (index) => {
    setFormData(prev => ({
      ...prev,
      attachments: (prev.attachments || []).filter((_, i) => i !== index),
    }));
  };

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

          {/* Assignee - Searchable Multi-Select */}
          <div className="space-y-2">
            <Label className="dark:text-slate-300">{t('tasks_page.assignee_field')}</Label>
            <SearchableMultiSelect
              value={formData.assigned_to || []}
              onValueChange={(v) => setFormData({ ...formData, assigned_to: v })}
              options={userOptions}
              placeholder={t('tasks_page.select_assignee')}
              searchPlaceholder={t('common.search_placeholder')}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Case - Searchable Select */}
            <div className="space-y-2">
              <Label className="dark:text-slate-300">{t('tasks_page.case_field')}</Label>
              <SearchableSelect
                value={formData.case_id || ''}
                onValueChange={(v) => setFormData({ ...formData, case_id: v })}
                options={caseOptions}
                placeholder={t('tasks_page.select_case')}
                searchPlaceholder={t('common.search_placeholder')}
              />
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

          {/* File Attachments */}
          <div className="space-y-2">
            <Label className="dark:text-slate-300">{t('tasks_page.attachments')}</Label>
            <div className="space-y-2">
              {(formData.attachments || []).map((att, i) => (
                <div key={i} className="flex items-center gap-2 text-sm bg-slate-50 dark:bg-slate-900 rounded-lg px-3 py-2">
                  <Paperclip className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  {att.url ? (
                    <a
                      href={att.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="truncate flex-1 text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      {att.name}
                    </a>
                  ) : (
                    <span className="truncate flex-1 dark:text-slate-300">{att.name}</span>
                  )}
                  <X
                    className="w-4 h-4 cursor-pointer text-slate-400 hover:text-rose-500 flex-shrink-0"
                    onClick={() => removeAttachment(i)}
                  />
                </div>
              ))}
              <label className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 cursor-pointer hover:underline">
                {uploading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {t('tasks_page.uploading')}
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    {t('tasks_page.add_attachment')}
                  </>
                )}
                <input
                  type="file"
                  className="hidden"
                  onChange={handleFileAttach}
                  disabled={uploading}
                />
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="dark:border-slate-600">
              {t('tasks_page.cancel')}
            </Button>
            <Button
              type="submit"
              className="bg-slate-800 hover:bg-slate-700 dark:bg-slate-700"
              disabled={isSubmitting || uploading}
            >
              {isEditing ? t('tasks_page.update') : t('tasks_page.create')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
