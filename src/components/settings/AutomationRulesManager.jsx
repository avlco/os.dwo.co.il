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
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from "sonner";
import { Plus, Edit, Trash2, X, Braces } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const AVAILABLE_TOKENS = [
  { key: '{Case_No}', label: 'מספר תיק' },
  { key: '{Client_Name}', label: 'שם לקוח' },
  { key: '{Case_Type}', label: 'סוג תיק' },
  { key: '{Official_No}', label: 'מספר רשמי' },
  { key: '{Mail_Subject}', label: 'נושא המייל' },
  { key: '{Mail_Date}', label: 'תאריך המייל' },
  { key: '{Identifier_Found}', label: 'מזהה שנמצא' },
];

const defaultRule = {
  name: '',
  is_active: true,
  catch_config: { senders: [], subject_contains: '', body_contains: '' },
  map_config: [],
  action_bundle: {
    send_email: { enabled: false, recipient_type: 'client', custom_email: '', subject_template: '', body_template: '' },
    save_file: { enabled: false, path_template: '' },
    calendar_event: { enabled: false, title_template: '', days_offset: 7, create_meet_link: false },
    create_alert: { enabled: false, alert_type: 'reminder', message_template: '', days_offset: 7 },
    billing: { enabled: false, hours: 0.25, description_template: '' }
  }
};

