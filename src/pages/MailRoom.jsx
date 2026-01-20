import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { base44 } from '../api/base44Client';
import { PageHeader } from "../components/ui/PageHeader";
import { DataTable } from "../components/ui/DataTable";
import { Button } from "../components/ui/button";
import { Mail, RefreshCw, CheckCircle, Clock, Download, Loader2, Settings, Activity, Zap, AlertCircle, CheckCircle2, XCircle } from 'lucide-react';
import { createPageUrl } from '../utils';
import { useNavigate, Link } from 'react-router-dom';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import { Badge } from "../components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { useToast } from "../components/ui/use-toast";

export default function MailRoom() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [page, setPage] = useState(1);
  const [activeTab, setActiveTab] = useState('inbox');
  const [lastSyncTime, setLastSyncTime] = useState(null);
  const [nextSyncIn, setNextSyncIn] = useState(300);
  const pageSize = 50;

  const { data, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ['mails', activeTab, page],
    queryFn: async () => {
      try {
        const allMails = await base44.entities.Mail.list('-received_at', 1000);
        const mailsArray = Array.isArray(allMails) ? allMails : (allMails.data || []);
        
        const statusMap = {
          'inbox': 'pending',
          'processed': 'processed',
          'archived': 'archived'
        };
        
        const filteredMails = mailsArray.filter(
          mail => mail.processing_status === statusMap[activeTab]
        );
        
        const startIndex = (page - 1) * pageSize;
        const endIndex = startIndex + pageSize;
        const paginatedMails = filteredMails.slice(startIndex, endIndex);
        
        return {
          data: paginatedMails,
          total: filteredMails.length,
          totalPages: Math.ceil(filteredMails.length / pageSize)
        };
      } catch (error) {
        console.error('[MailRoom] Failed to fetch mails:', error);
        toast({ 
          variant: "destructive", 
          title: "שגיאה בשליפת מיילים", 
          description: error.message 
        });
        return { data: [], total: 0, totalPages: 0 };
      }
    },
    placeholderData: keepPreviousData,
    staleTime: 1000 * 60 * 1,
  });

  const { data: automationLogs = [] } = useQuery({
    queryKey: ['automationLogs'],
    queryFn: async () => {
      try {
        const allActivities = await base44.entities.Activity.list('-created_at', 500);
        const logsArray = Array.isArray(allActivities) ? allActivities : (allActivities.data || []);
        return logsArray.filter(a => a.activity_type === 'automation_log');
      } catch (error) {
        console.error('[MailRoom] Failed to fetch automation logs:', error);
        return [];
      }
    },
    staleTime: 1000 * 30,
  });

  const { data: allTasks = [] } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => base44.entities.Task.list('-created_date', 200),
  });

  const handleRefresh = async () => {
    await refetch();
    toast({ description: "הטבלה רועננה בהצלחה" });
  };

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await base44.functions.invoke('processIncomingMail', {});
      
      if (res.error) throw new Error(res.error.message || "Unknown error");
      if (res.data && res.data.error) throw new Error(res.data.error);
      
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
      
      queryClient.invalidateQueries(['mails']);
      queryClient.invalidateQueries(['automationLogs']);
      setTimeout(() => refetch(), 500);
    },
    onError: (err) => {
      console.error("[MailRoom] Sync failed:", err);
      toast({ 
        variant: "destructive", 
        title: "שגיאת סנכרון", 
        description: err.message || "נכשל בסנכרון מיילים. נסה שוב." 
      });
    }
  });

  // Ref לגישה ל-mutation בתוך useEffect
  const syncMutationRef = useRef(syncMutation);
  syncMutationRef.current = syncMutation;

  const getMailAutomationStatus = (mailId) => {
    const mailLogs = automationLogs.filter(log => log.metadata?.mail_id === mailId);
    
    if (mailLogs.length === 0) return null;
    
    const successCount = mailLogs.filter(log => log.status === 'completed').length;
    const failedCount = mailLogs.filter(log => log.status === 'failed').length;
    
    return {
      total: mailLogs.length,
      success: successCount,
      failed: failedCount,
      logs: mailLogs
    };
  };

  const getMailTasks = (mailId) => {
    return allTasks.filter(task => task.mail_id === mailId);
  };

  const columns = [
    {
      header: 'נושא',
      accessorKey: 'subject',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Link
            to={createPageUrl('MailView', { id: row.original.id })}
            className="text-blue-600 hover:underline font-medium"
          >
            {row.original.subject || '(ללא נושא)'}
          </Link>
          {row.original.has_attachments && (
            <Badge variant="outline" className="text-xs">
              📎 {row.original.attachments?.length || 0}
            </Badge>
          )}
        </div>
      ),
    },
    {
      header: 'שולח',
      accessorKey: 'sender_email',
      cell: ({ row }) => (
        <span className="text-sm text-slate-600">{row.original.sender_email}</span>
      ),
    },
    {
      header: 'תאריך',
      accessorKey: 'received_at',
      cell: ({ row }) => {
        const date = new Date(row.original.received_at);
        return (
          <span className="text-sm text-slate-500">
            {format(date, 'dd/MM/yyyy HH:mm', { locale: he })}
          </span>
        );
      },
    },
    {
      header: 'אוטומציה',
      accessorKey: 'automation_status',
      cell: ({ row }) => {
        const status = getMailAutomationStatus(row.original.id);
        const tasks = getMailTasks(row.original.id);
        
        if (!status) {
          return <Badge variant="outline" className="text-xs">לא רץ</Badge>;
        }
        
        return (
          <div className="flex items-center gap-2">
            {status.success > 0 && (
              <Badge variant="success" className="text-xs flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                {status.success}
              </Badge>
            )}
            {status.failed > 0 && (
              <Badge variant="destructive" className="text-xs flex items-center gap-1">
                <XCircle className="w-3 h-3" />
                {status.failed}
              </Badge>
            )}
            {tasks.length > 0 && (
              <Badge variant="outline" className="text-xs">
                📋 {tasks.length}
              </Badge>
            )}
          </div>
        );
      },
    },
    {
      header: 'סטטוס',
      accessorKey: 'processing_status',
      cell: ({ row }) => {
        const statusConfig = {
          pending: { label: 'ממתין', color: 'bg-yellow-100 text-yellow-800' },
          processed: { label: 'עובד', color: 'bg-green-100 text-green-800' },
          archived: { label: 'בארכיון', color: 'bg-gray-100 text-gray-800' }
        };
        const config = statusConfig[row.original.processing_status] || statusConfig.pending;
        return <Badge className={config.color}>{config.label}</Badge>;
      },
    },
  ];

  const automationStats = {
    total: automationLogs.length,
    success: automationLogs.filter(l => l.status === 'completed').length,
    failed: automationLogs.filter(l => l.status === 'failed').length,
    successRate: automationLogs.length > 0 
      ? ((automationLogs.filter(l => l.status === 'completed').length / automationLogs.length) * 100).toFixed(0)
      : 0
  };

  const mails = data?.data || [];
  const totalPages = data?.totalPages || 0;

  // תיקון: סנכרון אוטומטי כל 5 דקות
  useEffect(() => {
    const stored = localStorage.getItem('lastMailSync');
    if (stored) {
      const lastSync = new Date(parseInt(stored));
      setLastSyncTime(lastSync);
      
      const elapsed = Math.floor((Date.now() - lastSync.getTime()) / 1000);
      const remaining = Math.max(0, 300 - elapsed);
      setNextSyncIn(remaining);
    }

    const interval = setInterval(() => {
      setNextSyncIn((prev) => {
        // כשמגיעים ל-0, מפעילים סנכרון ומאפסים
        if (prev <= 1) {
          // בדיקה שלא כבר בסנכרון
          if (!syncMutationRef.current.isPending) {
            console.log('[MailRoom] ⏰ Auto-sync triggered');
            syncMutationRef.current.mutate();
          }
          return 300; // איפוס ל-5 דקות
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="תיבת דואר נכנס"
        subtitle="ניהול ועיבוד מיילים אוטומטי"
        icon={<Mail className="w-6 h-6" />}
      />

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">מיילים פעילים</CardTitle>
            <Mail className="w-4 h-4 text-slate-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.total || 0}</div>
            <p className="text-xs text-slate-500 mt-1">סה״כ {activeTab === 'inbox' ? 'ממתינים' : activeTab === 'processed' ? 'מעובדים' : 'בארכיון'}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">אוטומציות רצו</CardTitle>
            <Zap className="w-4 h-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{automationStats.total}</div>
            <p className="text-xs text-slate-500 mt-1">חוקים שהופעלו</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">אחוז הצלחה</CardTitle>
            <CheckCircle2 className="w-4 h-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{automationStats.successRate}%</div>
            <p className="text-xs text-slate-500 mt-1">{automationStats.success} מתוך {automationStats.total}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">כישלונות</CardTitle>
            <AlertCircle className="w-4 h-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{automationStats.failed}</div>
            <p className="text-xs text-slate-500 mt-1">חוקים שנכשלו</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <Button
                onClick={() => syncMutation.mutate()}
                disabled={syncMutation.isPending}
                size="sm"
                className="flex items-center gap-2"
              >
                {syncMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    מסנכרן...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4" />
                    סנכרן עכשיו
                  </>
                )}
              </Button>
              <Button onClick={handleRefresh} size="sm" variant="outline">
                <RefreshCw className="w-4 h-4" />
              </Button>
              <Link to={createPageUrl('ApprovalQueue')}>
                <Button variant="outline" size="sm" className="gap-2">
                  <CheckCircle className="w-4 h-4" />
                  תור אישורים
                </Button>
              </Link>
              <Link to={createPageUrl('AutomationRules')}>
                <Button variant="outline" size="sm" className="gap-2">
                  <Settings className="w-4 h-4" />
                  חוקי אוטומציה
                </Button>
              </Link>
            </div>
            
            {lastSyncTime && (
              <div className="text-sm text-slate-500 flex items-center gap-2">
                <Clock className="w-4 h-4" />
                <span>סנכרון אחרון: {format(lastSyncTime, 'HH:mm', { locale: he })}</span>
                <span className="text-slate-400">|</span>
                <span>הבא בעוד: {formatTime(nextSyncIn)}</span>
              </div>
            )}
          </div>

          <Tabs value={activeTab} onValueChange={(val) => { setActiveTab(val); setPage(1); }}>
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="inbox">
                📥 ממתינים ({mails.length})
              </TabsTrigger>
              <TabsTrigger value="processed">
                ✅ מעובדים
              </TabsTrigger>
              <TabsTrigger value="archived">
                📦 ארכיון
              </TabsTrigger>
              <TabsTrigger value="automation">
                ⚡ פעילות אוטומציה
              </TabsTrigger>
            </TabsList>

            <TabsContent value="inbox">
              <DataTable
                columns={columns}
                data={mails}
                isLoading={isLoading}
                page={page}
                totalPages={totalPages}
                onPageChange={setPage}
              />
            </TabsContent>

            <TabsContent value="processed">
              <DataTable
                columns={columns}
                data={mails}
                isLoading={isLoading}
                page={page}
                totalPages={totalPages}
                onPageChange={setPage}
              />
            </TabsContent>

            <TabsContent value="archived">
              <DataTable
                columns={columns}
                data={mails}
                isLoading={isLoading}
                page={page}
                totalPages={totalPages}
                onPageChange={setPage}
              />
            </TabsContent>

            <TabsContent value="automation">
              <div className="space-y-4">
                {automationLogs.length === 0 ? (
                  <div className="text-center py-12 text-slate-500">
                    <Activity className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>אין פעילות אוטומציה עדיין</p>
                    <p className="text-sm mt-2">כאשר חוקי אוטומציה ירוצו, הפעילות תוצג כאן</p>
                  </div>
                ) : (
                  automationLogs.slice(0, 50).map((log) => {
                    const isSuccess = log.status === 'completed';
                    const metadata = log.metadata || {};
                    
                    return (
                      <Card key={log.id} className={isSuccess ? 'border-green-200' : 'border-red-200'}>
                        <CardContent className="pt-6">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-2">
                                {isSuccess ? (
                                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                                ) : (
                                  <XCircle className="w-5 h-5 text-red-600" />
                                )}
                                <h3 className="font-semibold">{metadata.rule_name || 'חוק לא ידוע'}</h3>
                                <Badge variant={isSuccess ? 'success' : 'destructive'}>
                                  {isSuccess ? 'הצליח' : 'נכשל'}
                                </Badge>
                              </div>
                              
                              <Link 
                                to={createPageUrl('MailView', { id: metadata.mail_id })}
                                className="text-sm text-blue-600 hover:underline mb-3 block"
                              >
                                📧 {metadata.mail_subject || 'ללא נושא'}
                              </Link>
                              
                              {metadata.actions_summary && (
                                <div className="text-sm text-slate-500 space-y-1">
                                  <p className="font-medium">פעולות שבוצעו:</p>
                                  <ul className="list-disc list-inside mr-4">
                                    {metadata.actions_summary.map((action, idx) => (
                                      <li key={idx}>
                                        {action.action}: {action.status === 'success' ? '✅' : '❌'} 
                                        {action.note && ` - ${action.note}`}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              
                              {!isSuccess && metadata.error_message && (
                                <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                                  <p className="font-medium">שגיאה:</p>
                                  <p>{metadata.error_message}</p>
                                </div>
                              )}
                            </div>
                            
                            <div className="text-right text-sm text-slate-500">
                              <p>{format(new Date(log.created_at), 'dd/MM/yyyy', { locale: he })}</p>
                              <p>{format(new Date(log.created_at), 'HH:mm:ss', { locale: he })}</p>
                              {metadata.execution_time_ms && (
                                <p className="mt-1 text-xs">⏱️ {metadata.execution_time_ms}ms</p>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })
                )}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
