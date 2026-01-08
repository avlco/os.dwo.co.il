import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useTranslation } from 'react-i18next';
import RuleOptimizationBanner from '../mailrules/RuleOptimizationBanner';
import RuleOnboardingWizard from '../mailrules/RuleOnboardingWizard';
import {
  Settings,
  Plus,
  Edit,
  Trash2,
  Power,
  PowerOff,
  ChevronDown,
  ChevronUp,
  Mail,
  Clock,
  Calendar,
  FileText,
  ArrowRight,
  ArrowLeft,
  X
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

const actionTypes = [
  { value: 'log_time', label: 'רישום שעות', labelEn: 'Log Time', icon: Clock },
  { value: 'create_deadline', label: 'יצירת מועד', labelEn: 'Create Deadline', icon: Calendar },
  { value: 'create_task', label: 'יצירת משימה', labelEn: 'Create Task', icon: FileText },
  { value: 'send_email', label: 'שליחת מייל', labelEn: 'Send Email', icon: Mail },
  { value: 'create_calendar_event', label: 'יצירת אירוע יומן', labelEn: 'Calendar Event', icon: Calendar },
  { value: 'upload_to_dropbox', label: 'העלאה ל-Dropbox', labelEn: 'Upload to Dropbox', icon: FileText },
  { value: 'create_invoice_draft', label: 'יצירת טיוטת חשבונית', labelEn: 'Create Invoice Draft', icon: FileText },
];

const reminderUnits = [
  { value: 'days', label: 'ימים', labelEn: 'Days' },
  { value: 'weeks', label: 'שבועות', labelEn: 'Weeks' },
  { value: 'months', label: 'חודשים', labelEn: 'Months' },
];

const reminderReferences = [
  { value: 'before_extracted', label: 'לפני מועד שחולץ', labelEn: 'Before Extracted Date' },
  { value: 'after_extracted', label: 'אחרי מועד שחולץ', labelEn: 'After Extracted Date' },
  { value: 'from_today', label: 'מהיום', labelEn: 'From Today' },
];

export default function MailRulesPanel({ onClose }) {
  const { i18n } = useTranslation();
  const isRTL = i18n.language === 'he';
  const queryClient = useQueryClient();
  
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [expandedRules, setExpandedRules] = useState({});
  const [showWizard, setShowWizard] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    is_active: true,
    catch_config: {
      sender_pattern: '',
      subject_contains: '',
      body_keywords: [],
    },
    despatch_config: [],
    approval_required: true,
  });

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ['mailRules'],
    queryFn: () => base44.entities.MailRule.list('-created_date'),
  });

  const createRuleMutation = useMutation({
    mutationFn: (data) => base44.entities.MailRule.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['mailRules']);
      setDialogOpen(false);
      resetForm();
    },
  });

  const updateRuleMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.MailRule.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['mailRules']);
      setDialogOpen(false);
      resetForm();
    },
  });

  const deleteRuleMutation = useMutation({
    mutationFn: (id) => base44.entities.MailRule.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['mailRules']);
    },
  });

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      is_active: true,
      catch_config: {
        sender_pattern: '',
        subject_contains: '',
        body_keywords: [],
      },
      despatch_config: [],
      approval_required: true,
    });
    setEditingRule(null);
  };

  const handleEdit = (rule) => {
    setEditingRule(rule);
    setFormData({
      name: rule.name || '',
      description: rule.description || '',
      is_active: rule.is_active ?? true,
      catch_config: {
        sender_pattern: rule.catch_config?.sender_pattern || '',
        subject_contains: rule.catch_config?.subject_contains || rule.catch_config?.subject_regex || '',
        body_keywords: rule.catch_config?.body_keywords || [],
      },
      despatch_config: rule.despatch_config || [],
      approval_required: rule.approval_required ?? true,
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (editingRule) {
      updateRuleMutation.mutate({ id: editingRule.id, data: formData });
    } else {
      createRuleMutation.mutate(formData);
    }
  };

  const handleToggleActive = (rule) => {
    updateRuleMutation.mutate({
      id: rule.id,
      data: { is_active: !rule.is_active },
    });
  };

  const addAction = () => {
    setFormData({
      ...formData,
      despatch_config: [
        ...formData.despatch_config,
        { action_type: 'log_time', action_label: '', hours: 0.5 },
      ],
    });
  };

  const updateAction = (index, field, value) => {
    const newActions = [...formData.despatch_config];
    newActions[index] = { ...newActions[index], [field]: value };
    setFormData({ ...formData, despatch_config: newActions });
  };

  const removeAction = (index) => {
    const newActions = formData.despatch_config.filter((_, i) => i !== index);
    setFormData({ ...formData, despatch_config: newActions });
  };

  const toggleExpand = (ruleId) => {
    setExpandedRules(prev => ({ ...prev, [ruleId]: !prev[ruleId] }));
  };

  const BackIcon = isRTL ? ArrowRight : ArrowLeft;

  return (
    <div className="space-y-6">
      {/* Header with Back Button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onClose} className="rounded-xl dark:hover:bg-slate-700">
            <BackIcon className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-200">
              {isRTL ? 'חוקי עיבוד דואר' : 'Mail Processing Rules'}
            </h1>
            <p className="text-slate-500 dark:text-slate-400">
              {isRTL ? 'הגדרת חוקים לזיהוי ועיבוד אוטומטי של מיילים' : 'Define rules for automatic email detection and processing'}
            </p>
          </div>
        </div>
        <Button onClick={() => { resetForm(); setDialogOpen(true); }} className="gap-2 bg-slate-800 hover:bg-slate-700 dark:bg-slate-700">
          <Plus className="w-4 h-4" />
          {isRTL ? 'חוק חדש' : 'New Rule'}
        </Button>
      </div>

      <RuleOptimizationBanner 
        onEditRule={(ruleId) => {
          const rule = rules.find(r => r.id === ruleId);
          if (rule) handleEdit(rule);
        }}
      />

      {isLoading ? (
        <div className="text-center py-12 text-slate-500">{isRTL ? 'טוען...' : 'Loading...'}</div>
      ) : rules.length === 0 ? (
        showWizard ? (
          <RuleOnboardingWizard 
            onClose={() => setShowWizard(false)}
            onRuleCreated={() => setShowWizard(false)}
          />
        ) : (
          <Card className="dark:bg-slate-800 dark:border-slate-700">
            <CardContent className="py-12 text-center">
              <Settings className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-4" />
              <p className="text-slate-500 dark:text-slate-400">
                {isRTL ? 'לא הוגדרו חוקים עדיין' : 'No rules defined yet'}
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center mt-4">
                <Button onClick={() => setShowWizard(true)} className="gap-2 bg-blue-600 hover:bg-blue-700">
                  {isRTL ? 'התחל עם האשף' : 'Start with Wizard'}
                </Button>
                <Button variant="outline" onClick={() => { resetForm(); setDialogOpen(true); }} className="gap-2 dark:border-slate-600">
                  <Plus className="w-4 h-4" />
                  {isRTL ? 'צור ידנית' : 'Create Manually'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )
      ) : (
        <div className="space-y-4">
          {rules.map((rule) => (
            <Collapsible key={rule.id} open={expandedRules[rule.id]}>
              <Card className={`dark:bg-slate-800 dark:border-slate-700 ${!rule.is_active ? 'opacity-60' : ''}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${rule.is_active ? 'bg-green-100 dark:bg-green-900/30' : 'bg-slate-100 dark:bg-slate-700'}`}>
                        <Mail className={`w-5 h-5 ${rule.is_active ? 'text-green-600 dark:text-green-400' : 'text-slate-400'}`} />
                      </div>
                      <div>
                        <CardTitle className="text-base dark:text-slate-200">{rule.name}</CardTitle>
                        {rule.description && (
                          <p className="text-sm text-slate-500 dark:text-slate-400">{rule.description}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleToggleActive(rule)}
                        className="dark:hover:bg-slate-700"
                      >
                        {rule.is_active ? (
                          <Power className="w-4 h-4 text-green-600" />
                        ) : (
                          <PowerOff className="w-4 h-4 text-slate-400" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEdit(rule)}
                        className="dark:hover:bg-slate-700"
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteRuleMutation.mutate(rule.id)}
                        className="text-red-600 hover:text-red-700 dark:hover:bg-slate-700"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="icon" onClick={() => toggleExpand(rule.id)} className="dark:hover:bg-slate-700">
                          {expandedRules[rule.id] ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </Button>
                      </CollapsibleTrigger>
                    </div>
                  </div>
                </CardHeader>
                <CollapsibleContent>
                  <CardContent className="pt-0 border-t dark:border-slate-700">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                      <div>
                        <h4 className="font-medium text-slate-800 dark:text-slate-200 mb-2">
                          {isRTL ? 'תנאי זיהוי' : 'Detection Conditions'}
                        </h4>
                        <div className="space-y-2 text-sm">
                          {rule.catch_config?.sender_pattern && (
                            <p className="text-slate-600 dark:text-slate-400">
                              <span className="font-medium">{isRTL ? 'שולח:' : 'Sender:'}</span> {rule.catch_config.sender_pattern}
                            </p>
                          )}
                          {(rule.catch_config?.subject_contains || rule.catch_config?.subject_regex) && (
                            <p className="text-slate-600 dark:text-slate-400">
                              <span className="font-medium">{isRTL ? 'נושא מכיל:' : 'Subject Contains:'}</span> {rule.catch_config.subject_contains || rule.catch_config.subject_regex}
                            </p>
                          )}
                          {rule.catch_config?.body_keywords?.length > 0 && (
                            <p className="text-slate-600 dark:text-slate-400">
                              <span className="font-medium">{isRTL ? 'מילות מפתח:' : 'Keywords:'}</span> {rule.catch_config.body_keywords.join(', ')}
                            </p>
                          )}
                        </div>
                      </div>
                      <div>
                        <h4 className="font-medium text-slate-800 dark:text-slate-200 mb-2">
                          {isRTL ? 'פעולות' : 'Actions'}
                        </h4>
                        <div className="space-y-2">
                          {rule.despatch_config?.map((action, idx) => (
                            <div key={idx} className="flex items-center gap-2">
                              <Badge variant="secondary" className="dark:bg-slate-700">
                                {action.action_type}
                              </Badge>
                              <span className="text-sm text-slate-600 dark:text-slate-400">
                                {action.action_label || action.action_type}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          ))}
        </div>
      )}

      {/* Rule Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto dark:bg-slate-800 dark:border-slate-700">
          <DialogHeader>
            <DialogTitle className="dark:text-slate-200">
              {editingRule ? (isRTL ? 'עריכת חוק' : 'Edit Rule') : (isRTL ? 'חוק חדש' : 'New Rule')}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Basic Info */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="dark:text-slate-300">{isRTL ? 'שם החוק' : 'Rule Name'}</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="dark:bg-slate-900 dark:border-slate-600"
                />
              </div>
              <div className="space-y-2">
                <Label className="dark:text-slate-300">{isRTL ? 'תיאור' : 'Description'}</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={2}
                  className="dark:bg-slate-900 dark:border-slate-600"
                />
              </div>
            </div>

            {/* Catch Config - Simplified */}
            <div className="space-y-4">
              <h4 className="font-medium text-slate-800 dark:text-slate-200">
                {isRTL ? 'תנאי זיהוי' : 'Detection Conditions'}
              </h4>
              <div className="space-y-2">
                <Label className="dark:text-slate-300">{isRTL ? 'כתובת מייל שולח' : 'Sender Email Address'}</Label>
                <Input
                  value={formData.catch_config.sender_pattern}
                  onChange={(e) => setFormData({
                    ...formData,
                    catch_config: { ...formData.catch_config, sender_pattern: e.target.value },
                  })}
                  placeholder="TradeMarksDIS@justice.gov.il"
                  className="dark:bg-slate-900 dark:border-slate-600"
                />
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {isRTL ? 'הכנס כתובת מייל מלאה או חלקית' : 'Enter full or partial email address'}
                </p>
              </div>
              <div className="space-y-2">
                <Label className="dark:text-slate-300">{isRTL ? 'נושא מכיל' : 'Subject Contains'}</Label>
                <Input
                  value={formData.catch_config.subject_contains}
                  onChange={(e) => setFormData({
                    ...formData,
                    catch_config: { ...formData.catch_config, subject_contains: e.target.value },
                  })}
                  placeholder={isRTL ? 'דו"ח בחינה' : 'Office Action'}
                  className="dark:bg-slate-900 dark:border-slate-600"
                />
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {isRTL ? 'טקסט שחייב להופיע בנושא המייל' : 'Text that must appear in the email subject'}
                </p>
              </div>
              <div className="space-y-2">
                <Label className="dark:text-slate-300">{isRTL ? 'מילות מפתח בגוף (מופרדות בפסיק)' : 'Body Keywords (comma separated)'}</Label>
                <Input
                  value={(formData.catch_config.body_keywords || []).join(', ')}
                  onChange={(e) => setFormData({
                    ...formData,
                    catch_config: {
                      ...formData.catch_config,
                      body_keywords: e.target.value.split(',').map(k => k.trim()).filter(k => k),
                    },
                  })}
                  placeholder="office action, examination report"
                  className="dark:bg-slate-900 dark:border-slate-600"
                />
              </div>
            </div>

            {/* Despatch Config */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-medium text-slate-800 dark:text-slate-200">
                  {isRTL ? 'פעולות מוצעות' : 'Suggested Actions'}
                </h4>
                <Button variant="outline" size="sm" onClick={addAction} className="dark:border-slate-600">
                  <Plus className="w-4 h-4 mr-1" />
                  {isRTL ? 'הוסף פעולה' : 'Add Action'}
                </Button>
              </div>
              
              {formData.despatch_config.map((action, index) => (
                <Card key={index} className="dark:bg-slate-900 dark:border-slate-700">
                  <CardContent className="p-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="dark:text-slate-300">{isRTL ? 'סוג פעולה' : 'Action Type'}</Label>
                        <Select
                          value={action.action_type}
                          onValueChange={(v) => updateAction(index, 'action_type', v)}
                        >
                          <SelectTrigger className="dark:bg-slate-800 dark:border-slate-600">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
                            {actionTypes.map((type) => (
                              <SelectItem key={type.value} value={type.value} className="dark:text-slate-200">
                                {isRTL ? type.label : type.labelEn}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="dark:text-slate-300">{isRTL ? 'תווית' : 'Label'}</Label>
                        <Input
                          value={action.action_label || ''}
                          onChange={(e) => updateAction(index, 'action_label', e.target.value)}
                          className="dark:bg-slate-800 dark:border-slate-600"
                        />
                      </div>
                    </div>
                    
                    {action.action_type === 'log_time' && (
                      <div className="mt-4 space-y-2">
                        <Label className="dark:text-slate-300">{isRTL ? 'שעות' : 'Hours'}</Label>
                        <Input
                          type="number"
                          step="0.25"
                          value={action.hours || 0}
                          onChange={(e) => updateAction(index, 'hours', parseFloat(e.target.value) || 0)}
                          className="dark:bg-slate-800 dark:border-slate-600 w-32"
                        />
                      </div>
                    )}
                    
                    {action.action_type === 'create_deadline' && (
                      <div className="mt-4 space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="space-y-2">
                            <Label className="dark:text-slate-300">{isRTL ? 'כמות' : 'Amount'}</Label>
                            <Input
                              type="number"
                              value={action.reminder_value || action.days_offset || 30}
                              onChange={(e) => updateAction(index, 'reminder_value', parseInt(e.target.value) || 30)}
                              className="dark:bg-slate-800 dark:border-slate-600"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="dark:text-slate-300">{isRTL ? 'יחידה' : 'Unit'}</Label>
                            <Select
                              value={action.reminder_unit || 'days'}
                              onValueChange={(v) => updateAction(index, 'reminder_unit', v)}
                            >
                              <SelectTrigger className="dark:bg-slate-800 dark:border-slate-600">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
                                {reminderUnits.map((unit) => (
                                  <SelectItem key={unit.value} value={unit.value} className="dark:text-slate-200">
                                    {isRTL ? unit.label : unit.labelEn}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label className="dark:text-slate-300">{isRTL ? 'ביחס ל' : 'Relative To'}</Label>
                            <Select
                              value={action.reminder_reference || 'from_today'}
                              onValueChange={(v) => updateAction(index, 'reminder_reference', v)}
                            >
                              <SelectTrigger className="dark:bg-slate-800 dark:border-slate-600">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
                                {reminderReferences.map((ref) => (
                                  <SelectItem key={ref.value} value={ref.value} className="dark:text-slate-200">
                                    {isRTL ? ref.label : ref.labelEn}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {action.action_type === 'upload_to_dropbox' && (
                      <div className="mt-4 space-y-2">
                        <Label className="dark:text-slate-300">{isRTL ? 'נתיב יעד ב-Dropbox' : 'Dropbox Destination Path'}</Label>
                        <Input
                          value={action.dropbox_folder_path || ''}
                          onChange={(e) => updateAction(index, 'dropbox_folder_path', e.target.value)}
                          placeholder="/Clients/{{client_name}}/{{case_number}}"
                          className="dark:bg-slate-800 dark:border-slate-600"
                        />
                      </div>
                    )}

                    {action.action_type === 'create_calendar_event' && (
                      <div className="mt-4 space-y-3">
                        <div className="space-y-2">
                          <Label className="dark:text-slate-300">{isRTL ? 'תבנית כותרת' : 'Title Template'}</Label>
                          <Input
                            value={action.calendar_event_template?.title_template || ''}
                            onChange={(e) => updateAction(index, 'calendar_event_template', { ...action.calendar_event_template, title_template: e.target.value })}
                            placeholder="{{case_number}} - Deadline"
                            className="dark:bg-slate-800 dark:border-slate-600"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="dark:text-slate-300">{isRTL ? 'תבנית תיאור' : 'Description Template'}</Label>
                          <Textarea
                            value={action.calendar_event_template?.description_template || ''}
                            onChange={(e) => updateAction(index, 'calendar_event_template', { ...action.calendar_event_template, description_template: e.target.value })}
                            rows={2}
                            placeholder="Mail: {{mail_subject}}"
                            className="dark:bg-slate-800 dark:border-slate-600"
                          />
                        </div>
                      </div>
                    )}

                    {action.action_type === 'send_email' && (
                      <div className="mt-4 space-y-2">
                        <Label className="dark:text-slate-300">{isRTL ? 'תבנית תשובה אוטומטית' : 'Auto Reply Template'}</Label>
                        <Textarea
                          value={action.auto_reply_template || ''}
                          onChange={(e) => updateAction(index, 'auto_reply_template', e.target.value)}
                          rows={3}
                          placeholder={isRTL ? 'שלום {{client_name}}, קיבלנו את פנייתך...' : 'Hello {{client_name}}, we received your inquiry...'}
                          className="dark:bg-slate-800 dark:border-slate-600"
                        />
                      </div>
                    )}

                    {action.action_type === 'create_invoice_draft' && (
                      <div className="mt-4 space-y-2">
                        <Label className="dark:text-slate-300">{isRTL ? 'תיאור חשבונית' : 'Invoice Description'}</Label>
                        <Input
                          value={action.invoice_description || ''}
                          onChange={(e) => updateAction(index, 'invoice_description', e.target.value)}
                          placeholder={isRTL ? 'חשבונית עבור {{case_number}}' : 'Invoice for {{case_number}}'}
                          className="dark:bg-slate-800 dark:border-slate-600"
                        />
                      </div>
                    )}

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeAction(index)}
                      className="mt-4 text-red-600 hover:text-red-700 dark:hover:bg-slate-700"
                    >
                      <Trash2 className="w-4 h-4 mr-1" />
                      {isRTL ? 'הסר' : 'Remove'}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Options */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-slate-800 dark:text-slate-200">
                    {isRTL ? 'דורש אישור' : 'Requires Approval'}
                  </p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {isRTL ? 'הפעולות יחכו לאישור המשתמש' : 'Actions will wait for user approval'}
                  </p>
                </div>
                <Switch
                  checked={formData.approval_required}
                  onCheckedChange={(checked) => setFormData({ ...formData, approval_required: checked })}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-slate-800 dark:text-slate-200">
                    {isRTL ? 'חוק פעיל' : 'Rule Active'}
                  </p>
                </div>
                <Switch
                  checked={formData.is_active}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="dark:border-slate-600">
              {isRTL ? 'ביטול' : 'Cancel'}
            </Button>
            <Button onClick={handleSubmit} className="bg-slate-800 hover:bg-slate-700 dark:bg-slate-700">
              {editingRule ? (isRTL ? 'שמור שינויים' : 'Save Changes') : (isRTL ? 'צור חוק' : 'Create Rule')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}