// Token insertion button component
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
          <DropdownMenuItem 
            key={token.key} 
            onClick={() => onInsert(token.key)}
            className="dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <code className="text-xs bg-slate-100 dark:bg-slate-700 px-1 rounded ml-2">{token.key}</code>
            {token.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Input with token support
function TokenInput({ value, onChange, placeholder, className }) {
  const inputRef = React.useRef(null);
  
  const handleInsertToken = (token) => {
    const input = inputRef.current;
    if (input) {
      const start = input.selectionStart || value.length;
      const newValue = value.slice(0, start) + token + value.slice(start);
      onChange(newValue);
    } else {
      onChange(value + token);
    }
  };

  return (
    <div className="flex items-center gap-1">
      <Input 
        ref={inputRef}
        value={value} 
        onChange={e => onChange(e.target.value)} 
        placeholder={placeholder}
        className={className}
      />
      <TokenButton onInsert={handleInsertToken} />
    </div>
  );
}

// Textarea with token support
function TokenTextarea({ value, onChange, placeholder, className }) {
  const textareaRef = React.useRef(null);
  
  const handleInsertToken = (token) => {
    const textarea = textareaRef.current;
    if (textarea) {
      const start = textarea.selectionStart || value.length;
      const newValue = value.slice(0, start) + token + value.slice(start);
      onChange(newValue);
    } else {
      onChange(value + token);
    }
  };

  return (
    <div className="space-y-1">
      <div className="flex justify-end">
        <TokenButton onInsert={handleInsertToken} />
      </div>
      <Textarea 
        ref={textareaRef}
        value={value} 
        onChange={e => onChange(e.target.value)} 
        placeholder={placeholder}
        className={className}
      />
    </div>
  );
}

export default function AutomationRulesManager() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentRule, setCurrentRule] = useState(defaultRule);
  const [activeTab, setActiveTab] = useState("catch");
  const [sendersInput, setSendersInput] = useState('');

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ['automationRules'],
    queryFn: () => base44.entities.AutomationRule.list('-created_date'),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.AutomationRule.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['automationRules']);
      toast.success(t('settings.rule_created_success'));
      setIsModalOpen(false);
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.AutomationRule.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['automationRules']);
      toast.success(t('settings.rule_updated_success'));
      setIsModalOpen(false);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.AutomationRule.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['automationRules']);
      toast.success(t('settings.rule_deleted_success'));
    }
  });

  const openCreate = () => {
    setCurrentRule(JSON.parse(JSON.stringify(defaultRule)));
    setSendersInput('');
    setActiveTab("catch");
    setIsModalOpen(true);
  };

  const openEdit = (rule) => {
    const mergedRule = {
      ...defaultRule,
      ...rule,
      catch_config: { ...defaultRule.catch_config, ...rule.catch_config },
      map_config: rule.map_config || [],
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
    setIsModalOpen(true);
  };

  const handleSave = () => {
    const data = {
      ...currentRule,
      catch_config: {
        ...currentRule.catch_config,
        senders: sendersInput.split(',').map(s => s.trim()).filter(Boolean)
      }
    };
    if (currentRule.id) {
      updateMutation.mutate({ id: currentRule.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const toggleActive = (id, checked) => {
    updateMutation.mutate({ id, data: { is_active: checked } });
  };

  // Map config handlers
  const addMapRow = () => {
    setCurrentRule({
      ...currentRule,
      map_config: [...currentRule.map_config, { source: 'subject', anchor_text: '', target_field: 'case_no' }]
    });
  };

  const updateMapRow = (index, field, value) => {
    const newMap = [...currentRule.map_config];
    newMap[index] = { ...newMap[index], [field]: value };
    setCurrentRule({ ...currentRule, map_config: newMap });
  };

  const removeMapRow = (index) => {
    setCurrentRule({
      ...currentRule,
      map_config: currentRule.map_config.filter((_, i) => i !== index)
    });
  };

  // Action bundle handlers
  const updateAction = (actionKey, field, value) => {
    setCurrentRule({
      ...currentRule,
      action_bundle: {
        ...currentRule.action_bundle,
        [actionKey]: { ...currentRule.action_bundle[actionKey], [field]: value }
      }
    });
  };

  if (isLoading) return <Card className="p-6 text-center dark:bg-slate-800">{t('common.loading')}</Card>;

  return (
    <Card className="dark:bg-slate-800 dark:border-slate-700">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-xl dark:text-slate-100">{t('settings.automation_rules')}</CardTitle>
        <Button onClick={openCreate} className="gap-1"><Plus className="w-4 h-4" />{t('settings.new_rule')}</Button>
      </CardHeader>
      <CardContent>
        <div className="divide-y dark:divide-slate-700">
          {rules.length === 0 ? (
            <p className="text-center text-slate-400 py-8">{t('settings.no_automation_rules')}</p>
          ) : rules.map(rule => (
            <div key={rule.id} className="flex items-center gap-4 py-3">
              <div className="flex-1">
                <p className="font-medium dark:text-slate-200">{rule.name}</p>
                <p className="text-sm text-slate-500">
                  {rule.map_config?.length || 0} כללי חילוץ • 
                  {Object.values(rule.action_bundle || {}).filter(a => a?.enabled).length} פעולות
                </p>
              </div>
              <Switch checked={rule.is_active} onCheckedChange={(c) => toggleActive(rule.id, c)} />
              <Button variant="ghost" size="icon" onClick={() => openEdit(rule)}><Edit className="w-4 h-4" /></Button>
              <Button variant="ghost" size="icon" className="text-red-500" onClick={() => deleteMutation.mutate(rule.id)}><Trash2 className="w-4 h-4" /></Button>
            </div>
          ))}
        </div>
      </CardContent>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto dark:bg-slate-800">
          <DialogHeader>
            <DialogTitle>{currentRule.id ? t('settings.edit_rule') : t('settings.new_rule')}</DialogTitle>
          </DialogHeader>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid grid-cols-3">
              <TabsTrigger value="catch">1. מסננת (Catch)</TabsTrigger>
              <TabsTrigger value="map">2. מפענח (Map)</TabsTrigger>
              <TabsTrigger value="actions">3. פעולות (Actions)</TabsTrigger>
            </TabsList>

            {/* Tab 1: Catch */}
            <TabsContent value="catch" className="space-y-4 pt-4">
              <div>
                <Label>שם החוק</Label>
                <Input 
                  value={currentRule.name} 
                  onChange={e => setCurrentRule({...currentRule, name: e.target.value})} 
                  placeholder="למשל: הודעות רשמיות - סימני מסחר"
                />
              </div>
              <div>
                <Label>שולח (From)</Label>
                <Input 
                  value={sendersInput} 
                  onChange={e => setSendersInput(e.target.value)} 
                  placeholder="כתובות מייל מופרדות בפסיקים, למשל: @justice.gov.il"
                />
              </div>
              <div>
                <Label>טקסט בנושא</Label>
                <Input 
                  value={currentRule.catch_config.subject_contains} 
                  onChange={e => setCurrentRule({...currentRule, catch_config: {...currentRule.catch_config, subject_contains: e.target.value}})}
                  placeholder="למשל: הודעה על קיבול"
                />
              </div>
              <div>
                <Label>טקסט בגוף המייל</Label>
                <Input 
                  value={currentRule.catch_config.body_contains} 
                  onChange={e => setCurrentRule({...currentRule, catch_config: {...currentRule.catch_config, body_contains: e.target.value}})}
                  placeholder="מילות מפתח בגוף ההודעה"
                />
              </div>
            </TabsContent>

            {/* Tab 2: Map */}
            <TabsContent value="map" className="space-y-4 pt-4">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                הגדר כללי חילוץ: חפש טקסט עוגן וקח את מה שאחריו
              </p>
              
              <div className="space-y-3">
                {currentRule.map_config.map((row, index) => (
                  <div key={index} className="flex items-center gap-2 p-3 bg-slate-50 dark:bg-slate-900 rounded-lg">
                    <Select value={row.source} onValueChange={v => updateMapRow(index, 'source', v)}>
                      <SelectTrigger className="w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="subject">נושא</SelectItem>
                        <SelectItem value="body">גוף</SelectItem>
                        <SelectItem value="attachment">קבצים</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input 
                      value={row.anchor_text}
                      onChange={e => updateMapRow(index, 'anchor_text', e.target.value)}
                      placeholder="טקסט עוגן (למשל: תיק מס':)"
                      className="flex-1"
                    />
                    <Select value={row.target_field} onValueChange={v => updateMapRow(index, 'target_field', v)}>
                      <SelectTrigger className="w-36">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="case_no">מספר תיק פנימי</SelectItem>
                        <SelectItem value="official_no">מספר בקשה רשמי</SelectItem>
                        <SelectItem value="client_ref">סימוכין לקוח</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button variant="ghost" size="icon" onClick={() => removeMapRow(index)} className="text-red-500">
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>

              <Button variant="outline" onClick={addMapRow} className="w-full gap-2">
                <Plus className="w-4 h-4" /> הוסף כלל חילוץ
              </Button>
            </TabsContent>

            {/* Tab 3: Actions */}
            <TabsContent value="actions" className="space-y-4 pt-4">
              
              {/* Billing */}
              <div className="p-4 border dark:border-slate-700 rounded-lg space-y-3">
                <div className="flex items-center gap-2">
                  <Checkbox 
                    checked={currentRule.action_bundle.billing.enabled} 
                    onCheckedChange={c => updateAction('billing', 'enabled', c)} 
                  />
                  <Label className="font-medium">💰 חיוב שעות</Label>
                </div>
                {currentRule.action_bundle.billing.enabled && (
                  <div className="grid grid-cols-2 gap-3 pr-6">
                    <div>
                      <Label className="text-sm">שעות</Label>
                      <Input 
                        type="number" 
                        step="0.25"
                        value={currentRule.action_bundle.billing.hours} 
                        onChange={e => updateAction('billing', 'hours', parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div className="col-span-2">
                      <Label className="text-sm">תיאור</Label>
                      <TokenInput 
                        value={currentRule.action_bundle.billing.description_template}
                        onChange={v => updateAction('billing', 'description_template', v)}
                        placeholder="עיבוד דואר: {Mail_Subject}"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Create Alert */}
              <div className="p-4 border dark:border-slate-700 rounded-lg space-y-3">
                <div className="flex items-center gap-2">
                  <Checkbox 
                    checked={currentRule.action_bundle.create_alert.enabled} 
                    onCheckedChange={c => updateAction('create_alert', 'enabled', c)} 
                  />
                  <Label className="font-medium">🚨 התרעה / דוקטינג</Label>
                </div>
                {currentRule.action_bundle.create_alert.enabled && (
                  <div className="space-y-3 pr-6">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-sm">סוג</Label>
                        <Select 
                          value={currentRule.action_bundle.create_alert.alert_type} 
                          onValueChange={v => updateAction('create_alert', 'alert_type', v)}
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="reminder">תזכורת</SelectItem>
                            <SelectItem value="deadline">מועד פקיעה</SelectItem>
                            <SelectItem value="urgent">דחוף</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-sm">ימים מתאריך המייל</Label>
                        <Input 
                          type="number"
                          value={currentRule.action_bundle.create_alert.days_offset} 
                          onChange={e => updateAction('create_alert', 'days_offset', parseInt(e.target.value) || 0)}
                        />
                      </div>
                    </div>
                    <div>
                      <Label className="text-sm">הודעה</Label>
                      <TokenInput 
                        value={currentRule.action_bundle.create_alert.message_template}
                        onChange={v => updateAction('create_alert', 'message_template', v)}
                        placeholder="נדרשת תגובה בתיק {Case_No}"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Calendar Event */}
              <div className="p-4 border dark:border-slate-700 rounded-lg space-y-3">
                <div className="flex items-center gap-2">
                  <Checkbox 
                    checked={currentRule.action_bundle.calendar_event.enabled} 
                    onCheckedChange={c => updateAction('calendar_event', 'enabled', c)} 
                  />
                  <Label className="font-medium">📅 אירוע ביומן</Label>
                </div>
                {currentRule.action_bundle.calendar_event.enabled && (
                  <div className="space-y-3 pr-6">
                    <div>
                      <Label className="text-sm">שם האירוע</Label>
                      <TokenInput 
                        value={currentRule.action_bundle.calendar_event.title_template}
                        onChange={v => updateAction('calendar_event', 'title_template', v)}
                        placeholder="מועד אחרון - {Case_No}"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-sm">ימים מתאריך המייל</Label>
                        <Input 
                          type="number"
                          value={currentRule.action_bundle.calendar_event.days_offset} 
                          onChange={e => updateAction('calendar_event', 'days_offset', parseInt(e.target.value) || 0)}
                        />
                      </div>
                      <div className="flex items-center gap-2 pt-6">
                        <Checkbox 
                          checked={currentRule.action_bundle.calendar_event.create_meet_link} 
                          onCheckedChange={c => updateAction('calendar_event', 'create_meet_link', c)} 
                        />
                        <Label className="text-sm">צור קישור וידאו</Label>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Send Email */}
              <div className="p-4 border dark:border-slate-700 rounded-lg space-y-3">
                <div className="flex items-center gap-2">
                  <Checkbox 
                    checked={currentRule.action_bundle.send_email.enabled} 
                    onCheckedChange={c => updateAction('send_email', 'enabled', c)} 
                  />
                  <Label className="font-medium">📧 שליחת מייל</Label>
                </div>
                {currentRule.action_bundle.send_email.enabled && (
                  <div className="space-y-3 pr-6">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-sm">למי</Label>
                        <Select 
                          value={currentRule.action_bundle.send_email.recipient_type} 
                          onValueChange={v => updateAction('send_email', 'recipient_type', v)}
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="client">לקוח</SelectItem>
                            <SelectItem value="attorney">שותף אחראי</SelectItem>
                            <SelectItem value="custom">כתובת אחרת</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {currentRule.action_bundle.send_email.recipient_type === 'custom' && (
                        <div>
                          <Label className="text-sm">כתובת מייל</Label>
                          <Input 
                            value={currentRule.action_bundle.send_email.custom_email}
                            onChange={e => updateAction('send_email', 'custom_email', e.target.value)}
                          />
                        </div>
                      )}
                    </div>
                    <div>
                      <Label className="text-sm">נושא</Label>
                      <TokenInput 
                        value={currentRule.action_bundle.send_email.subject_template}
                        onChange={v => updateAction('send_email', 'subject_template', v)}
                        placeholder="עדכון בתיק {Case_No}"
                      />
                    </div>
                    <div>
                      <Label className="text-sm">תוכן</Label>
                      <TokenTextarea 
                        value={currentRule.action_bundle.send_email.body_template}
                        onChange={v => updateAction('send_email', 'body_template', v)}
                        placeholder="שלום {Client_Name},&#10;&#10;התקבלה הודעה בתיק..."
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Save File */}
              <div className="p-4 border dark:border-slate-700 rounded-lg space-y-3">
                <div className="flex items-center gap-2">
                  <Checkbox 
                    checked={currentRule.action_bundle.save_file.enabled} 
                    onCheckedChange={c => updateAction('save_file', 'enabled', c)} 
                  />
                  <Label className="font-medium">🗂️ שמירת קבצים</Label>
                </div>
                {currentRule.action_bundle.save_file.enabled && (
                  <div className="pr-6">
                    <Label className="text-sm">נתיב יעד</Label>
                    <TokenInput 
                      value={currentRule.action_bundle.save_file.path_template}
                      onChange={v => updateAction('save_file', 'path_template', v)}
                      placeholder="Clients/{Client_Name}/{Case_Type}/{Official_No}/Correspondence"
                    />
                  </div>
                )}
              </div>

            </TabsContent>
          </Tabs>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>{t('common.cancel')}</Button>
            <Button onClick={handleSave}>{t('settings.save_rule')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}