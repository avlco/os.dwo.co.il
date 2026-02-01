import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { PageHeader } from "../components/ui/PageHeader";
import { Button } from "../components/ui/button";
import { Mail, RefreshCw, CheckCircle, Clock, Loader2, Settings, Activity, Zap, AlertCircle, CheckCircle2, XCircle, Bug, Inbox, Filter, ListChecks } from 'lucide-react';
import { createPageUrl } from '../utils';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { useToast } from "../components/ui/use-toast";
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import { Skeleton } from "../components/ui/skeleton";
import MailThreadCard from "../components/mailroom/MailThreadCard";
import AutomationLogCard from "../components/mailroom/AutomationLogCard";

export default function MailRoom() {
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
        title: "סנכרון הושלם", 
        description: count > 0 ? `נוספו ${count} מיילים חדשים.` : "לא נמצאו מיילים חדשים." 
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
        title: "שגיאת סנכרון", 
        description: err.message || "נכשל בסנכרון מיילים." 
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
        // מיילים לאוטומציה - רק מיילים שזוהו ע"י חוקי אוטומציה (לא כולל משימות ידניות)
        return groupMailsToThreads.filter(thread => 
          thread.latestMail.matched_rule_id ||
          ['matched_for_automation', 'awaiting_approval', 'automation_complete', 'automation_failed'].includes(thread.latestMail.processing_status)
        );

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
    // מיילים לאוטומציה = רק מיילים שזוהו ע"י חוקי אוטומציה (לא כולל משימות ידניות)
    const automationCount = groupMailsToThreads.filter(t => 
      t.latestMail.matched_rule_id ||
      ['matched_for_automation', 'awaiting_approval', 'automation_complete', 'automation_failed'].includes(t.latestMail.processing_status)
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
    toast({ description: "הנתונים רועננו" });
  };

  const isLoading = isLoadingMails || isLoadingLogs;

  return (
    <div className="space-y-6">
      <PageHeader
        title="חדר דואר"
        subtitle="ניהול ועיבוד מיילים אוטומטי"
        icon={<Mail className="w-6 h-6" />}
      />

      {/* כרטיסי סטטיסטיקות */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">דואר נכנס</CardTitle>
            <Inbox className="w-4 h-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.inboxCount}</div>
            <p className="text-xs text-slate-500 mt-1">שיחות חדשות</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">מיילים לאוטומציה</CardTitle>
            <Filter className="w-4 h-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.automationCount}</div>
            <p className="text-xs text-slate-500 mt-1">זוהו לעיבוד</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">אחוז הצלחה</CardTitle>
            <CheckCircle2 className="w-4 h-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.successRate}%</div>
            <p className="text-xs text-slate-500 mt-1">{stats.successLogs} מתוך {stats.totalLogs}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">כישלונות</CardTitle>
            <AlertCircle className="w-4 h-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.failedLogs}</div>
            <p className="text-xs text-slate-500 mt-1">אוטומציות שנכשלו</p>
          </CardContent>
        </Card>
      </div>

      {/* כרטיס ראשי */}
      <Card>
        <CardContent className="pt-6">
          {/* כפתורי פעולה */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Button
                onClick={() => syncMutation.mutate()}
                disabled={syncMutation.isPending}
                size="sm"
                className="gap-2"
              >
                {syncMutation.isPending ? (
                  <><Loader2 className="w-4 h-4 animate-spin" />מסנכרן...</>
                ) : (
                  <><RefreshCw className="w-4 h-4" />סנכרן עכשיו</>
                )}
              </Button>
              <Button onClick={handleRefresh} size="sm" variant="outline">
                <RefreshCw className="w-4 h-4" />
              </Button>
              <Link to={createPageUrl('ApprovalQueue')}>
                <Button variant="outline" size="sm" className="gap-2">
                  <CheckCircle className="w-4 h-4" />תור אישורים
                </Button>
              </Link>
              <Link to={createPageUrl('AutomationRules')}>
                <Button variant="outline" size="sm" className="gap-2">
                  <Settings className="w-4 h-4" />חוקי אוטומציה
                </Button>
              </Link>
              <Link to={createPageUrl('AutomationDebugger')}>
                <Button variant="outline" size="sm" className="gap-2">
                  <Bug className="w-4 h-4" />דיבאג
                </Button>
              </Link>
            </div>
            
            {/* טיימר סנכרון */}
            <div className="text-sm text-slate-500 flex items-center gap-2">
              <Clock className="w-4 h-4" />
              {lastSyncTime ? (
                <span>סנכרון אחרון: {format(lastSyncTime, 'HH:mm', { locale: he })}</span>
              ) : (
                <span>טרם בוצע סנכרון</span>
              )}
              <span className="text-slate-400">|</span>
              <span className="font-medium">הבא בעוד: {formatTime(nextSyncIn)}</span>
            </div>
          </div>

          {/* לשוניות */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="inbox" className="gap-2">
                <Inbox className="w-4 h-4" />
                דואר נכנס ({stats.inboxCount})
              </TabsTrigger>
              <TabsTrigger value="automation" className="gap-2">
                <Filter className="w-4 h-4" />
                מיילים לאוטומציה ({stats.automationCount})
              </TabsTrigger>
              <TabsTrigger value="logs" className="gap-2">
                <ListChecks className="w-4 h-4" />
                יומן אוטומציה ({stats.totalLogs})
              </TabsTrigger>
            </TabsList>

            {/* תוכן: דואר נכנס */}
            <TabsContent value="inbox" className="mt-4">
              {isLoading ? (
                <div className="space-y-3">
                  {[1,2,3].map(i => <Skeleton key={i} className="h-24 w-full" />)}
                </div>
              ) : filteredThreads.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  <Inbox className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>אין מיילים חדשים</p>
                  <p className="text-sm mt-2">כל המיילים עברו עיבוד או נמצאים בלשוניות אחרות</p>
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

            {/* תוכן: מיילים לאוטומציה */}
            <TabsContent value="automation" className="mt-4">
              {isLoading ? (
                <div className="space-y-3">
                  {[1,2,3].map(i => <Skeleton key={i} className="h-24 w-full" />)}
                </div>
              ) : filteredThreads.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  <Filter className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>אין מיילים שזוהו לאוטומציה</p>
                  <p className="text-sm mt-2">מיילים שיענו לחוקי אוטומציה יופיעו כאן</p>
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

            {/* תוכן: יומן אוטומציה */}
            <TabsContent value="logs" className="mt-4">
              {isLoadingLogs ? (
                <div className="space-y-3">
                  {[1,2,3].map(i => <Skeleton key={i} className="h-32 w-full" />)}
                </div>
              ) : recentLogs.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  <Activity className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>אין פעילות אוטומציה עדיין</p>
                  <p className="text-sm mt-2">כאשר חוקי אוטומציה ירוצו, הפעילות תוצג כאן</p>
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