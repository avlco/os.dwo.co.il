import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useTranslation } from 'react-i18next';
import { PageHeader } from "../components/ui/PageHeader";
import { Button } from "../components/ui/button";
import { Mail, RefreshCw, CheckCircle, Clock, Loader2, Settings, Activity, Zap, AlertCircle, CheckCircle2, XCircle, Bug, Inbox, Filter, ListChecks } from 'lucide-react';
import { createPageUrl } from '../utils';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { useToast } from "../components/ui/use-toast";
import { format } from 'date-fns';
import { he, enUS } from 'date-fns/locale';
import { Skeleton } from "../components/ui/skeleton";
import MailThreadCard from "../components/mailroom/MailThreadCard";
import AutomationLogCard from "../components/mailroom/AutomationLogCard";

export default function MailRoom() {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'he';
  const dateLocale = isRTL ? he : enUS;
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const [activeTab, setActiveTab] = useState('inbox');
  const [lastSyncTime, setLastSyncTime] = useState(null);
  const [nextSyncIn, setNextSyncIn] = useState(300);

  // שליפת כל המיילים
  const { data: allMails = [], isLoading: isLoadingMails, refetch } = useQuery({
    queryKey: ['allMails'],
    queryFn: async () => {
      const result = await base44.entities.Mail.list('-received_at', 1000);
      return Array.isArray(result) ? result : (result.data || []);
    },
    staleTime: 1000 * 60,
  });

  // שליפת לוגים של אוטומציה
  const { data: automationLogs = [], isLoading: isLoadingLogs } = useQuery({
    queryKey: ['automationLogs'],
    queryFn: async () => {
      const allActivities = await base44.entities.Activity.list('-created_date', 500);
      const logsArray = Array.isArray(allActivities) ? allActivities : (allActivities.data || []);
      return logsArray.filter(a => a.activity_type === 'automation_log');
    },
    staleTime: 1000 * 30,
  });

  // סנכרון מיילים
  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await base44.functions.invoke('processIncomingMail', {});
      if (res.error) throw new Error(res.error.message || "Unknown error");
      if (res.data?.error) throw new Error(res.data.error);
      return res.data;
    },
    onSuccess: (data) => {
      const count = data?.synced || 0;
      toast({ 
        title: t('mail_room.sync_completed', 'Sync Completed'), 
        description: count > 0 ? t('mail_room.new_mails_added', { count }, `${count} new emails added.`) : t('mail_room.no_new_mails', 'No new emails found.') 
      });
      setLastSyncTime(new Date());
      setNextSyncIn(300);
      localStorage.setItem('lastMailSync', Date.now().toString());
      queryClient.invalidateQueries(['allMails']);
      queryClient.invalidateQueries(['automationLogs']);
    },
    onError: (err) => {
      toast({ 
        variant: "destructive", 
        title: t('mail_room.sync_error', 'Sync Error'), 
        description: err.message || t('mail_room.sync_failed', 'Failed to sync emails.') 
      });
    }
  });

  const syncMutationRef = useRef(syncMutation);
  syncMutationRef.current = syncMutation;

  // קיבוץ מיילים לשיחות (Threads)
  const groupMailsToThreads = useMemo(() => {
    const threadsMap = new Map();
    
    allMails.forEach(mail => {
      const threadId = mail.metadata?.thread_id || mail.id;
      
      if (!threadsMap.has(threadId)) {
        threadsMap.set(threadId, {
          threadId,
          mails: [],
          latestMail: mail
        });
      }
      
      const thread = threadsMap.get(threadId);
      thread.mails.push(mail);
      
      // עדכון המייל האחרון בשרשור
      if (new Date(mail.received_at) > new Date(thread.latestMail.received_at)) {
        thread.latestMail = mail;
      }
    });
    
    // מיון לפי תאריך המייל האחרון
    return Array.from(threadsMap.values()).sort(
      (a, b) => new Date(b.latestMail.received_at) - new Date(a.latestMail.received_at)
    );
  }, [allMails]);

  // סינון שיחות לפי לשונית
  const filteredThreads = useMemo(() => {
    switch (activeTab) {
      case 'inbox':
        // דואר נכנס - כל המיילים (תיבת דואר מסורתית)
        return groupMailsToThreads;

      case 'automation':
        // מיילים לאוטומציה - כל מייל בודד שזוהה לאוטומציה (לא קיבוץ לשרשורים)
        const automationMails = allMails.filter(mail => 
          mail.matched_rule_id ||
          ['matched_for_automation', 'awaiting_approval', 'automation_complete', 'automation_failed', 'automation_cancelled'].includes(mail.processing_status)
        );
        // יצירת פורמט דמוי thread עבור כל מייל בודד
        return automationMails.map(mail => ({
          threadId: mail.id,
          mails: [mail],
          latestMail: mail
        }));

      default:
        return groupMailsToThreads;
    }
  }, [groupMailsToThreads, activeTab]);

  // לוגים של אוטומציה מסוננים
  const recentLogs = useMemo(() => {
    return automationLogs.slice(0, 50);
  }, [automationLogs]);

  // סטטיסטיקות
  const stats = useMemo(() => {
    // דואר נכנס = כל המיילים
    const inboxCount = groupMailsToThreads.length;
    // מיילים לאוטומציה = כל מייל בודד שזוהה לאוטומציה (לא קיבוץ לשרשורים)
    const automationCount = allMails.filter(mail => 
      mail.matched_rule_id ||
      ['matched_for_automation', 'awaiting_approval', 'automation_complete', 'automation_failed', 'automation_cancelled'].includes(mail.processing_status)
    ).length;
    const successLogs = automationLogs.filter(l => l.status === 'completed').length;
    const failedLogs = automationLogs.filter(l => l.status === 'failed' || l.status === 'completed_with_errors').length;
    const successRate = automationLogs.length > 0 
      ? ((successLogs / automationLogs.length) * 100).toFixed(0)
      : 0;

    return { inboxCount, automationCount, successLogs, failedLogs, successRate, totalLogs: automationLogs.length };
  }, [groupMailsToThreads, automationLogs]);

  // סנכרון אוטומטי
  useEffect(() => {
    const stored = localStorage.getItem('lastMailSync');
    if (stored) {
      setLastSyncTime(new Date(parseInt(stored)));
      const elapsed = Math.floor((Date.now() - parseInt(stored)) / 1000);
      setNextSyncIn(Math.max(0, 300 - elapsed));
    }

    const interval = setInterval(() => {
      setNextSyncIn((prev) => {
        if (prev <= 1 && !syncMutationRef.current.isPending) {
          syncMutationRef.current.mutate();
          return 300;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleRefresh = async () => {
    await refetch();
    toast({ description: t('mail_room.data_refreshed', 'Data refreshed') });
  };

  const isLoading = isLoadingMails || isLoadingLogs;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('mail_room.title')}
        subtitle={t('mail_room.subtitle')}
        icon={<Mail className="w-6 h-6" />}
      />

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="dark:bg-slate-800 dark:border-slate-700">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium dark:text-slate-200">{t('mail_room.inbox_tab')}</CardTitle>
            <Inbox className="w-4 h-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold dark:text-slate-100">{stats.inboxCount}</div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{t('mail_room.new_conversations')}</p>
          </CardContent>
        </Card>

        <Card className="dark:bg-slate-800 dark:border-slate-700">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium dark:text-slate-200">{t('mail_room.automation_mails_tab')}</CardTitle>
            <Filter className="w-4 h-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold dark:text-slate-100">{stats.automationCount}</div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{t('mail_room.identified_for_processing')}</p>
          </CardContent>
        </Card>

        <Card className="dark:bg-slate-800 dark:border-slate-700">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium dark:text-slate-200">{t('common.success_rate')}</CardTitle>
            <CheckCircle2 className="w-4 h-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.successRate}%</div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{stats.successLogs} {t('mail_room.out_of')} {stats.totalLogs}</p>
          </CardContent>
        </Card>

        <Card className="dark:bg-slate-800 dark:border-slate-700">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium dark:text-slate-200">{t('common.failures')}</CardTitle>
            <AlertCircle className="w-4 h-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600 dark:text-red-400">{stats.failedLogs}</div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{t('common.failed_automations')}</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Card */}
      <Card className="dark:bg-slate-800 dark:border-slate-700">
        <CardContent className="pt-6">
          {/* Action Buttons */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Button
                onClick={() => syncMutation.mutate()}
                disabled={syncMutation.isPending}
                size="sm"
                className="gap-2"
              >
                {syncMutation.isPending ? (
                  <><Loader2 className="w-4 h-4 animate-spin" />{t('common.loading')}</>
                ) : (
                  <><RefreshCw className="w-4 h-4" />{t('common.sync_now')}</>
                )}
              </Button>
              <Button onClick={handleRefresh} size="sm" variant="outline">
                <RefreshCw className="w-4 h-4" />
              </Button>
              <Link to={createPageUrl('ApprovalQueue')}>
                <Button variant="outline" size="sm" className="gap-2">
                  <CheckCircle className="w-4 h-4" />{t('mail_room.approval_queue')}
                </Button>
              </Link>
              <Link to={createPageUrl('AutomationRules')}>
                <Button variant="outline" size="sm" className="gap-2">
                  <Settings className="w-4 h-4" />{t('mail_room.automation_rules')}
                </Button>
              </Link>
              <Link to={createPageUrl('AutomationDebugger')}>
                <Button variant="outline" size="sm" className="gap-2">
                  <Bug className="w-4 h-4" />{t('mail_room.debug')}
                </Button>
              </Link>
            </div>
            
            {/* Sync Timer */}
            <div className="text-sm text-slate-500 dark:text-slate-400 flex items-center gap-2">
              <Clock className="w-4 h-4" />
              {lastSyncTime ? (
                <span>{t('mail_room.last_sync', 'Last sync')}: {format(lastSyncTime, 'HH:mm', { locale: dateLocale })}</span>
              ) : (
                <span>{t('common.not_synced_yet')}</span>
              )}
              <span className="text-slate-400">|</span>
              <span className="font-medium">{t('common.next_in')} {formatTime(nextSyncIn)}</span>
            </div>
          </div>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-3 bg-slate-100 dark:bg-slate-900 border dark:border-slate-700">
              <TabsTrigger value="inbox" className="gap-2 dark:text-slate-300 dark:data-[state=active]:bg-slate-700 dark:data-[state=active]:text-slate-100">
                <Inbox className="w-4 h-4" />
                {t('mail_room.inbox_tab')} ({stats.inboxCount})
              </TabsTrigger>
              <TabsTrigger value="automation" className="gap-2 dark:text-slate-300 dark:data-[state=active]:bg-slate-700 dark:data-[state=active]:text-slate-100">
                <Filter className="w-4 h-4" />
                {t('mail_room.automation_mails_tab')} ({stats.automationCount})
              </TabsTrigger>
              <TabsTrigger value="logs" className="gap-2 dark:text-slate-300 dark:data-[state=active]:bg-slate-700 dark:data-[state=active]:text-slate-100">
                <ListChecks className="w-4 h-4" />
                {t('mail_room.automation_log_tab')} ({stats.totalLogs})
              </TabsTrigger>
            </TabsList>

            {/* Inbox Content */}
            <TabsContent value="inbox" className="mt-4">
              {isLoading ? (
                <div className="space-y-3">
                  {[1,2,3].map(i => <Skeleton key={i} className="h-24 w-full" />)}
                </div>
              ) : filteredThreads.length === 0 ? (
                <div className="text-center py-12 text-slate-500 dark:text-slate-400">
                  <Inbox className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>{t('mail_room.no_emails')}</p>
                  <p className="text-sm mt-2">{t('mail_room.all_processed_hint', 'All emails have been processed or are in other tabs')}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredThreads.map(thread => (
                    <MailThreadCard 
                      key={thread.threadId} 
                      thread={thread}
                      automationLogs={automationLogs}
                    />
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Automation Mails Content */}
            <TabsContent value="automation" className="mt-4">
              {isLoading ? (
                <div className="space-y-3">
                  {[1,2,3].map(i => <Skeleton key={i} className="h-24 w-full" />)}
                </div>
              ) : filteredThreads.length === 0 ? (
                <div className="text-center py-12 text-slate-500 dark:text-slate-400">
                  <Filter className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>{t('mail_room.no_automation_mails', 'No emails identified for automation')}</p>
                  <p className="text-sm mt-2">{t('mail_room.automation_mails_hint', 'Emails matching automation rules will appear here')}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredThreads.map(thread => (
                    <MailThreadCard 
                      key={thread.threadId} 
                      thread={thread}
                      automationLogs={automationLogs}
                    />
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Automation Log Content */}
            <TabsContent value="logs" className="mt-4">
              {isLoadingLogs ? (
                <div className="space-y-3">
                  {[1,2,3].map(i => <Skeleton key={i} className="h-32 w-full" />)}
                </div>
              ) : recentLogs.length === 0 ? (
                <div className="text-center py-12 text-slate-500 dark:text-slate-400">
                  <Activity className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>{t('approval_queue.no_automation_activity')}</p>
                  <p className="text-sm mt-2">{t('mail_room.automation_log_hint', 'When automation rules run, activity will be displayed here')}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {recentLogs.map(log => (
                    <AutomationLogCard 
                      key={log.id} 
                      log={log}
                    />
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}