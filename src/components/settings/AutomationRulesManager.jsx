import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from "sonner";
import { Plus, Edit, Trash2 } from 'lucide-react';

const defaultRule = {
  name: '',
  is_active: true,
  priority: 10,
  catch_config: { senders: [], subject_match: '', attachment_text_match: '' },
  map_config: { source: 'subject', identifier_type: '', anchor_text: '' },
  action_bundle: { dropbox_path: '', create_task: false, log_time: false }
};

export default function AutomationRulesManager() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentRule, setCurrentRule] = useState(defaultRule);
  const [activeTab, setActiveTab] = useState("catch");
  const [sendersInput, setSendersInput] = useState('');

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ['automationRules'],
    queryFn: () => base44.entities.AutomationRule.list('-priority'),
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
    setCurrentRule(defaultRule);
    setSendersInput('');
    setActiveTab("catch");
    setIsModalOpen(true);
  };

  const openEdit = (rule) => {
    setCurrentRule({
      ...rule,
      catch_config: rule.catch_config || defaultRule.catch_config,
      map_config: rule.map_config || defaultRule.map_config,
      action_bundle: rule.action_bundle || defaultRule.action_bundle
    });
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
                <p className="text-sm text-slate-500">{t('settings.priority')}: {rule.priority}</p>
              </div>
              <Switch checked={rule.is_active} onCheckedChange={(c) => toggleActive(rule.id, c)} />
              <Button variant="ghost" size="icon" onClick={() => openEdit(rule)}><Edit className="w-4 h-4" /></Button>
              <Button variant="ghost" size="icon" className="text-red-500" onClick={() => deleteMutation.mutate(rule.id)}><Trash2 className="w-4 h-4" /></Button>
            </div>
          ))}
        </div>
      </CardContent>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-lg dark:bg-slate-800">
          <DialogHeader>
            <DialogTitle>{currentRule.id ? t('settings.edit_rule') : t('settings.new_rule')}</DialogTitle>
          </DialogHeader>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid grid-cols-3">
              <TabsTrigger value="catch">1. {t('settings.catch_tab')}</TabsTrigger>
              <TabsTrigger value="map">2. {t('settings.map_tab')}</TabsTrigger>
              <TabsTrigger value="actions">3. {t('settings.actions_tab')}</TabsTrigger>
            </TabsList>
            <TabsContent value="catch" className="space-y-4 pt-4">
              <div><Label>{t('settings.rule_name_field')}</Label>
                <Input value={currentRule.name} onChange={e => setCurrentRule({...currentRule, name: e.target.value})} /></div>
              <div><Label>{t('settings.priority_field')}</Label>
                <Input type="number" value={currentRule.priority} onChange={e => setCurrentRule({...currentRule, priority: parseInt(e.target.value) || 10})} /></div>
              <div><Label>{t('settings.sender_email_field')}</Label>
                <Input value={sendersInput} onChange={e => setSendersInput(e.target.value)} placeholder={t('settings.sender_email_hint')} /></div>
              <div><Label>{t('settings.subject_match_field')}</Label>
                <Input value={currentRule.catch_config.subject_match} onChange={e => setCurrentRule({...currentRule, catch_config: {...currentRule.catch_config, subject_match: e.target.value}})} /></div>
            </TabsContent>
            <TabsContent value="map" className="space-y-4 pt-4">
              <div><Label>{t('settings.source_field')}</Label>
                <Select value={currentRule.map_config.source} onValueChange={v => setCurrentRule({...currentRule, map_config: {...currentRule.map_config, source: v}})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="subject">{t('settings.source_subject')}</SelectItem>
                    <SelectItem value="body">{t('settings.source_body')}</SelectItem>
                    <SelectItem value="attachment">{t('settings.source_attachment')}</SelectItem>
                  </SelectContent>
                </Select></div>
              <div><Label>{t('settings.anchor_text_field')}</Label>
                <Input value={currentRule.map_config.anchor_text} onChange={e => setCurrentRule({...currentRule, map_config: {...currentRule.map_config, anchor_text: e.target.value}})} placeholder={t('settings.anchor_text_hint')} /></div>
              <div><Label>{t('settings.identifier_type_field')}</Label>
                <Select value={currentRule.map_config.identifier_type} onValueChange={v => setCurrentRule({...currentRule, map_config: {...currentRule.map_config, identifier_type: v}})}>
                  <SelectTrigger><SelectValue placeholder={t('settings.select_identifier_type')} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="official_no">{t('settings.id_type_official_no')}</SelectItem>
                    <SelectItem value="client_ref">{t('settings.id_type_client_ref')}</SelectItem>
                    <SelectItem value="application_number">{t('settings.id_type_application_number')}</SelectItem>
                  </SelectContent>
                </Select></div>
            </TabsContent>
            <TabsContent value="actions" className="space-y-4 pt-4">
              <div className="flex items-center gap-2">
                <Checkbox checked={currentRule.action_bundle.create_task} onCheckedChange={c => setCurrentRule({...currentRule, action_bundle: {...currentRule.action_bundle, create_task: c}})} />
                <Label>{t('settings.create_task_action')}</Label></div>
              <div className="flex items-center gap-2">
                <Checkbox checked={currentRule.action_bundle.log_time} onCheckedChange={c => setCurrentRule({...currentRule, action_bundle: {...currentRule.action_bundle, log_time: c}})} />
                <Label>{t('settings.log_time_action')}</Label></div>
              <div className="flex items-center gap-2">
                <Checkbox checked={!!currentRule.action_bundle.dropbox_path} onCheckedChange={c => setCurrentRule({...currentRule, action_bundle: {...currentRule.action_bundle, dropbox_path: c ? '/' : ''}})} />
                <Label>{t('settings.save_to_dropbox_action')}</Label></div>
              {currentRule.action_bundle.dropbox_path && (
                <div><Label>{t('settings.dropbox_path_field')}</Label>
                  <Input value={currentRule.action_bundle.dropbox_path} onChange={e => setCurrentRule({...currentRule, action_bundle: {...currentRule.action_bundle, dropbox_path: e.target.value}})} /></div>
              )}
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