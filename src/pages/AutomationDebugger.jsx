import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  CheckCircle,
  XCircle,
  AlertCircle,
  Play,
  Settings,
  Mail,
  FileText,
  ArrowRight,
  Database,
  Zap
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../utils';

export default function AutomationDebugger() {
  const { t } = useTranslation();
  const [selectedRule, setSelectedRule] = useState(null);
  const [selectedMail, setSelectedMail] = useState(null);
  const [testResults, setTestResults] = useState(null);
  const [simulationResult, setSimulationResult] = useState(null);

  // Fetch data
  const { data: allRules = [] } = useQuery({
    queryKey: ['automationRules'],
    queryFn: async () => {
      const result = await base44.entities.AutomationRule.list('-created_date', 100);
      return Array.isArray(result) ? result : (result.data || []);
    },
  });

  const { data: allMails = [] } = useQuery({
    queryKey: ['recentMails'],
    queryFn: async () => {
      const result = await base44.entities.Mail.list('-received_at', 50);
      return Array.isArray(result) ? result : (result.data || []);
    },
  });

  const { data: automationLogs = [] } = useQuery({
    queryKey: ['automationLogs'],
    queryFn: async () => {
      const result = await base44.entities.Activity.list('-created_at', 200);
      const activities = Array.isArray(result) ? result : (result.data || []);
      return activities.filter(a => a.activity_type === 'automation_log');
    },
  });

  // Server-side Simulation Mutation
  const simulateRuleMutation = useMutation({
    mutationFn: async ({ mailId, ruleId }) => {
      const response = await base44.functions.invoke('executeAutomationRule', {
        mailId,
        ruleId,
        testMode: true // Important: Dry run
      });
      
      if (response.error) throw new Error(response.error.message || "Simulation failed");
      if (response.data?.error) throw new Error(response.data.error);
      
      return response.data;
    },
    onSuccess: (data) => {
      setSimulationResult(data);
    },
    onError: (err) => {
      setSimulationResult({ error: err.message });
    }
  });

  // Client-side Match Testing (Catch)
  const testRuleMatch = (rule, mail) => {
    const config = rule.catch_config || {};
    const matches = [];
    const failures = [];

    // Sender Check
    if (config.senders && Array.isArray(config.senders) && config.senders.length > 0) {
      const senderMatches = config.senders.some(sender => {
        const senderLower = sender.toLowerCase().trim();
        const mailSenderLower = (mail.sender_email || '').toLowerCase();
        return mailSenderLower.includes(senderLower) || senderLower.includes(mailSenderLower);
      });

      if (senderMatches) {
        matches.push(`✅ Sender: "${mail.sender_email}" תואם לאחד השולחים המוגדרים`);
      } else {
        failures.push(`❌ Sender: "${mail.sender_email}" לא ברשימת המורשים`);
      }
    } else {
      matches.push('⚪ Sender: אין סינון שולח');
    }

    // Subject Check
    if (config.subject_contains && config.subject_contains.trim().length > 0) {
      const subjectKeyword = config.subject_contains.toLowerCase().trim();
      const mailSubject = (mail.subject || '').toLowerCase();

      if (mailSubject.includes(subjectKeyword)) {
        matches.push(`✅ Subject: מכיל את הטקסט "${config.subject_contains}"`);
      } else {
        failures.push(`❌ Subject: לא מכיל את הטקסט "${config.subject_contains}"`);
      }
    } else {
      matches.push('⚪ Subject: אין סינון נושא');
    }

    // Body Check
    if (config.body_contains && config.body_contains.trim().length > 0) {
      const bodyKeyword = config.body_contains.toLowerCase().trim();
      const mailBody = (mail.body_plain || mail.body_html || '').toLowerCase();

      if (mailBody.includes(bodyKeyword)) {
        matches.push(`✅ Body: מכיל את הטקסט "${config.body_contains}"`);
      } else {
        failures.push(`❌ Body: לא מכיל את הטקסט "${config.body_contains}"`);
      }
    } else {
      matches.push('⚪ Body: אין סינון גוף הודעה');
    }

    // MAP Phase Simulation (Client Side Preview)
    const mapPreview = [];
    if (rule.map_config && Array.isArray(rule.map_config)) {
      rule.map_config.forEach(mapRule => {
        const sourceText = mapRule.source === 'body' 
          ? (mail.body_plain || mail.body_html || '') 
          : mail.subject;
        
        if (mapRule.anchor_text && sourceText.includes(mapRule.anchor_text)) {
           const extracted = sourceText.split(mapRule.anchor_text)[1]?.trim()?.split(/\s+/)[0];
           mapPreview.push(`🔹 חילוץ (Map): "${mapRule.target_field}" -> "${extracted}"`);
        } else if (mapRule.anchor_text) {
           mapPreview.push(`🔸 חילוץ (Map): עוגן "${mapRule.anchor_text}" לא נמצא`);
        }
      });
    }

    const isMatch = failures.length === 0;

    return { isMatch, matches, failures, mapPreview };
  };

  const handleTest = (rule, mail) => {
    const result = testRuleMatch(rule, mail);
    setTestResults({ rule, mail, ...result });
    setSimulationResult(null); // Clear previous simulation
    setSelectedRule(rule);
    setSelectedMail(mail);
  };

  const runServerSimulation = () => {
    if (selectedRule && selectedMail) {
      simulateRuleMutation.mutate({ 
        mailId: selectedMail.id, 
        ruleId: selectedRule.id 
      });
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-200">
            {t('automation_debugger.title')}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            {t('automation_debugger.subtitle')}
          </p>
        </div>
        <Link to={createPageUrl('MailRoom')}>
          <Button variant="outline" className="gap-2">
            <ArrowRight className="w-4 h-4" />
            {t('mail_rules.back_to_mailroom')}
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Selection */}
        <div className="space-y-6 lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t('automation_debugger.select_rule')}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[300px]">
                <div className="divide-y">
                  {allRules.map(rule => (
                    <div 
                      key={rule.id}
                      onClick={() => setSelectedRule(rule)}
                      className={`p-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors ${selectedRule?.id === rule.id ? 'bg-blue-50 dark:bg-blue-900/20 border-r-4 border-blue-500' : ''}`}
                    >
                      <p className="font-medium text-sm">{rule.name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className="text-xs">{rule.is_active ? t('common.active') : t('common.inactive')}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t('automation_debugger.select_mail')}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[300px]">
                <div className="divide-y">
                  {allMails.map(mail => (
                    <div 
                      key={mail.id}
                      onClick={() => {
                        setSelectedMail(mail);
                        if (selectedRule) handleTest(selectedRule, mail);
                      }}
                      className={`p-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors ${selectedMail?.id === mail.id ? 'bg-blue-50 dark:bg-blue-900/20 border-r-4 border-blue-500' : ''}`}
                    >
                      <p className="font-medium text-sm truncate">{mail.subject || '(ללא נושא)'}</p>
                      <p className="text-xs text-slate-500">{mail.sender_email}</p>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Results */}
        <div className="lg:col-span-2 space-y-6">
          {selectedRule && selectedMail ? (
            <>
              {/* Client Side Analysis */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-lg">{t('automation_debugger.client_analysis')}</CardTitle>
                  <Button onClick={() => handleTest(selectedRule, selectedMail)} size="sm" variant="outline">
                    {t('automation_debugger.refresh_test')}
                  </Button>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-lg">
                      <h3 className="font-semibold mb-2">{t('automation_debugger.catch_phase')}</h3>
                      <div className="space-y-1 text-sm">
                        {testResults?.matches.map((m, i) => <div key={i} className="text-green-700 dark:text-green-400">{m}</div>)}
                        {testResults?.failures.map((f, i) => <div key={i} className="text-red-600 dark:text-red-400">{f}</div>)}
                      </div>
                      
                      {testResults?.isMatch ? (
                         <div className="mt-2 flex items-center text-green-600 font-bold gap-2">
                           <CheckCircle className="w-5 h-5" /> {t('automation_debugger.mail_matches')}
                         </div>
                      ) : (
                         <div className="mt-2 flex items-center text-red-600 font-bold gap-2">
                           <XCircle className="w-5 h-5" /> {t('automation_debugger.mail_not_matches')}
                         </div>
                      )}
                    </div>

                    <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-lg">
                      <h3 className="font-semibold mb-2">{t('automation_debugger.map_phase')}</h3>
                      {testResults?.mapPreview && testResults.mapPreview.length > 0 ? (
                        <div className="space-y-1 text-sm text-slate-700 dark:text-slate-300">
                          {testResults.mapPreview.map((m, i) => <div key={i}>{m}</div>)}
                        </div>
                      ) : (
                        <p className="text-sm text-slate-500">{t('automation_debugger.no_extraction_rules')}</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Server Side Simulation */}
              <Card className="border-blue-200 dark:border-blue-800">
                <CardHeader className="flex flex-row items-center justify-between pb-2 bg-blue-50/50 dark:bg-blue-900/10">
                  <div className="flex items-center gap-2">
                    <Zap className="w-5 h-5 text-blue-600" />
                    <CardTitle className="text-lg">{t('automation_debugger.server_simulation')}</CardTitle>
                  </div>
                  <Button 
                    onClick={runServerSimulation} 
                    disabled={simulateRuleMutation.isPending}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    {simulateRuleMutation.isPending ? t('automation_debugger.running') : t('automation_debugger.run_simulation')}
                  </Button>
                </CardHeader>
                <CardContent className="pt-4">
                  {!simulationResult ? (
                    <p className="text-slate-500 text-center py-4">
                      {t('automation_debugger.dry_run_desc')}
                    </p>
                  ) : simulationResult.error ? (
                    <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-lg border border-red-200 dark:border-red-700">
                      <div className="flex items-center gap-2 font-bold mb-2">
                        <AlertCircle className="w-5 h-5" /> {t('automation_debugger.execution_error')}
                      </div>
                      <pre className="text-xs whitespace-pre-wrap">{simulationResult.error}</pre>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-3 bg-white dark:bg-slate-800 border dark:border-slate-700 rounded shadow-sm">
                           <span className="text-xs text-slate-500 dark:text-slate-400">{t('automation_debugger.execution_time')}</span>
                           <p className="font-mono dark:text-slate-200">{simulationResult.execution_time_ms}ms</p>
                        </div>
                        <div className="p-3 bg-white dark:bg-slate-800 border dark:border-slate-700 rounded shadow-sm">
                           <span className="text-xs text-slate-500 dark:text-slate-400">{t('automation_debugger.status')}</span>
                           <p className="font-bold text-blue-600 dark:text-blue-400">{t('automation_debugger.simulated_success')}</p>
                        </div>
                      </div>

                      <div>
                        <h4 className="font-semibold mb-2 text-sm">{t('automation_debugger.actions_performed')}</h4>
                        <div className="space-y-2">
                          {simulationResult.results?.map((res, idx) => (
                            <div key={idx} className={`p-3 rounded border ${res.status === 'success' ? 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-700' : 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-700'}`}>
                              <div className="flex justify-between">
                                <span className="font-bold text-sm uppercase">{res.action}</span>
                                <Badge variant={res.status === 'success' ? 'outline' : 'destructive'}>{res.status}</Badge>
                              </div>
                              {res.status === 'failed' && (
                                <p className="text-xs text-red-600 mt-1">{res.error}</p>
                              )}
                              {res.data && (
                                <pre className="text-[10px] mt-2 bg-white/50 dark:bg-slate-800/50 dark:text-slate-300 p-1 rounded overflow-auto">
                                  {JSON.stringify(res.data, null, 2)}
                                </pre>
                              )}
                              {res.status === 'test_skipped' && (
                                <p className="text-xs text-slate-500 mt-1">{t('automation_debugger.test_skipped')}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 border-2 border-dashed dark:border-slate-700 rounded-xl min-h-[400px]">
              <Settings className="w-16 h-16 mb-4 opacity-20" />
              <p className="text-lg dark:text-slate-400">{t('automation_debugger.select_rule_and_mail')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}