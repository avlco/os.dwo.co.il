import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { base44 } from '../api/base44Client';
import { PageHeader } from "../components/ui/PageHeader";
import { DataTable } from "../components/ui/DataTable";
import { Button } from "../components/ui/button";
import { Mail, RefreshCw, CheckCircle, Clock, Download, Loader2 } from 'lucide-react';
import { createPageUrl } from '../utils';
import { useNavigate } from 'react-router-dom';
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
      setTimeout(() => refetch(), 500);
    },
    onError: (err) => {
      console.error("[MailRoom] Sync failed:", err);
      toast({ 
        variant: "destructive", 
        title: "שגיאת סנכרון", 
        description: err.message || "אנא וודא שהמערכת מחוברת לגוגל בהגדרות."
      });
    }
  });

  useEffect(() => {
    const lastSync = localStorage.getItem('lastMailSync');
    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000;
    
    if (!lastSync || (now - parseInt(lastSync)) > fiveMinutes) {
      console.log('[MailRoom] Initial auto-sync on page load');
      syncMutation.mutate();
      localStorage.setItem('lastMailSync', now.toString());
    } else {
      console.log('[MailRoom] Skipping sync - last sync was recent');
      const elapsed = now - parseInt(lastSync);
      const remaining = Math.ceil((fiveMinutes - elapsed) / 1000);
      setNextSyncIn(remaining);
      
      const lastSyncDate = new Date(parseInt(lastSync));
      setLastSyncTime(lastSyncDate);
    }

    const syncInterval = setInterval(() => {
      console.log('[MailRoom] Auto-syncing from Gmail...');
      syncMutation.mutate();
      localStorage.setItem('lastMailSync', Date.now().toString());
    }, fiveMinutes);

    return () => clearInterval(syncInterval);
  }, []);

  useEffect(() => {
    const countdown = setInterval(() => {
      setNextSyncIn(prev => {
        if (prev <= 1) return 300;
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(countdown);
  }, []);

  const formatCountdown = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const columns = [
    {
      accessorKey: "received_at",
      header: "תאריך קבלה",
      cell: ({ row }) => {
        const date = row.getValue("received_at");
        return date ? format(new Date(date), 'dd/MM/yyyy HH:mm', { locale: he }) : '-';
      },
    },
    { accessorKey: "sender_email", header: "שולח" },
    { 
      accessorKey: "subject", 
      header: "נושא", 
      cell: ({ row }) => <span className="font-medium">{row.getValue("subject")}</span> 
    },
    {
      accessorKey: "processing_status",
      header: "סטטוס",
      cell: ({ row }) => {
        const status = row.getValue("processing_status");
        const colors = { 
          pending: "bg-blue-100 text-blue-800", 
          processed: "bg-green-100 text-green-800", 
          archived: "bg-gray-100 text-gray-800"
        };
        const labels = { pending: "חדש", processed: "טופל", archived: "בארכיון" };
        return <Badge variant="secondary" className={colors[status] || ""}>{labels[status] || status}</Badge>;
      },
    },
    {
      id: "actions",
      cell: ({ row }) => (
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={(e) => {
            e.stopPropagation();
            navigate(createPageUrl(`MailView?id=${row.original.id}`));
          }}
        >
          צפה
        </Button>
      )
    }
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="חדר דואר" description="ניהול ומיון דואר נכנס." />
      
      <div className="flex justify-between items-center p-4 bg-slate-50 dark:bg-slate-900 rounded-md border">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
            <Clock className="w-4 h-4" />
            <span>
              {syncMutation.isPending ? (
                <span className="text-blue-600 font-medium">מסנכרן...</span>
              ) : (
                <>
                  סנכרון הבא בעוד: <span className="font-mono font-bold">{formatCountdown(nextSyncIn)}</span>
                </>
              )}
            </span>
          </div>
          
          {lastSyncTime && (
            <span className="text-xs text-slate-500">
              סנכרון אחרון: {format(lastSyncTime, 'HH:mm', { locale: he })}
            </span>
          )}
        </div>

        <div className="flex gap-2">
          <Button 
            className="bg-blue-600 hover:bg-blue-700 text-white" 
            size="sm" 
            onClick={() => syncMutation.mutate()} 
            disabled={syncMutation.isPending}
          >
            {syncMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin ml-2"/>
            ) : (
              <Download className="w-4 h-4 ml-2"/>
            )}
            סנכרן עכשיו
          </Button>
          
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleRefresh}
            disabled={isLoading || isRefetching}
          >
            {(isLoading || isRefetching) ? (
              <Loader2 className="w-4 h-4 ml-2 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 ml-2" />
            )}
            רענן טבלה
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="dark:bg-slate-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">דואר נכנס (ממתין)</CardTitle>
            <Mail className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {activeTab === 'inbox' ? (data?.total || 0) : '--'}
            </div>
          </CardContent>
        </Card>
        <Card className="dark:bg-slate-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">טופלו היום</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">--</div></CardContent>
        </Card>
        <Card className="dark:bg-slate-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">זמן טיפול ממוצע</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">--</div></CardContent>
        </Card>
      </div>

      <Tabs defaultValue="inbox" className="w-full" onValueChange={(val) => { setActiveTab(val); setPage(1); }}>
        <TabsList className="grid w-full grid-cols-3 lg:w-[400px]">
          <TabsTrigger value="inbox">דואר נכנס</TabsTrigger>
          <TabsTrigger value="processed">טופל</TabsTrigger>
          <TabsTrigger value="archived">ארכיון</TabsTrigger>
        </TabsList>
        
        {['inbox', 'processed', 'archived'].map(tab => (
          <TabsContent key={tab} value={tab} className="mt-4">
            <Card className="dark:bg-slate-800">
              <CardContent className="p-0">
                <DataTable 
                  columns={columns} 
                  data={data?.data || []} 
                  searchKey="subject"
                  onRowClick={(row) => navigate(createPageUrl(`MailView?id=${row.id}`))}
                  page={page}
                  totalPages={data?.totalPages || 1}
                  onPageChange={setPage}
                  isLoading={isLoading}
                />
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
