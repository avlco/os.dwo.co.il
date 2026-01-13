import React, { useState } from 'react';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { PageHeader } from "@/components/ui/PageHeader";
import { DataTable } from "@/components/ui/DataTable";
import { Button } from "@/components/ui/button";
import { Mail, RefreshCw, CheckCircle, Clock } from 'lucide-react';
import { createPageUrl } from '../utils';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

export default function MailRoom() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  
  const [page, setPage] = useState(1);
  const [activeTab, setActiveTab] = useState('inbox');
  const pageSize = 50;

  const { data: mails = [], isLoading } = useQuery({
    queryKey: ['mails', activeTab, page],
    queryFn: async () => {
      let filter = {};
      if (activeTab === 'inbox') filter = { processing_status: 'pending' };
      else if (activeTab === 'processed') filter = { processing_status: 'processed' };
      else if (activeTab === 'archived') filter = { processing_status: 'archived' };

      // Use correct API syntax: filter(query, sort, limit)
      return await base44.entities.Mail.filter(filter, '-received_at', pageSize);
    },
    placeholderData: keepPreviousData 
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
    { accessorKey: "subject", header: "נושא", cell: ({ row }) => <span className="font-medium">{row.getValue("subject")}</span> },
    {
      accessorKey: "processing_status",
      header: "סטטוס",
      cell: ({ row }) => {
        const status = row.getValue("processing_status");
        const colors = { 
          pending: "bg-blue-100 text-blue-800", 
          processing: "bg-yellow-100 text-yellow-800",
          triaged: "bg-purple-100 text-purple-800",
          processed: "bg-green-100 text-green-800", 
          archived: "bg-gray-100 text-gray-800",
          error: "bg-red-100 text-red-800"
        };
        const labels = { 
          pending: "ממתין", 
          processing: "בעיבוד",
          triaged: "מוין",
          processed: "טופל", 
          archived: "בארכיון",
          error: "שגיאה"
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
          <Button variant="outline" size="sm" onClick={() => queryClient.invalidateQueries(['mails'])}>
            <RefreshCw className="w-4 h-4 mr-2" /> רענן
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
                  data={mails || []} 
                  searchKey="subject"
                  onRowClick={(row) => navigate(createPageUrl(`MailView?id=${row.id}`))}
                  page={page}
                  totalPages={1}
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