import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
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
  ArrowRight
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../utils';

export default function AutomationDebugger() {
  const [selectedRule, setSelectedRule] = useState(null);
  const [selectedMail, setSelectedMail] = useState(null);
  const [testResults, setTestResults] = useState(null);

  // שליפת כל החוקים
  const { data: allRules = [] } = useQuery({
    queryKey: ['automationRules'],
    queryFn: async () => {
      const result = await base44.entities.AutomationRule.list('-created_date', 100);
      return Array.isArray(result) ? result : (result.data || []);
    },
  });

  // שליפת מיילים אחרונים
  const { data: allMails = [] } = useQuery({
    queryKey: ['recentMails'],
    queryFn: async () => {
      const result = await base44.entities.Mail.list('-received_at', 50);
      return Array.isArray(result) ? result : (result.data || []);
    },
  });

  // שליפת לוגים
  const { data: automationLogs = [] } = useQuery({
    queryKey: ['automationLogs'],
    queryFn: async () => {
      const result = await base44.entities.Activity.list('-created_at', 200);
      const activities = Array.isArray(result) ? result : (result.data || []);
      return activities.filter(a => a.activity_type === 'automation_log');
    },
  });

  // בדיקת התאמה בין חוק למייל
  const testRuleMatch = (rule, mail) => {
    const config = rule.catch_config || {};
    const matches = [];
    const failures = [];

    console.log(`\n[Debugger] Testing Rule "${rule.name}" against Mail "${mail.subject}"`);
    console.log('[Debugger] Rule config:', config);

    // בדיקת sender
    if (config.senders && Array.isArray(config.senders) && config.senders.length > 0) {
      const senderMatches = config.senders.some(sender => {
        const senderLower = sender.toLowerCase().trim();
        const mailSenderLower = (mail.sender_email || '').toLowerCase();
        return mailSenderLower.includes(senderLower) || senderLower.includes(mailSenderLower);
      });

      if (senderMatches) {
        matches.push(`✅ Sender: ${mail.sender_email} matches ${config.senders.join(', ')}`);
      } else {
        failures.push(`❌ Sender: ${mail.sender_email} doesn't match ${config.senders.join(', ')}`);
      }
    } else {
      matches.push('⚪ Sender: No sender filter configured');
    }

    // בדיקת subject
    if (config.subject_contains && config.subject_contains.trim().length > 0) {
      const subjectKeyword = config.subject_contains.toLowerCase().trim();
      const mailSubject = (mail.subject || '').toLowerCase();

      if (mailSubject.includes(subjectKeyword)) {
        matches.push(`✅ Subject: "${mail.subject}" contains "${config.subject_contains}"`);
      } else {
        failures.push(`❌ Subject: "${mail.subject}" doesn't contain "${config.subject_contains}"`);
      }
    } else {
      matches.push('⚪ Subject: No subject filter configured');
    }

    // בדיקת body
    if (config.body_contains && config.body_contains.trim().length > 0) {
      const bodyKeyword = config.body_contains.toLowerCase().trim();
      const mailBody = (mail.body_plain || mail.body_html || '').toLowerCase();

      if (mailBody.includes(bodyKeyword)) {
        matches.push(`✅ Body contains "${config.body_contains}"`);
      } else {
        failures.push(`❌ Body doesn't contain "${config.body_contains}"`);
      }
    } else {
      matches.push('⚪ Body: No body filter configured');
    }

    const isMatch = failures.length === 0 && matches.some(m => m.startsWith('✅'));

    console.log('[Debugger] Matches:', matches);
    console.log('[Debugger] Failures:', failures);
    console.log('[Debugger] Final result:', isMatch ? 'MATCH' : 'NO MATCH');

    return { isMatch, matches, failures };
  };

  // בדיקת חוק מול כל המיילים
  const testRuleAgainstAllMails = (rule) => {
    console.log(`\n[Debugger] 🎯 Testing Rule "${rule.name}" against all mails...`);

    const results = allMails.map(mail => {
      const test = testRuleMatch(rule, mail);
      return {
        mail,
        ...test
      };
    });

    const matchingMails = results.filter(r => r.isMatch);

    setTestResults({
      type: 'rule',
      rule,
      results,
      matchingCount: matchingMails.length,
      totalCount: allMails.length
    });

    setSelectedRule(rule);
    setSelectedMail(null);
  };

  // בדיקת מייל מול כל החוקים
  const testMailAgainstAllRules = (mail) => {
    console.log(`\n[Debugger] 📧 Testing Mail "${mail.subject}" against all rules...`);

    const results = allRules.map(rule => {
      const test = testRuleMatch(rule, mail);
      return {
        rule,
        ...test
      };
    });

    const matchingRules = results.filter(r => r.isMatch);

    setTestResults({
      type: 'mail',
      mail,
      results,
      matchingCount: matchingRules.length,
      totalCount: allRules.length
    });

    setSelectedMail(mail);
    setSelectedRule(null);
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-200">
            Automation Debugger
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            כלי לבדיקה ודיבאג של חוקי אוטומציה
          </p>
        </div>
        <Link to={createPageUrl('MailRoom')}>
          <Button variant="outline" className="gap-2">
            <ArrowRight className="w-4 h-4" />
            חזרה לחדר דואר
          </Button>
        </Link>
      </div>

      <Tabs defaultValue="rules" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="rules">חוקים ({allRules.length})</TabsTrigger>
          <TabsTrigger value="mails">מיילים ({allMails.length})</TabsTrigger>
          <TabsTrigger value="logs">לוגים ({automationLogs.length})</TabsTrigger>
        </TabsList>

        {/* טאב חוקים */}
        <TabsContent value="rules" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">חוקי אוטומציה</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[600px]">
                  <div className="space-y-2">
                    {allRules.map(rule => {
                      const stats = rule.metadata?.stats || {};
                      const isActive = rule.is_active === true;

                      return (
                        <Card
                          key={rule.id}
                          className={`cursor-pointer hover:border-blue-400 transition-colors ${
                            selectedRule?.id === rule.id ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : ''
                          }`}
                          onClick={() => testRuleAgainstAllMails(rule)}
                        >
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <h3 className="font-semibold text-slate-800 dark:text-slate-200">
                                    {rule.name}
                                  </h3>
                                  {isActive ? (
                                    <Badge variant="success" className="bg-green-100 text-green-800">
                                      פעיל
                                    </Badge>
                                  ) : (
                                    <Badge variant="secondary">לא פעיל</Badge>
                                  )}
                                </div>
                                <p className="text-xs text-slate-500 mt-1">
                                  {rule.description || 'אין תיאור'}
                                </p>
                              </div>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  testRuleAgainstAllMails(rule);
                                }}
                              >
                                <Play className="w-4 h-4" />
                              </Button>
                            </div>

                            <div className="grid grid-cols-3 gap-2 text-xs mt-3">
                              <div>
                                <span className="text-slate-500">ביצועים:</span>
                                <p className="font-semibold">{stats.total_executions || 0}</p>
                              </div>
                              <div>
                                <span className="text-slate-500">הצלחות:</span>
                                <p className="font-semibold text-green-600">{stats.successful_executions || 0}</p>
                              </div>
                              <div>
                                <span className="text-slate-500">כישלונות:</span>
                                <p className="font-semibold text-red-600">{stats.failed_executions || 0}</p>
                              </div>
                            </div>

                            {rule.catch_config && (
                              <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700">
                                <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                                  תנאי CATCH:
                                </p>
                                <div className="space-y-1 text-xs">
                                  {rule.catch_config.senders?.length > 0 && (
                                    <div className="text-slate-600 dark:text-slate-400">
                                      • שולח: {rule.catch_config.senders.join(', ')}
                                    </div>
                                  )}
                                  {rule.catch_config.subject_contains && (
                                    <div className="text-slate-600 dark:text-slate-400">
                                      • נושא מכיל: "{rule.catch_config.subject_contains}"
                                    </div>
                                  )}
                                  {rule.catch_config.body_contains && (
                                    <div className="text-slate-600 dark:text-slate-400">
                                      • גוף מכיל: "{rule.catch_config.body_contains}"
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">תוצאות בדיקה</CardTitle>
              </CardHeader>
              <CardContent>
                {testResults?.type === 'rule' ? (
                  <ScrollArea className="h-[600px]">
                    <div className="space-y-4">
                      <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                        <h3 className="font-semibold mb-2">בדיקת חוק: {testResults.rule.name}</h3>
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                          נמצאו {testResults.matchingCount} מיילים תואמים מתוך {testResults.totalCount}
                        </p>
                      </div>

                      {testResults.results.map((result, idx) => (
                        <Card
                          key={idx}
                          className={result.isMatch ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : ''}
                        >
                          <CardContent className="p-4">
                            <div className="flex items-start gap-2 mb-2">
                              {result.isMatch ? (
                                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                              ) : (
                                <XCircle className="w-5 h-5 text-slate-400 flex-shrink-0 mt-0.5" />
                              )}
                              <div className="flex-1">
                                <p className="font-semibold text-sm">{result.mail.subject}</p>
                                <p className="text-xs text-slate-500">מאת: {result.mail.sender_email}</p>
                              </div>
                            </div>

                            <div className="space-y-1 text-xs mt-3">
                              {result.matches.map((match, i) => (
                                <div key={i} className="text-slate-600 dark:text-slate-400">
                                  {match}
                                </div>
                              ))}
                              {result.failures.map((failure, i) => (
                                <div key={i} className="text-red-600 dark:text-red-400">
                                  {failure}
                                </div>
                              ))}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </ScrollArea>
                ) : (
                  <div className="flex flex-col items-center justify-center h-[600px] text-slate-400">
                    <Settings className="w-12 h-12 mb-2" />
                    <p>בחר חוק כדי לבדוק אותו מול כל המיילים</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* טאב מיילים */}
        <TabsContent value="mails" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">מיילים אחרונים</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[600px]">
                  <div className="space-y-2">
                    {allMails.map(mail => (
                      <Card
                        key={mail.id}
                        className={`cursor-pointer hover:border-blue-400 transition-colors ${
                          selectedMail?.id === mail.id ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : ''
                        }`}
                        onClick={() => testMailAgainstAllRules(mail)}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <h3 className="font-semibold text-sm text-slate-800 dark:text-slate-200">
                                {mail.subject}
                              </h3>
                              <p className="text-xs text-slate-500 mt-1">
                                מאת: {mail.sender_email}
                              </p>
                              <Badge variant="secondary" className="mt-2 text-xs">
                                {mail.processing_status || 'pending'}
                              </Badge>
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={(e) => {
                                e.stopPropagation();
                                testMailAgainstAllRules(mail);
                              }}
                            >
                              <Play className="w-4 h-4" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">תוצאות בדיקה</CardTitle>
              </CardHeader>
              <CardContent>
                {testResults?.type === 'mail' ? (
                  <ScrollArea className="h-[600px]">
                    <div className="space-y-4">
                      <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                        <h3 className="font-semibold mb-2">בדיקת מייל: {testResults.mail.subject}</h3>
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                          נמצאו {testResults.matchingCount} חוקים תואמים מתוך {testResults.totalCount}
                        </p>
                      </div>

                      {testResults.results.map((result, idx) => (
                        <Card
                          key={idx}
                          className={result.isMatch ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : ''}
                        >
                          <CardContent className="p-4">
                            <div className="flex items-start gap-2 mb-2">
                              {result.isMatch ? (
                                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                              ) : (
                                <XCircle className="w-5 h-5 text-slate-400 flex-shrink-0 mt-0.5" />
                              )}
                              <div className="flex-1">
                                <p className="font-semibold text-sm">{result.rule.name}</p>
                                <Badge variant={result.rule.is_active ? 'success' : 'secondary'} className="mt-1">
                                  {result.rule.is_active ? 'פעיל' : 'לא פעיל'}
                                </Badge>
                              </div>
                            </div>

                            <div className="space-y-1 text-xs mt-3">
                              {result.matches.map((match, i) => (
                                <div key={i} className="text-slate-600 dark:text-slate-400">
                                  {match}
                                </div>
                              ))}
                              {result.failures.map((failure, i) => (
                                <div key={i} className="text-red-600 dark:text-red-400">
                                  {failure}
                                </div>
                              ))}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </ScrollArea>
                ) : (
                  <div className="flex flex-col items-center justify-center h-[600px] text-slate-400">
                    <Mail className="w-12 h-12 mb-2" />
                    <p>בחר מייל כדי לבדוק אותו מול כל החוקים</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* טאב לוגים */}
        <TabsContent value="logs" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">היסטוריית ביצועים</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[700px]">
                <div className="space-y-2">
                  {automationLogs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                      <FileText className="w-12 h-12 mb-2" />
                      <p>אין לוגים של אוטומציות</p>
                    </div>
                  ) : (
                    automationLogs.map(log => {
                      const metadata = log.metadata || {};
                      const isSuccess = log.status === 'completed';

                      return (
                        <Card key={log.id} className={isSuccess ? 'border-green-300' : 'border-red-300'}>
                          <CardContent className="p-4">
                            <div className="flex items-start gap-2">
                              {isSuccess ? (
                                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                              ) : (
                                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                              )}
                              <div className="flex-1">
                                <h3 className="font-semibold text-sm">{log.description}</h3>
                                <p className="text-xs text-slate-500 mt-1">
                                  {new Date(log.created_at).toLocaleString('he-IL')}
                                </p>

                                {metadata.actions_summary && (
                                  <div className="grid grid-cols-4 gap-2 mt-3 text-xs">
                                    <div>
                                      <span className="text-slate-500">סה"כ:</span>
                                      <p className="font-semibold">{metadata.actions_summary.total || 0}</p>
                                    </div>
                                    <div>
                                      <span className="text-slate-500">הצלחות:</span>
                                      <p className="font-semibold text-green-600">
                                        {metadata.actions_summary.success || 0}
                                      </p>
                                    </div>
                                    <div>
                                      <span className="text-slate-500">כישלונות:</span>
                                      <p className="font-semibold text-red-600">
                                        {metadata.actions_summary.failed || 0}
                                      </p>
                                    </div>
                                    <div>
                                      <span className="text-slate-500">ממתין לאישור:</span>
                                      <p className="font-semibold text-yellow-600">
                                        {metadata.actions_summary.pending_approval || 0}
                                      </p>
                                    </div>
                                  </div>
                                )}

                                {metadata.error_message && (
                                  <div className="mt-3 p-2 bg-red-50 dark:bg-red-900/20 rounded text-xs text-red-700 dark:text-red-300">
                                    <strong>שגיאה:</strong> {metadata.error_message}
                                  </div>
                                )}

                                {metadata.execution_time_ms && (
                                  <p className="text-xs text-slate-500 mt-2">
                                    זמן ביצוע: {metadata.execution_time_ms}ms
                                  </p>
                                )}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
