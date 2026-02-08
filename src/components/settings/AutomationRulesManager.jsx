import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from "sonner";
import { Plus, Edit, Trash2, X, Braces, ShieldCheck, Copy, Upload } from 'lucide-react';
import ImportExportDialog from '../import-export/ImportExportDialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import RuleOptimizationBanner from '../mailrules/RuleOptimizationBanner';
import PathBuilder from '../automation/PathBuilder';
import FilenameTemplateInput from '../common/FilenameTemplateInput';
import { FILENAME_TOKENS as AVAILABLE_TOKENS } from '@/constants/filenameTokens';

const TARGET_FIELD_OPTIONS = [
  { value: 'case_no', label: '{Case_No}', description: 'מספר תיק' },
  { value: 'official_no', label: '{Official_No}', description: 'מספר בקשה רשמי' },
  { value: 'client_ref', label: '{Client_No}', description: 'מספר לקוח' },
];

const RECIPIENT_OPTIONS = [
  { value: 'client', label: 'לקוח' },
  { value: 'lawyer', label: 'עו"ד אחראי' },
];

const defaultMapRow = { source: 'subject', anchor_text: '', target_field: 'case_no' };

const defaultRule = {
  name: '',
  is_active: true,
  require_approval: true,
  approver_email: '',
  catch_config: { senders: [], subject_contains: '', body_contains: '' },
  map_config: [{ ...defaultMapRow }],
  action_bundle: {
    send_email: { 
        enabled: false, 
        recipients: [], 
        subject_template: '', 
        body_template: '',
        enable_english: false,
        subject_template_en: '',
        body_template_en: ''
    },
    save_file: {
      enabled: false,
      path_segments: [],
      root_path: '/DWO',
      filename_template: '{Original_Filename}'
    },
        calendar_event: { 
        enabled: false, 
        title_template: '', 
        description_template: '',
        timing_base: 'mail_date',
        timing_docket_type: '',
        timing_direction: 'after', 
        timing_offset: 7, 
        timing_unit: 'days', 
        attendees: [], 
        create_meet_link: false,
        enable_english: false,
        title_template_en: '',
        description_template_en: ''
    },
    create_alert: { 
        enabled: false, 
        alert_type: 'reminder', 
        message_template: '', 
        timing_base: 'mail_date',
        timing_docket_type: '',
        timing_direction: 'after', 
        timing_offset: 7, 
        timing_unit: 'days', 
        recipients: [],
        enable_english: false,
        message_template_en: ''
    },
    billing: { enabled: false, hours: 0.25, hourly_rate: 0, description_template: '' }
  }
};

