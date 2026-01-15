import React, { useState } from 'react';
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
  const pageSize = 50;

  // ✅ שליפת נתונים - גרסה מתוקנת
  const { data, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ['mails', activeTab, page],
    queryFn: async () => {
      try {
        // שליפת כל המיילים (Base44 SDK תקני)
        const allMails = await base44.entities.Mail.list('-received_at', 1000);
        
        // המרה למערך
        const mailsArray = Array.isArray(allMails) ? allMails : (allMails.data || []);
        
        // סינון לפי סטטוס
        const statusMap = {
          'inbox': 'pending',
          'processed': 'processed',
          'archived': 'archived'
        };
        
        const filteredMails = mailsArray.filter(
          mail => mail.processing_status === statusMap[activeTab]
        );
        
        // Pagination בצד קליינט
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

  // ✅ פעולת סנכרון - גרסה מתוקנת
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
      
      {/* כפתורי פעולה */}
      <div className="flex justify-end gap-2 p-2 bg-slate-50 dark:bg-slate-900 rounded-md border">
        <Button 
          className="bg-blue-600 hover:bg-blue-700 text-white" 
          size="sm" 
          onClick={() => syncMutation.mutate()} 
          disabled={syncMutation.isPending}
        >
          {syncMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin ml-2"/> : <Download className="w-4 h-4 ml-2"/>}
          סנכרן מ-Gmail
        </Button>
        
        <Button 
          variant="outline" 
          size="sm" 
          onClick={handleRefresh}
          disabled={isLoading || isRefetching}
        >
          {(isLoading || isRefetching) ? <Loader2 className="w-4 h-4 ml-2 animate-spin" /> : <RefreshCw className="w-4 h-4 ml-2" />}
          רענן טבלה
        </Button>
      </div>

      {/* סטטיסטיקה */}
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
