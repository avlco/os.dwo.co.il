import React from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Save, CheckCircle2, Archive, Briefcase, Users, AlertCircle } from 'lucide-react';
import ActionCard from './ActionCard';
import StatusBadge from '../ui/StatusBadge';

export default function TaskControlPanel({
  task,
  cases,
  clients,
  formData,
  setFormData,
  suggestedActions,
  onActionToggle,
  onActionUpdate,
  onSave,
  onApprove,
  onSkip,
  isApproving,
  processingActionIndex,
}) {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'he';

  const extractedData = task?.extracted_data || {};
  const inferredCase = extractedData.inferred_case;
  const inferredClient = extractedData.inferred_client;
  const ruleName = extractedData.rule_name;

  return (
    <div className="h-full flex flex-col gap-4 overflow-auto">
      {/* Task Header */}
      <Card className="flex-shrink-0 dark:bg-slate-800 dark:border-slate-700">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg dark:text-slate-200">
              {t('workbench.task_details')}
            </CardTitle>
            <div className="flex gap-2">
              <StatusBadge status={task?.status} />
              <StatusBadge status={task?.priority} />
            </div>
          </div>
          {ruleName && (
            <div className="flex items-center gap-2 mt-2">
              <Badge variant="outline" className="text-xs dark:border-slate-600 dark:text-slate-400">
                {t('workbench.rule_label')}: {ruleName}
              </Badge>
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Inferred Case/Client Info */}
          {(inferredCase || inferredClient) && (
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span className="text-sm font-medium text-blue-800 dark:text-blue-300">
                  {t('workbench.auto_detection')}
                </span>
              </div>
              {inferredCase && (
                <p className="text-sm text-blue-700 dark:text-blue-400">
                  {t('workbench.case_label')}: {inferredCase.case_number} - {inferredCase.title}
                </p>
              )}
              {inferredClient && (
                <p className="text-sm text-blue-700 dark:text-blue-400">
                  {t('workbench.client_label')}: {inferredClient.name}
                </p>
              )}
            </div>
          )}

          {/* Case Selection */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2 dark:text-slate-300">
              <Briefcase className="w-4 h-4" />
              {t('workbench.linked_case')}
            </Label>
            <Select 
              value={formData.case_id} 
              onValueChange={(v) => setFormData({ ...formData, case_id: v })}
            >
              <SelectTrigger className="dark:bg-slate-900 dark:border-slate-600">
                <SelectValue placeholder={t('workbench.select_case')} />
              </SelectTrigger>
              <SelectContent className="dark:bg-slate-800 dark:border-slate-700 max-h-60">
                {cases.map(c => (
                  <SelectItem key={c.id} value={c.id} className="dark:text-slate-200">
                    {c.case_number} - {c.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Client Selection */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2 dark:text-slate-300">
              <Users className="w-4 h-4" />
              {t('workbench.linked_client')}
            </Label>
            <Select 
              value={formData.client_id} 
              onValueChange={(v) => setFormData({ ...formData, client_id: v })}
            >
              <SelectTrigger className="dark:bg-slate-900 dark:border-slate-600">
                <SelectValue placeholder={t('workbench.select_client')} />
              </SelectTrigger>
              <SelectContent className="dark:bg-slate-800 dark:border-slate-700 max-h-60">
                {clients.map(c => (
                  <SelectItem key={c.id} value={c.id} className="dark:text-slate-200">
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Suggested Actions */}
      {suggestedActions && suggestedActions.length > 0 && (
        <Card className="flex-shrink-0 dark:bg-slate-800 dark:border-slate-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg dark:text-slate-200">
              {t('workbench.suggested_actions')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {suggestedActions.map((action, index) => (
              <ActionCard
                key={action.id || index}
                action={action}
                selected={action.selected}
                onToggle={() => onActionToggle(index)}
                onUpdate={(updated) => onActionUpdate(index, updated)}
                isProcessing={isApproving && processingActionIndex === index}
              />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Notes */}
      <Card className="flex-shrink-0 dark:bg-slate-800 dark:border-slate-700">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg dark:text-slate-200">
            {t('workbench.notes')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            rows={3}
            placeholder={t('workbench.notes_placeholder')}
            className="dark:bg-slate-900 dark:border-slate-600 dark:text-slate-200"
          />
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex flex-col gap-3 flex-shrink-0 pt-2 pb-4">
        <Button onClick={onSave} variant="outline" className="w-full gap-2 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700">
          <Save className="w-4 h-4" />
          {t('common.save_changes')}
        </Button>
        <Button 
          onClick={onApprove} 
          className="w-full bg-green-600 hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-600 gap-2"
          disabled={isApproving}
        >
          <CheckCircle2 className="w-4 h-4" />
          {t('workbench.approve_execute')}
        </Button>
        <Button 
          variant="ghost" 
          className="w-full gap-2 dark:text-slate-400 dark:hover:text-slate-200"
          onClick={onSkip}
        >
          <Archive className="w-4 h-4" />
          {t('workbench.skip')}
        </Button>
      </div>
    </div>
  );
}