function TokenButton({ onInsert }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-blue-600 dark:text-blue-400">
          <Braces className="w-4 h-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="dark:bg-slate-800">
        {AVAILABLE_TOKENS.map(token => (
          <DropdownMenuItem key={token.key} onClick={() => onInsert(token.key)} className="dark:text-slate-200">
            <code className="text-xs bg-slate-100 dark:bg-slate-700 px-1 rounded ml-2">{token.key}</code>
            {token.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TokenInput({ value, onChange, placeholder, className }) {
  const inputRef = React.useRef(null);
  const handleInsertToken = (token) => {
    const input = inputRef.current;
    const start = input?.selectionStart || value.length;
    const newValue = value.slice(0, start) + token + value.slice(start);
    onChange(newValue);
  };
  return (
    <div className="flex items-center gap-1">
      <Input ref={inputRef} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className={className} />
      <TokenButton onInsert={handleInsertToken} />
    </div>
  );
}

function TokenTextarea({ value, onChange, placeholder, className }) {
  const textareaRef = React.useRef(null);
  const handleInsertToken = (token) => {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart || value.length;
    const newValue = value.slice(0, start) + token + value.slice(start);
    onChange(newValue);
  };
  return (
    <div className="space-y-1">
      <div className="flex justify-end"><TokenButton onInsert={handleInsertToken} /></div>
      <Textarea ref={textareaRef} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className={`min-h-[160px] ${className}`} rows={6} />
    </div>
  );
}

function RecipientsSelect({ value = [], onChange }) {
  const { t } = useTranslation();
  const toggleRecipient = (recipient) => {
    if (value.includes(recipient)) {
      onChange(value.filter(r => r !== recipient));
    } else {
      onChange([...value, recipient]);
    }
  };
  
  const RECIPIENT_OPTIONS_I18N = [
    { value: 'client', label: t('automation_rules.client') },
    { value: 'lawyer', label: t('automation_rules.responsible_lawyer') },
  ];
  
  return (
    <div className="flex flex-wrap gap-2">
      {RECIPIENT_OPTIONS_I18N.map(opt => (
        <Badge key={opt.value} variant={value.includes(opt.value) ? "default" : "outline"} className="cursor-pointer" onClick={() => toggleRecipient(opt.value)}>
          {opt.label}
        </Badge>
      ))}
    </div>
  );
}

function TimingSelector({ base, docketType, direction, offset, unit, onBaseChange, onDocketTypeChange, onDirectionChange, onOffsetChange, onUnitChange }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Select
        value={base || 'mail_date'}
        onValueChange={(val) => {
          onBaseChange(val);
          if (val === 'mail_date') onDocketTypeChange('');
        }}
      >
        <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="mail_date">תאריך מייל</SelectItem>
          <SelectItem value="docket_date">מועד בתיק</SelectItem>
        </SelectContent>
      </Select>

      {base === 'docket_date' && (
        <Select value={docketType || ''} onValueChange={onDocketTypeChange}>
          <SelectTrigger className="w-36"><SelectValue placeholder="סוג מועד" /></SelectTrigger>
          <SelectContent className="z-[100]">
            <SelectItem value="expiry">פקיעה</SelectItem>
            <SelectItem value="renewal">חידוש</SelectItem>
            <SelectItem value="priority">בכורה</SelectItem>
            <SelectItem value="publication">פרסום</SelectItem>
          </SelectContent>
        </Select>
      )}

      <Select value={direction} onValueChange={onDirectionChange}>
        <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="before">לפני</SelectItem>
          <SelectItem value="after">אחרי</SelectItem>
        </SelectContent>
      </Select>

      <Input
        type="number"
        value={offset}
        onChange={(e) => onOffsetChange(parseInt(e.target.value) || 0)}
        className="w-20"
      />

      <Select value={unit} onValueChange={onUnitChange}>
        <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="days">ימים</SelectItem>
          <SelectItem value="weeks">שבועות</SelectItem>
          <SelectItem value="months">חודשים</SelectItem>
          <SelectItem value="years">שנים</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}


export default function AutomationRulesManager() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [isImportExportOpen, setIsImportExportOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  
  const [currentRule, setCurrentRule] = useState(defaultRule);
  const [activeTab, setActiveTab] = useState("catch");
  const [sendersInput, setSendersInput] = useState('');

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ['automationRules'],
    queryFn: () => base44.entities.AutomationRule.list('-created_date'),
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => base44.entities.User.list(),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.AutomationRule.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['automationRules']);
      toast.success(t('settings.rule_created_success'));
      setIsEditModalOpen(false);
      setIsWizardOpen(false);
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.AutomationRule.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['automationRules']);
      toast.success(t('settings.rule_updated_success'));
      setIsEditModalOpen(false);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.AutomationRule.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['automationRules']);
      toast.success(t('settings.rule_deleted_success'));
    }
  });

  const handleDuplicate = (rule) => {
    const { id, created_date, updated_date, created_by, ...ruleData } = rule;
    const duplicatedRule = {
      ...ruleData,
      name: `${ruleData.name} (העתק)`,
      is_active: false,
    };
    createMutation.mutate(duplicatedRule);
  };

  const openEdit = (rule) => {
    const mapConfig = rule.map_config?.length > 0 ? rule.map_config : [{ ...defaultMapRow }];
    const mergedRule = {
      ...defaultRule,
      ...rule,
      catch_config: { ...defaultRule.catch_config, ...rule.catch_config },
      map_config: mapConfig,
      action_bundle: {
        send_email: { ...defaultRule.action_bundle.send_email, ...rule.action_bundle?.send_email },
        save_file: { ...defaultRule.action_bundle.save_file, ...rule.action_bundle?.save_file },
        calendar_event: { ...defaultRule.action_bundle.calendar_event, ...rule.action_bundle?.calendar_event },
        create_alert: { ...defaultRule.action_bundle.create_alert, ...rule.action_bundle?.create_alert },
        billing: { ...defaultRule.action_bundle.billing, ...rule.action_bundle?.billing },
      }
    };
    setCurrentRule(mergedRule);
    setSendersInput((rule.catch_config?.senders || []).join(', '));
    setActiveTab("catch");
    setIsEditModalOpen(true);
  };

  const [isSaving, setIsSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});

  const handleSave = async () => {
    const data = {
      ...currentRule,
      catch_config: {
        ...currentRule.catch_config,
        senders: sendersInput.split(',').map(s => s.trim()).filter(Boolean)
      }
    };

    // Clear previous errors
    setFieldErrors({});

    // Validate for duplicate catch_config before saving
    setIsSaving(true);
    try {
      const validationResponse = await base44.functions.invoke('validateAutomationRule', {
        ruleId: currentRule.id || null,
        catchConfig: data.catch_config
      });

      const validationResult = validationResponse.data;
      
      if (!validationResult.valid) {
        // Determine which fields cause the conflict
        const errors = {};
        const conflictFields = validationResult.conflictFields || [];
        
        if (conflictFields.includes('senders') || data.catch_config.senders?.length > 0) {
          errors.senders = `כפילות עם חוק "${validationResult.conflictingRuleName}"`;
        }
        if (conflictFields.includes('subject_contains') || data.catch_config.subject_contains) {
          errors.subject_contains = `כפילות עם חוק "${validationResult.conflictingRuleName}"`;
        }
        if (conflictFields.includes('body_contains') || data.catch_config.body_contains) {
          errors.body_contains = `כפילות עם חוק "${validationResult.conflictingRuleName}"`;
        }
        
        // If no specific fields, show general error
        if (Object.keys(errors).length === 0) {
          errors.general = validationResult.error || t('automation_rules.duplicate_rule_error');
        }
        
        setFieldErrors(errors);
        toast.error(validationResult.error || t('automation_rules.duplicate_rule_error'));
        setIsSaving(false);
        return;
      }

      if (currentRule.id) {
        updateMutation.mutate({ id: currentRule.id, data });
      } else {
        createMutation.mutate(data);
      }
    } catch (error) {
      toast.error(t('common.error') + ': ' + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const toggleActive = (id, checked) => {
    updateMutation.mutate({ id, data: { is_active: checked } });
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const response = await base44.functions.invoke('exportData', { entityType: 'automations' });
      const { content, filename, mimeType } = response.data;
      
      const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast.success(`${rules.length} חוקי אוטומציה יוצאו בהצלחה`);
    } catch (error) {
      toast.error(`שגיאה בייצוא: ${error.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleImport = async (items) => {
    try {
      const response = await base44.functions.invoke('importData', { entityType: 'automations', items });
      const { created, updated, failed, errors } = response.data;
      
      queryClient.invalidateQueries(['automationRules']);
      
      let description = `נוצרו ${created}, עודכנו ${updated}`;
      if (failed > 0) description += `, נכשלו ${failed}`;
      
      toast.success(`הייבוא הושלם: ${description}`);
    } catch (error) {
      toast.error(`שגיאה בייבוא: ${error.message}`);
      throw error;
    }
  };

  const addMapRow = () => {
    setCurrentRule(prev => ({
      ...prev,
      map_config: [...prev.map_config, { ...defaultMapRow }]
    }));
  };

  const updateMapRow = (index, field, value) => {
    setCurrentRule(prev => {
        const newMap = [...prev.map_config];
        newMap[index] = { ...newMap[index], [field]: value };
        return { ...prev, map_config: newMap };
    });
  };

  const removeMapRow = (index) => {
    setCurrentRule(prev => {
        const newMap = prev.map_config.filter((_, i) => i !== index);
        return {
          ...prev,
          map_config: newMap.length > 0 ? newMap : [{ ...defaultMapRow }]
        };
    });
  };

  const updateAction = (actionKey, field, value) => {
    setCurrentRule(prev => ({
      ...prev,
      action_bundle: {
        ...prev.action_bundle,
        [actionKey]: { ...prev.action_bundle[actionKey], [field]: value }
      }
    }));
  };

  if (isLoading) return <Card className="p-6 text-center dark:bg-slate-800">{t('common.loading')}</Card>;

  return (
    <>
      <RuleOptimizationBanner onEditRule={(ruleId) => {
        const rule = rules.find(r => r.id === ruleId);
        if (rule) openEdit(rule);
      }} />

      <Card className="dark:bg-slate-800 dark:border-slate-700">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-xl dark:text-slate-100">{t('settings.automation_rules')}</CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setIsImportExportOpen(true)} className="gap-2">
              <Upload className="w-4 h-4" />
              {t('common.import_export')}
            </Button>

            <Button variant="outline" onClick={() => {
              setCurrentRule(JSON.parse(JSON.stringify(defaultRule)));
              setSendersInput('');
              setIsEditModalOpen(true);
            }}>
              <Plus className="w-4 h-4 ml-1" /> {t('automation_rules.manual_setup')}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="divide-y dark:divide-slate-700">
            {rules.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-slate-400 mb-4">{t('settings.no_automation_rules')}</p>
                <Button variant="outline" onClick={() => setIsWizardOpen(true)}>
                  התחל עם אשף ההגדרות
                </Button>
              </div>
            ) : rules.map(rule => (
              <div key={rule.id} className="flex items-center gap-4 py-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium dark:text-slate-200">{rule.name}</p>
                    {rule.require_approval && (
                      <Badge variant="outline" className="text-xs gap-1">
                        <ShieldCheck className="w-3 h-3" /> {t('automation_rules.requires_approval')}
                      </Badge>
                    )}
                    {!rule.is_active && (
                      <Badge variant="secondary" className="text-xs">
                        {t('common.inactive')}
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-slate-500">
                    {rule.map_config?.length || 0} {t('automation_rules.extraction_rules')} • 
                    {Object.values(rule.action_bundle || {}).filter(a => a?.enabled).length} {t('common.actions')}
                  </p>
                </div>
                
                <div className="flex items-center gap-2 flex-row-reverse">
                  <Switch checked={rule.is_active} onCheckedChange={(c) => toggleActive(rule.id, c)} />
                  
                  <Button variant="ghost" size="icon" onClick={() => openEdit(rule)} title="ערוך חוק">
                    <Edit className="w-4 h-4" />
                  </Button>
                  
                  <Button variant="ghost" size="icon" onClick={() => handleDuplicate(rule)} title="שכפל חוק">
                    <Copy className="w-4 h-4" />
                  </Button>
                  
                  <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => deleteMutation.mutate(rule.id)} title="מחק חוק">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="dark:text-slate-100">{currentRule.id ? t('settings.edit_rule') : t('settings.new_rule')}</DialogTitle>
          </DialogHeader>

          <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900 rounded-lg mb-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <span className="font-medium dark:text-slate-200">{t('automation_rules.require_approval')}</span>
            </div>
            <Switch 
              checked={currentRule.require_approval} 
              onCheckedChange={c => setCurrentRule({...currentRule, require_approval: c})} 
            />
          </div>
          {currentRule.require_approval && (
            <div className="mb-4">
              <Label className="dark:text-slate-300">{t('automation_rules.approver')}</Label>
              <Select value={currentRule.approver_email} onValueChange={v => setCurrentRule({...currentRule, approver_email: v})}>
                <SelectTrigger className="dark:bg-slate-900 dark:border-slate-600 dark:text-slate-200"><SelectValue placeholder={t('automation_rules.select_approver')} /></SelectTrigger>
                <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
                  {users.map(user => (
                    <SelectItem key={user.id} value={user.email} className="dark:text-slate-200">{user.full_name} ({user.email})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid grid-cols-3 bg-slate-100 dark:bg-muted border dark:border-slate-700">
              <TabsTrigger value="catch" className="dark:text-slate-300 dark:data-[state=active]:bg-slate-700 dark:data-[state=active]:text-slate-100">{t('automation_rules.filter_tab')}</TabsTrigger>
              <TabsTrigger value="map" className="dark:text-slate-300 dark:data-[state=active]:bg-slate-700 dark:data-[state=active]:text-slate-100">{t('automation_rules.extractor_tab')}</TabsTrigger>
              <TabsTrigger value="actions" className="dark:text-slate-300 dark:data-[state=active]:bg-slate-700 dark:data-[state=active]:text-slate-100">{t('automation_rules.actions_tab')}</TabsTrigger>
            </TabsList>

            <TabsContent value="catch" className="space-y-4 pt-4">
              <div>
                <Label className="dark:text-slate-300">{t('automation_rules.rule_name')}</Label>
                <Input value={currentRule.name} onChange={e => setCurrentRule({...currentRule, name: e.target.value})} placeholder={t('automation_rules.rule_name_placeholder')} className="dark:bg-slate-900 dark:border-slate-600 dark:text-slate-200" />
              </div>
              <div>
                <Label className="dark:text-slate-300">{t('automation_rules.sender_from')}</Label>
                <Input 
                  value={sendersInput} 
                  onChange={e => { setSendersInput(e.target.value); setFieldErrors(prev => ({...prev, senders: null})); }} 
                  placeholder={t('automation_rules.sender_placeholder')} 
                  className={`dark:bg-slate-900 dark:border-slate-600 dark:text-slate-200 ${fieldErrors.senders ? 'border-red-500 dark:border-red-500' : ''}`} 
                />
                {fieldErrors.senders && <p className="text-sm text-red-500 mt-1">{fieldErrors.senders}</p>}
              </div>
              <div>
                <Label className="dark:text-slate-300">{t('automation_rules.subject_text')}</Label>
                <Input 
                  value={currentRule.catch_config.subject_contains} 
                  onChange={e => { setCurrentRule({...currentRule, catch_config: {...currentRule.catch_config, subject_contains: e.target.value}}); setFieldErrors(prev => ({...prev, subject_contains: null})); }} 
                  placeholder={t('automation_rules.subject_text_placeholder')} 
                  className={`dark:bg-slate-900 dark:border-slate-600 dark:text-slate-200 ${fieldErrors.subject_contains ? 'border-red-500 dark:border-red-500' : ''}`} 
                />
                {fieldErrors.subject_contains && <p className="text-sm text-red-500 mt-1">{fieldErrors.subject_contains}</p>}
              </div>
              <div>
                <Label className="dark:text-slate-300">{t('automation_rules.body_text')}</Label>
                <Textarea 
                  value={currentRule.catch_config.body_contains} 
                  onChange={e => { setCurrentRule({...currentRule, catch_config: {...currentRule.catch_config, body_contains: e.target.value}}); setFieldErrors(prev => ({...prev, body_contains: null})); }} 
                  placeholder={t('automation_rules.body_keywords')} 
                  className={`dark:bg-slate-900 dark:border-slate-600 dark:text-slate-200 min-h-[80px] resize-y ${fieldErrors.body_contains ? 'border-red-500 dark:border-red-500' : ''}`} 
                  rows={3}
                />
                {fieldErrors.body_contains && <p className="text-sm text-red-500 mt-1">{fieldErrors.body_contains}</p>}
              </div>
              {fieldErrors.general && <p className="text-sm text-red-500 mt-1 p-2 bg-red-50 dark:bg-red-900/20 rounded">{fieldErrors.general}</p>}
            </TabsContent>

            <TabsContent value="map" className="space-y-4 pt-4">
              <p className="text-sm text-slate-500 dark:text-slate-400">{t('automation_rules.define_extraction')}</p>
              
              <div className="space-y-3">
                {currentRule.map_config.map((row, index) => (
                  <div key={index} className="flex items-center gap-2 p-3 bg-slate-50 dark:bg-slate-900 rounded-lg">
                    <Select value={row.source} onValueChange={v => updateMapRow(index, 'source', v)}>
                      <SelectTrigger className="w-28 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-200"><SelectValue /></SelectTrigger>
                      <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
                        <SelectItem value="subject" className="dark:text-slate-200">{t('automation_rules.source_subject')}</SelectItem>
                        <SelectItem value="body" className="dark:text-slate-200">{t('automation_rules.source_body', 'Body')}</SelectItem>
                        <SelectItem value="attachment" className="dark:text-slate-200">{t('automation_rules.source_attachments', 'Attachments')}</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input value={row.anchor_text} onChange={e => updateMapRow(index, 'anchor_text', e.target.value)} placeholder={t('automation_rules.anchor_text_placeholder')} className="flex-1 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-200" />
                    <Select value={row.target_field} onValueChange={v => updateMapRow(index, 'target_field', v)}>
                      <SelectTrigger className="w-44 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-200"><SelectValue /></SelectTrigger>
                      <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
                        {TARGET_FIELD_OPTIONS.map(opt => (
                          <SelectItem key={opt.value} value={opt.value} className="dark:text-slate-200">
                            <code className="text-xs">{opt.label}</code> {opt.description}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button variant="ghost" size="icon" onClick={() => removeMapRow(index)} className="text-red-500 dark:text-red-400"><X className="w-4 h-4" /></Button>
                  </div>
                ))}
              </div>
              <Button variant="outline" onClick={addMapRow} className="w-full gap-2 dark:border-slate-600 dark:text-slate-200"><Plus className="w-4 h-4" /> {t('automation_rules.add_extraction_rule')}</Button>
            </TabsContent>

            <TabsContent value="actions" className="pt-4">
              <Card>
                <CardContent className="space-y-6 pt-6">
                  {/* Billing */}
                  <div className="p-4 border dark:border-slate-700 rounded-lg space-y-4">
                    <div className="flex items-center gap-2">
                      <Checkbox checked={currentRule.action_bundle.billing.enabled} onCheckedChange={c => updateAction('billing', 'enabled', c)} />
                      <Label className="font-medium">{t('automation_rules.action_billing')}</Label>
                    </div>
                    {currentRule.action_bundle.billing.enabled && (
                      <div className="grid grid-cols-2 gap-3 pr-6">
                        <div>
                          <Label className="text-sm">{t('automation_rules.hours')}</Label>
                          <Input type="number" step="0.25" value={currentRule.action_bundle.billing.hours} onChange={e => updateAction('billing', 'hours', parseFloat(e.target.value) || 0)} />
                        </div>
                        <div>
                          <Label className="text-sm">{t('automation_rules.hourly_rate')}</Label>
                          <Input type="number" value={currentRule.action_bundle.billing.hourly_rate} onChange={e => updateAction('billing', 'hourly_rate', parseFloat(e.target.value) || 0)} />
                        </div>
                        <div className="col-span-2">
                          <Label className="text-sm">{t('common.description')}</Label>
                          <TokenInput value={currentRule.action_bundle.billing.description_template} onChange={v => updateAction('billing', 'description_template', v)} placeholder={t('automation_rules.processing_placeholder')} />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Create Alert */}
                  <div className="p-4 border dark:border-slate-700 rounded-lg space-y-4">
                    <div className="flex items-center gap-2">
                      <Checkbox checked={currentRule.action_bundle.create_alert.enabled} onCheckedChange={c => updateAction('create_alert', 'enabled', c)} />
                      <Label className="font-medium">{t('automation_rules.action_alert')}</Label>
                    </div>
                    {currentRule.action_bundle.create_alert.enabled && (
                      <div className="space-y-3 pr-6">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label className="text-sm">{t('automation_rules.alert_type')}</Label>
                            <Select value={currentRule.action_bundle.create_alert.alert_type} onValueChange={v => updateAction('create_alert', 'alert_type', v)}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="reminder">{t('automation_rules.type_reminder')}</SelectItem>
                                <SelectItem value="deadline">{t('automation_rules.type_deadline', 'Deadline')}</SelectItem>
                                <SelectItem value="urgent">{t('priority_labels.urgent')}</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                                                    <div>
                          <Label className="text-sm">{t('automation_rules.timing')}</Label>
                          <TimingSelector
                            base={currentRule.action_bundle.create_alert.timing_base}
                            docketType={currentRule.action_bundle.create_alert.timing_docket_type}
                            direction={currentRule.action_bundle.create_alert.timing_direction}
                            offset={currentRule.action_bundle.create_alert.timing_offset}
                            unit={currentRule.action_bundle.create_alert.timing_unit}
                            onBaseChange={v => updateAction('create_alert', 'timing_base', v)}
                            onDocketTypeChange={v => updateAction('create_alert', 'timing_docket_type', v)}
                            onDirectionChange={v => updateAction('create_alert', 'timing_direction', v)}
                            onOffsetChange={v => updateAction('create_alert', 'timing_offset', v)}
                            onUnitChange={v => updateAction('create_alert', 'timing_unit', v)}
                          />
                        </div>
                              <div>
        <Label className="text-sm">
          {t('automation_rules.execution_time')}
        </Label>
        <Input
          type="time"
          className="w-32"
          value={currentRule.action_bundle.create_alert.time_of_day || '09:00'}
          onChange={e => updateAction('create_alert', 'time_of_day', e.target.value)}
        />
      </div>
                        <div>
                          <Label className="text-sm">{t('automation_rules.message')}</Label>
                          <TokenInput value={currentRule.action_bundle.create_alert.message_template} onChange={v => updateAction('create_alert', 'message_template', v)} placeholder={t('automation_rules.message_placeholder')} />
                        </div>
                        
                        {/* English Alert */}
                        <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                            <div className="flex items-center gap-2 mb-3">
                                <Switch 
                                  checked={currentRule.action_bundle.create_alert.enable_english || false} 
                                  onCheckedChange={c => updateAction('create_alert', 'enable_english', c)} 
                                />
                                <Label className="text-sm text-blue-600 dark:text-blue-400 font-medium">{t('automation_rules.add_english_version')}</Label>
                            </div>
                            {currentRule.action_bundle.create_alert.enable_english && (
                                <div className="space-y-3 p-3 bg-slate-50 dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-700">
                                    <div>
                                        <Label className="text-sm">English Message</Label>
                                        <TokenInput 
                                          value={currentRule.action_bundle.create_alert.message_template_en || ''} 
                                          onChange={v => updateAction('create_alert', 'message_template_en', v)} 
                                          placeholder="Alert for case {Case_No}" 
                                        />
                                    </div>
                                </div>
                            )}
                        </div>

                        <div>
                          <Label className="text-sm">{t('automation_rules.recipients')}</Label>
                          <RecipientsSelect value={currentRule.action_bundle.create_alert.recipients} onChange={v => updateAction('create_alert', 'recipients', v)} />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Calendar Event */}
                  <div className="p-4 border dark:border-slate-700 rounded-lg space-y-4">
                    <div className="flex items-center gap-2">
                      <Checkbox checked={currentRule.action_bundle.calendar_event.enabled} onCheckedChange={c => updateAction('calendar_event', 'enabled', c)} />
                      <Label className="font-medium">{t('automation_rules.action_calendar')}</Label>
                    </div>
                    {currentRule.action_bundle.calendar_event.enabled && (
                      <div className="space-y-3 pr-6">
                                                <div className="space-y-1.5">
                          <Label className="text-sm">{t('automation_rules.event_name')}</Label>
                          <TokenInput value={currentRule.action_bundle.calendar_event.title_template} onChange={v => updateAction('calendar_event', 'title_template', v)} placeholder={t('automation_rules.event_name_placeholder')} />
                        </div>
                        <div>
                          <Label className="text-sm">{t('automation_rules.event_description_hebrew')}</Label>
                          <TokenTextarea 
                            value={currentRule.action_bundle.calendar_event.description_template || ''} 
                            onChange={v => updateAction('calendar_event', 'description_template', v)} 
                            placeholder={t('automation_rules.event_details_placeholder')} 
                          />
                        </div>
                        <div>
                          <Label className="text-sm">{t('automation_rules.timing')}</Label>
                          <TimingSelector
                            base={currentRule.action_bundle.calendar_event.timing_base}
                            docketType={currentRule.action_bundle.calendar_event.timing_docket_type}
                            direction={currentRule.action_bundle.calendar_event.timing_direction}
                            offset={currentRule.action_bundle.calendar_event.timing_offset}
                            unit={currentRule.action_bundle.calendar_event.timing_unit}
                            onBaseChange={v => updateAction('calendar_event', 'timing_base', v)}
                            onDocketTypeChange={v => updateAction('calendar_event', 'timing_docket_type', v)}
                            onDirectionChange={v => updateAction('calendar_event', 'timing_direction', v)}
                            onOffsetChange={v => updateAction('calendar_event', 'timing_offset', v)}
                            onUnitChange={v => updateAction('calendar_event', 'timing_unit', v)}
                          />
                        </div>
                         <div>
                            <Label className="text-sm">
                              {t('automation_rules.execution_time')}
                             </Label>
                           <Input
                              type="time"
                              className="w-32"
                             value={currentRule.action_bundle.calendar_event.time_of_day || '09:00'}
                             onChange={e => updateAction('calendar_event', 'time_of_day', e.target.value)}
                          />
                       </div>

                        {/* English Calendar */}
                        <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                          <div className="flex items-center gap-2 mb-3">
                            <Switch 
                              checked={currentRule.action_bundle.calendar_event.enable_english || false} 
                              onCheckedChange={c => updateAction('calendar_event', 'enable_english', c)} 
                            />
                            <Label className="text-sm text-blue-600 dark:text-blue-400 font-medium">{t('automation_rules.add_english_version')}</Label>
                          </div>
                          
                                                      {currentRule.action_bundle.calendar_event.enable_english && (
                              <div className="mt-4 space-y-4 p-4 bg-slate-50 dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-700">
                                <div className="space-y-1.5">
                                  <Label className="text-sm">English Event Title</Label>
                                  <TokenInput value={currentRule.action_bundle.calendar_event.title_template_en || ''} onChange={v => updateAction('calendar_event', 'title_template_en', v)} placeholder="Meeting: {Case_No}" />
                                </div>
                                <div className="space-y-1.5">
                                  <Label className="text-sm">English Description</Label>
                                  <TokenTextarea value={currentRule.action_bundle.calendar_event.description_template_en || ''} onChange={v => updateAction('calendar_event', 'description_template_en', v)} placeholder="Meeting details..." />
                                </div>
                              </div>
                            )}
                        </div>

                        <div>
                          <Label className="text-sm">{t('automation_rules.participants')}</Label>
                          <RecipientsSelect value={currentRule.action_bundle.calendar_event.attendees} onChange={v => updateAction('calendar_event', 'attendees', v)} />
                        </div>
                        <div className="flex items-center gap-2">
                          <Checkbox checked={currentRule.action_bundle.calendar_event.create_meet_link} onCheckedChange={c => updateAction('calendar_event', 'create_meet_link', c)} />
                          <Label className="text-sm">{t('automation_rules.create_video_link')}</Label>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Send Email */}
                  <div className="p-4 border dark:border-slate-700 rounded-lg space-y-4">
                    <div className="flex items-center gap-2">
                      <Checkbox checked={currentRule.action_bundle.send_email.enabled} onCheckedChange={c => updateAction('send_email', 'enabled', c)} />
                      <Label className="font-medium">{t('automation_rules.action_email')}</Label>
                    </div>
                    {currentRule.action_bundle.send_email.enabled && (
                      <div className="space-y-3 pr-6">
                        <div>
                          <Label className="text-sm">{t('automation_rules.recipients')}</Label>
                          <RecipientsSelect value={currentRule.action_bundle.send_email.recipients} onChange={v => updateAction('send_email', 'recipients', v)} />
                        </div>
                                                <div className="space-y-1.5">
                          <Label className="text-sm">{t('automation_rules.email_subject')}</Label>
                          <TokenInput value={currentRule.action_bundle.send_email.subject_template} onChange={v => updateAction('send_email', 'subject_template', v)} placeholder={t('automation_rules.email_subject_placeholder')} />
                        </div>
                        <div>
                          <Label className="text-sm">{t('automation_rules.content')}</Label>
                          <TokenTextarea value={currentRule.action_bundle.send_email.body_template} onChange={v => updateAction('send_email', 'body_template', v)} placeholder={t('automation_rules.email_content_placeholder')} />
                        </div>

                        {/* English Email */}
                        <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                          <div className="flex items-center gap-2 mb-3">
                            <Switch 
                              checked={currentRule.action_bundle.send_email.enable_english || false} 
                              onCheckedChange={c => updateAction('send_email', 'enable_english', c)} 
                            />
                            <Label className="text-sm text-blue-600 dark:text-blue-400 font-medium">{t('automation_rules.add_english_version')}</Label>
                          </div>
                          
                                                      {currentRule.action_bundle.send_email.enable_english && (
                              <div className="mt-4 space-y-4 p-4 bg-slate-50 dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-700">
                                <div className="space-y-1.5">
                                  <Label className="text-sm">English Subject</Label>
                                  <TokenInput value={currentRule.action_bundle.send_email.subject_template_en || ''} onChange={v => updateAction('send_email', 'subject_template_en', v)} placeholder="Update re: Case {Case_No}" />
                                </div>
                                <div className="space-y-1.5">
                                  <Label className="text-sm">English Body</Label>
                                  <TokenTextarea value={currentRule.action_bundle.send_email.body_template_en || ''} onChange={v => updateAction('send_email', 'body_template_en', v)} placeholder="Dear {Client_Name},&#10;&#10;An update has been received..." />
                                </div>
                              </div>
                            )}
                        </div>

                      </div>
                    )}
                  </div>

                  {/* Save File */}
                  <div className="p-4 border dark:border-slate-700 rounded-lg space-y-4">
                    <div className="flex items-center gap-2">
                      <Checkbox checked={currentRule.action_bundle.save_file.enabled} onCheckedChange={c => updateAction('save_file', 'enabled', c)} />
                      <Label className="font-medium">{t('automation_rules.action_save_file')}</Label>
                    </div>
                    {currentRule.action_bundle.save_file.enabled && (
                      <div className="pr-6 space-y-4">
                        {/* Path Builder */}
                        <PathBuilder
                          segments={currentRule.action_bundle.save_file.path_segments || []}
                          rootPath={currentRule.action_bundle.save_file.root_path || '/DWO'}
                          onChange={(segments) => updateAction('save_file', 'path_segments', segments)}
                        />

                        {/* Filename Template */}
                        <div>
                          <Label className="text-sm">תבנית שם קובץ</Label>
                          <FilenameTemplateInput
                            value={currentRule.action_bundle.save_file.filename_template || '{Original_Filename}'}
                            onChange={(v) => updateAction('save_file', 'filename_template', v)}
                            placeholder="{Case_No}_{Date}"
                            className="dark:bg-slate-800 dark:border-slate-600"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditModalOpen(false)} className="dark:border-slate-600 dark:text-slate-200">{t('common.cancel')}</Button>
            <Button onClick={handleSave} disabled={isSaving} className="bg-slate-800 hover:bg-slate-700 dark:bg-slate-600 dark:hover:bg-slate-500">
              {isSaving ? t('common.saving') : t('settings.save_rule')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>



      <ImportExportDialog
        open={isImportExportOpen}
        onOpenChange={setIsImportExportOpen}
        entityType="automations"
        existingData={rules}
        onExport={handleExport}
        onImport={handleImport}
        isLoading={isExporting}
      />
    </>
  );
}