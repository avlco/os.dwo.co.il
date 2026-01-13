import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { PageHeader } from "@/components/ui/PageHeader";
import { DataTable } from "@/components/ui/DataTable";
import { Button } from "@/components/ui/button";
import { Mail, RefreshCw, CheckCircle, Clock, CloudDownload, Loader2 } from 'lucide-react';
import { createPageUrl } from '../utils';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";

export default function MailRoom() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [page, setPage] = useState(1);
  const [activeTab, setActiveTab] = useState('inbox');
  const pageSize = 50;

  // 1. Fetch Mails Logic
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['mails', activeTab, page],
    queryFn: async () => {
      let filter = {};
      
      // Filter mapping
      if (activeTab === 'inbox') filter = { processing_status: 'pending' };
      else if (activeTab === 'processed') filter = { processing_status: 'processed' };
      else if (activeTab === 'archived') filter = { processing_status: 'archived' };

      // API Call
      return await base44.entities.Mail.list({
        ...filter,
        page: page,
        limit: pageSize,
        sort: { received_at: -1 } // Sort by received date desc
      });
    },
    placeholderData: keepPreviousData
  });

  // 2. Sync Logic (Manual Trigger)
  const syncMutation = useMutation({
    mutationFn: async () => {
        // Calls the new backend function we created
        return await base44.functions.invoke('processIncomingMail', {});
    },
    onSuccess: (res) => {
        const count = res.synced || 0;
        const total = res.total_fetched || 0;
        
        let msg = "הסנכרון הושלם.";
        if (count > 0) msg = `נוספו ${count} מיילים חדשים למערכת.`;
        else if (total > 0) msg = "לא נמצאו מיילים חדשים (כל המיילים כבר במערכת).";
        else msg = "תיבת הדואר הנכנס ריקה.";

        toast({ title: "סנכרון מ-Gmail", description: msg });
        
        // Refresh the table data immediately
        queryClient.invalidateQueries(['mails']);
        setTimeout(() => refetch(), 500); 
    },
    onError: (err) => {
        console.error("Sync failed:", err);
        toast({ 
            variant: "destructive", 
            title: "שגיאת סנכרון", 
            description: "ודא שחיברת חשבון Google בהגדרות. " + (err.message || "")
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
        const labels = { 
            pending: "חדש", 
            processed: "טופל", 
            archived: "בארכיון"
        };
        return <Badge variant="secondary" className={colors[status] || ""}>{labels[status] || status}</Badge>;
      },
    },
    {
        id: "actions",
        cell: ({ row }) => <Button variant="ghost" size="sm" onClick={() => navigate(createPageUrl(`MailView?id=${row.original.id}`))}>צפה</Button>
    }
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="חדר דואר" description="ניהול ומיון דואר נכנס, סריקת מסמכים וניתוב לתיקים.">
        <div className="flex gap-2">
          {/* SYNC BUTTON */}
          <Button variant="default" size="sm" onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
            {syncMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin ml-2"/> : <CloudDownload className="w-4 h-4 ml-2"/>}
            סנכרן מ-Gmail
          </Button>
          
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 ml-2" /> רענן
          </Button>
        </div>
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="dark:bg-slate-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">דואר נכנס (חדש)</CardTitle>
            <Mail className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">--</div></CardContent>
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
