import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useTranslation } from 'react-i18next';
import PageHeader from '../components/ui/PageHeader';
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
  FileText
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
  { value: 'create_calendar_event', label: 'יצירת אירוע יומן', labelEn: 'Create Calendar Event', icon: Calendar },
  { value: 'upload_to_dropbox', label: 'העלאה ל-Dropbox', labelEn: 'Upload to Dropbox', icon: FileText },
];

export default function MailRules() {
  const { i18n } = useTranslation();
  const isRTL = i18n.language === 'he';
  const queryClient = useQueryClient();
  
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [expandedRules, setExpandedRules] = useState({});
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    is_active: true,
    priority: 10,
    catch_config: {
      sender_pattern: '',
      subject_regex: '',
      body_keywords: [],
    },
    despatch_config: [],
    approval_required: true,
    auto_link_case: true,
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
      priority: 10,
      catch_config: {
        sender_pattern: '',
        subject_regex: '',
        body_keywords: [],
      },
      despatch_config: [],
      approval_required: true,
      auto_link_case: true,
    });
    setEditingRule(null);
  };

  const handleEdit = (rule) => {
    setEditingRule(rule);
    setFormData({
      name: rule.name || '',
      description: rule.description || '',
      is_active: rule.is_active ?? true,
      priority: rule.priority || 10,
      catch_config: rule.catch_config || {
        sender_pattern: '',
        subject_regex: '',
        body_keywords: [],
      },
      despatch_config: rule.despatch_config || [],
      approval_required: rule.approval_required ?? true,
      auto_link_case: rule.auto_link_case ?? true,
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

  return (
    <div className="space-y-6">
      <PageHeader
        title={isRTL ? 'חוקי עיבוד דואר' : 'Mail Processing Rules'}
        subtitle={isRTL ? 'הגדרת חוקים לזיהוי ועיבוד אוטומטי של מיילים' : 'Define rules for automatic email detection and processing'}
        action={() => { resetForm(); setDialogOpen(true); }}
        actionLabel={isRTL ? 'חוק חדש' : 'New Rule'}
        actionIcon={Plus}
      />

      {isLoading ? (
        <div className="text-center py-12 text-slate-500">{isRTL ? 'טוען...' : 'Loading...'}</div>
      ) : rules.length === 0 ? (
        <Card className="dark:bg-slate-800 dark:border-slate-700">
          <CardContent className="py-12 text-center">
            <Settings className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-4" />
            <p className="text-slate-500 dark:text-slate-400">
              {isRTL ? 'לא הוגדרו חוקים עדיין' : 'No rules defined yet'}
            </p>
            <Button className="mt-4" onClick={() => { resetForm(); setDialogOpen(true); }}>
              <Plus className="w-4 h-4 mr-2" />
              {isRTL ? 'צור חוק ראשון' : 'Create first rule'}
            </Button>
          </CardContent>
        </Card>
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
                      <Badge variant="outline" className="dark:border-slate-600">
                        {isRTL ? 'עדיפות' : 'Priority'}: {rule.priority || 10}
                      </Badge>
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
                          {isRTL ? 'תנאי זיהוי (Catch)' : 'Detection Conditions (Catch)'}
                        </h4>
                        <div className="space-y-2 text-sm">
                          {rule.catch_config?.sender_pattern && (
                            <p className="text-slate-600 dark:text-slate-400">
                              <span className="font-medium">{isRTL ? 'שולח:' : 'Sender:'}</span> {rule.catch_config.sender_pattern}
                            </p>
                          )}
                          {rule.catch_config?.subject_regex && (
                            <p className="text-slate-600 dark:text-slate-400">
                              <span className="font-medium">{isRTL ? 'נושא:' : 'Subject:'}</span> {rule.catch_config.subject_regex}
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
                          {isRTL ? 'פעולות (Despatch)' : 'Actions (Despatch)'}
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="dark:text-slate-300">{isRTL ? 'שם החוק' : 'Rule Name'}</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="dark:bg-slate-900 dark:border-slate-600"
                />
              </div>
              <div className="space-y-2">
                <Label className="dark:text-slate-300">{isRTL ? 'עדיפות' : 'Priority'}</Label>
                <Input
                  type="number"
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 10 })}
                  className="dark:bg-slate-900 dark:border-slate-600"
                />
              </div>
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

            {/* Catch Config */}
            <div className="space-y-4">
              <h4 className="font-medium text-slate-800 dark:text-slate-200">
                {isRTL ? 'תנאי זיהוי (Catch)' : 'Detection Conditions (Catch)'}
              </h4>
              <div className="space-y-2">
                <Label className="dark:text-slate-300">{isRTL ? 'תבנית שולח (Regex)' : 'Sender Pattern (Regex)'}</Label>
                <Input
                  value={formData.catch_config.sender_pattern}
                  onChange={(e) => setFormData({
                    ...formData,
                    catch_config: { ...formData.catch_config, sender_pattern: e.target.value },
                  })}
                  placeholder=".*@patent-office\.gov\.il"
                  className="dark:bg-slate-900 dark:border-slate-600"
                />
              </div>
              <div className="space-y-2">
                <Label className="dark:text-slate-300">{isRTL ? 'תבנית נושא לחילוץ מס\' תיק (Regex)' : 'Subject Regex for Case Number'}</Label>
                <Input
                  value={formData.catch_config.subject_regex}
                  onChange={(e) => setFormData({
                    ...formData,
                    catch_config: { ...formData.catch_config, subject_regex: e.target.value },
                  })}
                  placeholder="Case[:\s]*(\d+)"
                  className="dark:bg-slate-900 dark:border-slate-600"
                />
              </div>
              <div className="space-y-2">
                <Label className="dark:text-slate-300">{isRTL ? 'מילות מפתח (מופרדות בפסיק)' : 'Body Keywords (comma separated)'}</Label>
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
                  {isRTL ? 'פעולות מוצעות (Despatch)' : 'Suggested Actions (Despatch)'}
                </h4>
                <Button variant="outline" size="sm" onClick={addAction} className="dark:border-slate-600">
                  <Plus className="w-4 h-4 mr-1" />
                  {isRTL ? 'הוסף פעולה' : 'Add Action'}
                </Button>
              </div>
              
              {formData.despatch_config.map((action, index) => (
                <Card key={index} className="dark:bg-slate-900 dark:border-slate-700">
                  <CardContent className="p-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                      {action.action_type === 'log_time' && (
                        <div className="space-y-2">
                          <Label className="dark:text-slate-300">{isRTL ? 'שעות' : 'Hours'}</Label>
                          <Input
                            type="number"
                            step="0.25"
                            value={action.hours || 0}
                            onChange={(e) => updateAction(index, 'hours', parseFloat(e.target.value) || 0)}
                            className="dark:bg-slate-800 dark:border-slate-600"
                          />
                        </div>
                      )}
                      {action.action_type === 'create_deadline' && (
                        <div className="space-y-2">
                          <Label className="dark:text-slate-300">{isRTL ? 'ימים' : 'Days'}</Label>
                          <Input
                            type="number"
                            value={action.days_offset || 30}
                            onChange={(e) => updateAction(index, 'days_offset', parseInt(e.target.value) || 30)}
                            className="dark:bg-slate-800 dark:border-slate-600"
                          />
                        </div>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeAction(index)}
                      className="mt-2 text-red-600 hover:text-red-700"
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
                    {isRTL ? 'קישור אוטומטי לתיק' : 'Auto Link to Case'}
                  </p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {isRTL ? 'נסה לזהות ולקשר תיק אוטומטית' : 'Try to detect and link case automatically'}
                  </p>
                </div>
                <Switch
                  checked={formData.auto_link_case}
                  onCheckedChange={(checked) => setFormData({ ...formData, auto_link_case: checked })}
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