import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '../api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Activity, Mail, Zap, AlertCircle, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';

export default function AutomationDebugger() {
  const [selectedRule, setSelectedRule] = useState(null);
  const [selectedMail, setSelectedMail] = useState(null);

  const { data: rules = [], refetch: refetchRules } = useQuery({
    queryKey: ['automationRules'],
    queryFn: () => base44.entities.AutomationRule.list('-created_date', 100),
  });

  const { data: allMails = [], refetch: refetchMails } = useQuery({
    queryKey: ['recentMails'],
    queryFn: async () => {
      const result = await base44.entities.Mail.list('-received_at', 50);
      return Array.isArray(result) ? result : (result.data || []);
    },
  });

  const { data: logs = [], refetch: refetchLogs } = useQuery({
    queryKey: ['automationLogs'],
    queryFn: async () => {
      const activities = await base44.entities.Activity.list('-created_at', 200);
      const activitiesArray = Array.isArray(activities) ? activities : (activities.data || []);
      return activitiesArray.filter(a => a.activity_type === 'automation_log');
    },
  });

  const handleRefreshAll = () => {
    refetchRules();
    refetchMails();
    refetchLogs();
  };

  const testRuleMatch = (rule, mail) => {
    const config = rule.catch_config || {};
    let matches = [];
    let failures = [];

    // בדיקת sender
    if (config.senders && config.senders.length > 0) {
      const senderMatch = config.senders.some(s => 
        mail.sender_email.toLowerCase().includes(s.toLowerCase())
      );
      if (senderMatch) {
        matches.push(`✅ Sender: ${mail.sender_email} matches ${config.senders.join(', ')}`);
      } else {
        failures.push(`❌ Sender: ${mail.sender_email} doesn't match ${config.senders.join(', ')}`);
      }
    }

    // בדיקת subject
    if (config.subject_contains) {
      const subjectMatch = mail.subject?.toLowerCase().includes(config.subject_contains.toLowerCase());
      if (subjectMatch) {
        matches.push(`✅ Subject: "${mail.subject}" contains "${config.subject_contains}"`);
      } else {
        failures.push(`❌ Subject: "${mail.subject}" doesn't contain "${config.subject_contains}"`);
      }
    }

    // בדיקת body
    if (config.body_contains) {
      const bodyMatch = 
        mail.body_plain?.toLowerCase().includes(config.body_contains.toLowerCase()) ||
        mail.body_html?.toLowerCase().includes(config.body_contains.toLowerCase());
      if (bodyMatch) {
        matches.push(`✅ Body contains "${config.body_contains}"`);
      } else {
        failures.push(`❌ Body doesn't contain "${config.body_contains}"`);
      }
    }

    const isMatch = failures.length === 0 && matches.length > 0;
    return { isMatch, matches, failures };
  };

  const getRuleLogs = (ruleId) => {
    return logs.filter(log => log.metadata?.rule_id === ruleId);
  };

  const getMailLogs = (mailId) => {
    return logs.filter(log => log.metadata?.mail_id === mailId);
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">🔍 Automation Debugger</h1>
          <p className="text-slate-500">כלי לאבחון בעיות באוטומציות</p>
        </div>
        <Button onClick={handleRefreshAll} variant="outline">
          <RefreshCw className="w-4 h-4 mr-2" />
          רענן הכל
        </Button>
      </div>

      <Tabs defaultValue="rules">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="rules">חוקים ({rules.length})</TabsTrigger>
          <TabsTrigger value="mails">מיילים ({allMails.length})</TabsTrigger>
          <TabsTrigger value="logs">לוגים ({logs.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="rules" className="space-y-4">
          {rules.map((rule) => {
            const ruleLogs = getRuleLogs(rule.id);
            const successCount = ruleLogs.filter(l => l.status === 'completed').length;
            const failedCount = ruleLogs.filter(l => l.status === 'failed').length;
            const lastExecution = ruleLogs[0];

            return (
              <Card key={rule.id} className={rule.is_active ? '' : 'opacity-50'}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {rule.is_active ? (
                        <CheckCircle2 className="w-5 h-5 text-green-600" />
                      ) : (
                        <XCircle className="w-5 h-5 text-gray-400" />
                      )}
                      <div>
                        <CardTitle>{rule.name}</CardTitle>
                        <p className="text-sm text-slate-500 mt-1">
                          {rule.is_active ? 'פעיל' : 'לא פעיל'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{successCount} הצלחות</Badge>
                      {failedCount > 0 && (
                        <Badge variant="destructive">{failedCount} כשלונות</Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div>
                      <h4 className="font-semibold text-sm mb-2">תנאי CATCH:</h4>
                      <div className="bg-slate-50 p-3 rounded text-sm space-y-1">
                        {rule.catch_config?.senders?.length > 0 && (
                          <p>📧 Senders: {rule.catch_config.senders.join(', ')}</p>
                        )}
                        {rule.catch_config?.subject_contains && (
                          <p>📝 Subject contains: "{rule.catch_config.subject_contains}"</p>
                        )}
                        {rule.catch_config?.body_contains && (
                          <p>📄 Body contains: "{rule.catch_config.body_contains}"</p>
                        )}
                        {!rule.catch_config?.senders && !rule.catch_config?.subject_contains && !rule.catch_config?.body_contains && (
                          <p className="text-red-600">⚠️ אין תנאים מוגדרים!</p>
                        )}
                      </div>
                    </div>

                    {lastExecution && (
                      <div>
                        <h4 className="font-semibold text-sm mb-2">הרצה אחרונה:</h4>
                        <div className={`p-3 rounded text-sm ${
                          lastExecution.status === 'completed' ? 'bg-green-50' : 'bg-red-50'
                        }`}>
                          <p>
                            {lastExecution.status === 'completed' ? '✅' : '❌'} 
                            {' '}{format(new Date(lastExecution.created_at), 'dd/MM/yyyy HH:mm', { locale: he })}
                          </p>
                          <p className="text-slate-600 mt-1">
                            מייל: {lastExecution.metadata?.mail_subject}
                          </p>
                          {lastExecution.metadata?.error_message && (
                            <p className="text-red-700 mt-2">
                              שגיאה: {lastExecution.metadata.error_message}
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setSelectedRule(rule)}
                    >
                      🧪 בדוק התאמה למיילים
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="mails" className="space-y-4">
          {allMails.slice(0, 20).map((mail) => {
            const mailLogs = getMailLogs(mail.id);
            const hasAutomation = mailLogs.length > 0;

            return (
              <Card key={mail.id}>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold">{mail.subject || '(ללא נושא)'}</h3>
                      <p className="text-sm text-slate-500 mt-1">
                        📧 {mail.sender_email} • {format(new Date(mail.received_at), 'dd/MM HH:mm', { locale: he })}
                      </p>
                      
                      {hasAutomation ? (
                        <div className="mt-3 space-y-1">
                          <p className="text-sm font-medium">אוטומציות שרצו:</p>
                          {mailLogs.map((log, idx) => (
                            <p key={idx} className="text-sm text-slate-600">
                              {log.status === 'completed' ? '✅' : '❌'} {log.metadata?.rule_name}
                            </p>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-amber-600 mt-3">
                          ⚠️ לא רצה שום חוק אוטומציה
                        </p>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setSelectedMail(mail)}
                    >
                      🔍 בדוק חוקים
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="logs" className="space-y-4">
          {logs.slice(0, 50).map((log) => (
            <Card key={log.id} className={log.status === 'completed' ? 'border-green-200' : 'border-red-200'}>
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  {log.status === 'completed' ? (
                    <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                  ) : (
                    <XCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
                  )}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-semibold">{log.metadata?.rule_name}</h4>
                      <Badge variant={log.status === 'completed' ? 'success' : 'destructive'}>
                        {log.status === 'completed' ? 'הצליח' : 'נכשל'}
                      </Badge>
                    </div>
                    <p className="text-sm text-slate-600 mb-2">
                      📧 {log.metadata?.mail_subject}
                    </p>
                    <p className="text-xs text-slate-500">
                      {format(new Date(log.created_at), 'dd/MM/yyyy HH:mm:ss', { locale: he })}
                    </p>
                    
                    {log.metadata?.actions_summary && (
                      <div className="mt-3 bg-slate-50 p-3 rounded text-sm">
                        <p className="font-medium mb-1">פעולות:</p>
                        <ul className="space-y-1">
                          {log.metadata.actions_summary.map((action, idx) => (
                            <li key={idx}>
                              {action.status === 'success' ? '✅' : '❌'} {action.action}
                              {action.note && ` - ${action.note}`}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {log.metadata?.error_message && (
                      <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                        <p className="font-medium">שגיאה:</p>
                        <p>{log.metadata.error_message}</p>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>

      {/* תיבת דיאלוג לבדיקת התאמת חוק למיילים */}
      {selectedRule && (
        <Card className="mt-6 border-2 border-blue-500">
          <CardHeader>
            <CardTitle>🧪 בדיקת התאמה: {selectedRule.name}</CardTitle>
            <Button
              size="sm"
              variant="ghost"
              className="absolute top-4 left-4"
              onClick={() => setSelectedRule(null)}
            >
              ✕ סגור
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {allMails.slice(0, 10).map((mail) => {
                const result = testRuleMatch(selectedRule, mail);
                return (
                  <div
                    key={mail.id}
                    className={`p-4 border rounded ${
                      result.isMatch ? 'border-green-500 bg-green-50' : 'border-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      {result.isMatch ? (
                        <CheckCircle2 className="w-5 h-5 text-green-600" />
                      ) : (
                        <XCircle className="w-5 h-5 text-gray-400" />
                      )}
                      <h4 className="font-semibold">{mail.subject || '(ללא נושא)'}</h4>
                    </div>
                    <p className="text-sm text-slate-600 mb-2">
                      {mail.sender_email} • {format(new Date(mail.received_at), 'dd/MM HH:mm', { locale: he })}
                    </p>
                    <div className="text-sm space-y-1">
                      {result.matches.map((match, idx) => (
                        <p key={idx} className="text-green-700">{match}</p>
                      ))}
                      {result.failures.map((failure, idx) => (
                        <p key={idx} className="text-gray-600">{failure}</p>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* תיבת דיאלוג לבדיקת חוקים למייל */}
      {selectedMail && (
        <Card className="mt-6 border-2 border-blue-500">
          <CardHeader>
            <CardTitle>🔍 בדיקת חוקים למייל: {selectedMail.subject}</CardTitle>
            <Button
              size="sm"
              variant="ghost"
              className="absolute top-4 left-4"
              onClick={() => setSelectedMail(null)}
            >
              ✕ סגור
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {rules.map((rule) => {
                const result = testRuleMatch(rule, selectedMail);
                return (
                  <div
                    key={rule.id}
                    className={`p-4 border rounded ${
                      result.isMatch ? 'border-green-500 bg-green-50' : 'border-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      {result.isMatch ? (
                        <CheckCircle2 className="w-5 h-5 text-green-600" />
                      ) : (
                        <XCircle className="w-5 h-5 text-gray-400" />
                      )}
                      <h4 className="font-semibold">{rule.name}</h4>
                      {!rule.is_active && (
                        <Badge variant="outline" className="text-xs">לא פעיל</Badge>
                      )}
                    </div>
                    <div className="text-sm space-y-1">
                      {result.matches.map((match, idx) => (
                        <p key={idx} className="text-green-700">{match}</p>
                      ))}
                      {result.failures.map((failure, idx) => (
                        <p key={idx} className="text-gray-600">{failure}</p>
                      ))}
                      {!rule.is_active && (
                        <p className="text-amber-600 mt-2">⚠️ החוק לא פעיל - לא ירוץ!</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
