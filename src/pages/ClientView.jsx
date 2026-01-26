import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import StatusBadge from '../components/ui/StatusBadge';
import {
  ArrowRight,
  ArrowLeft,
  Building2,
  Users,
  Mail,
  Phone,
  MapPin,
  Briefcase,
  Receipt,
  Cloud,
  ExternalLink,
  Edit,
  Trash2,
  Plus,
  Loader2,
  FileText,
  Globe
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import DataTable from '../components/ui/DataTable';

// --- רכיב פנימי למסמכי לקוח ---
function ClientDocuments({ clientId }) {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'he';

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['client-tasks-docs', clientId],
    queryFn: () => base44.entities.Task.filter({ client_id: clientId }),
    enabled: !!clientId,
  });

  const dropboxDocuments = [];
  tasks.forEach(task => {
    const executionLog = task.extracted_data?.execution_log || [];
    executionLog.forEach(entry => {
      if (entry.action_type === 'upload_to_dropbox' && entry.status === 'success' && entry.result_url) {
        dropboxDocuments.push({
          id: `${task.id}_${entry.executed_at}`,
          task_title: task.title,
          url: entry.result_url,
          uploaded_at: entry.executed_at,
          filename: entry.details?.filename || 'מסמך',
          destination: entry.details?.destination || ''
        });
      }
    });
  });

  dropboxDocuments.sort((a, b) => new Date(b.uploaded_at) - new Date(a.uploaded_at));

  if (isLoading) return <Loader2 className="w-6 h-6 animate-spin mx-auto my-8 text-slate-400" />;

  if (dropboxDocuments.length === 0) {
    return (
      <div className="text-center py-8 text-slate-500">
        <Cloud className="w-12 h-12 mx-auto mb-3 opacity-20" />
        <p>לא נמצאו מסמכים שנסרקו ל-Dropbox עבור לקוח זה.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {dropboxDocuments.map((doc) => (
        <div key={doc.id} className="flex items-center gap-4 p-4 bg-white dark:bg-slate-800 border dark:border-slate-700 rounded-xl hover:shadow-sm transition-all">
          <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
            <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
               <p className="font-medium text-slate-800 dark:text-slate-200 truncate">{doc.filename}</p>
               <Badge variant="outline" className="text-[10px] h-5">{format(new Date(doc.uploaded_at), 'dd/MM/yyyy')}</Badge>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate dir-ltr text-left">
              {doc.destination}
            </p>
          </div>
          <a href={doc.url} target="_blank" rel="noopener noreferrer">
            <Button variant="ghost" size="icon">
              <ExternalLink className="w-4 h-4 text-slate-400" />
            </Button>
          </a>
        </div>
      ))}
    </div>
  );
}

// --- הדף הראשי ---
export default function ClientView() {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'he';
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const clientId = urlParams.get('id');

  const { data: clientData, isLoading: clientLoading } = useQuery({
    queryKey: ['client', clientId],
    queryFn: () => base44.entities.Client.filter({ id: clientId }),
    enabled: !!clientId,
  });

  const { data: cases = [], isLoading: casesLoading } = useQuery({
    queryKey: ['client-cases', clientId],
    queryFn: () => base44.entities.Case.filter({ client_id: clientId }, '-created_date'),
    enabled: !!clientId,
  });

  const { data: financials = [], isLoading: financialsLoading } = useQuery({
    queryKey: ['client-financials', clientId],
    queryFn: () => base44.entities.Invoice.filter({ client_id: clientId }, '-issued_date'),
    enabled: !!clientId,
  });

  const client = clientData?.[0];
  const BackIcon = isRTL ? ArrowRight : ArrowLeft;

  if (clientLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-1/3" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!client) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Users className="w-16 h-16 text-slate-200 mb-4" />
        <h2 className="text-xl font-semibold text-slate-700">לקוח לא נמצא</h2>
        <Link to={createPageUrl('Clients')}>
          <Button variant="link" className="mt-2">חזרה לרשימת הלקוחות</Button>
        </Link>
      </div>
    );
  }

  // הגדרת עמודות לטבלת תיקים
  const caseColumns = [
    {
      header: 'מספר תיק',
      accessorKey: 'case_number',
      cell: ({ row }) => <span className="font-bold">{row.original.case_number}</span>
    },
    {
      header: 'כותרת',
      accessorKey: 'title',
    },
    {
      header: 'סטטוס',
      accessorKey: 'status',
      cell: ({ row }) => <StatusBadge status={row.original.status} />
    }
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to={createPageUrl('Clients')}>
          <Button variant="ghost" size="icon" className="rounded-xl">
            <BackIcon className="w-5 h-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{client.name}</h1>
            <Badge variant={client.is_active !== false ? "default" : "secondary"}>
              {client.is_active !== false ? 'פעיל' : 'לא פעיל'}
            </Badge>
          </div>
          <div className="flex items-center gap-4 mt-1 text-sm text-slate-500">
            <span className="flex items-center gap-1">
              {client.type === 'company' ? <Building2 className="w-3.5 h-3.5" /> : <Users className="w-3.5 h-3.5" />}
              {client.client_number}
            </span>
            {client.communication_language === 'en' && (
              <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                🇺🇸 English Communication
              </Badge>
            )}
          </div>
        </div>
        <Button variant="outline" onClick={() => navigate(`${createPageUrl('Clients')}?edit=${client.id}`)}>
          <Edit className="w-4 h-4 mr-2" />
          עריכה
        </Button>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Sidebar Info */}
        <div className="space-y-6">
          <Card className="dark:bg-slate-800 dark:border-slate-700">
            <CardHeader><CardTitle className="text-base dark:text-slate-200">פרטי קשר</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {client.email && (
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center"><Mail className="w-4 h-4 text-slate-500 dark:text-slate-400" /></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-slate-400">אימייל</p>
                    <p className="text-sm font-medium truncate dark:text-slate-200" title={client.email}>{client.email}</p>
                  </div>
                </div>
              )}
              {client.phone && (
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center"><Phone className="w-4 h-4 text-slate-500 dark:text-slate-400" /></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-slate-400">טלפון</p>
                    <p className="text-sm font-medium dir-ltr text-right dark:text-slate-200">{client.phone}</p>
                  </div>
                </div>
              )}
              {client.address && (
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center"><MapPin className="w-4 h-4 text-slate-500 dark:text-slate-400" /></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-slate-400">כתובת</p>
                    <p className="text-sm font-medium dark:text-slate-200">{client.address}, {client.country}</p>
                  </div>
                </div>
              )}

              {/* --- תצוגת שפה --- */}
              <div className="flex items-center gap-3 pt-2 border-t border-slate-100 dark:border-slate-700 mt-2">
                <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
                   <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                    {client.communication_language === 'en' ? 'EN' : 'HE'}
                   </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-400">שפת תקשורת</p>
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                    {client.communication_language === 'en' ? 'אנגלית (English)' : 'עברית'}
                  </p>
                </div>
              </div>
              {/* ---------------- */}

            </CardContent>
          </Card>

          <Card className="dark:bg-slate-800 dark:border-slate-700">
            <CardHeader><CardTitle className="text-base dark:text-slate-200">הגדרות חיוב</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-700 pb-2">
                <span className="text-sm text-slate-500 dark:text-slate-400">תעריף שעתי</span>
                <span className="font-bold dark:text-slate-200">{client.hourly_rate ? `₪${client.hourly_rate}` : '-'}</span>
              </div>
              <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-700 pb-2">
                <span className="text-sm text-slate-500 dark:text-slate-400">תנאי תשלום</span>
                <span className="font-medium dark:text-slate-200">{client.payment_terms || 'מיידי'}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-500 dark:text-slate-400">מטבע</span>
                <span className="font-medium dark:text-slate-200">{client.billing_currency || 'ILS'}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs Content */}
        <div className="lg:col-span-2">
          <Tabs defaultValue="cases" className="w-full">
            <TabsList className="w-full justify-start border-b rounded-none h-auto p-0 bg-transparent gap-6">
              <TabsTrigger value="cases" className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:bg-transparent px-2 py-3 dark:data-[state=active]:text-slate-200">
                <Briefcase className="w-4 h-4 mr-2" /> תיקים ({cases.length})
              </TabsTrigger>
              <TabsTrigger value="financials" className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:bg-transparent px-2 py-3 dark:data-[state=active]:text-slate-200">
                <Receipt className="w-4 h-4 mr-2" /> כספים
              </TabsTrigger>
              <TabsTrigger value="docs" className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:bg-transparent px-2 py-3 dark:data-[state=active]:text-slate-200">
                <Cloud className="w-4 h-4 mr-2" /> מסמכים
              </TabsTrigger>
            </TabsList>

            <div className="pt-6">
              <TabsContent value="cases">
                {cases.length > 0 ? (
                  <DataTable 
                    columns={caseColumns} 
                    data={cases} 
                    isLoading={casesLoading}
                    onRowClick={(row) => navigate(createPageUrl('CaseView', { id: row.id }))}
                  />
                ) : (
                  <div className="text-center py-12 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl">
                    <p className="text-slate-500">אין תיקים ללקוח זה</p>
                    <Button variant="link" onClick={() => navigate(createPageUrl('Cases'))}>צור תיק חדש</Button>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="financials">
                <Card className="dark:bg-slate-800 dark:border-slate-700">
                  <CardHeader><CardTitle className="dark:text-slate-200">חשבוניות אחרונות</CardTitle></CardHeader>
                  <CardContent>
                    {financials.length > 0 ? (
                      <div className="space-y-2">
                        {financials.map(inv => (
                          <div key={inv.id} className="flex justify-between items-center p-3 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/50">
                            <div>
                              <p className="font-bold text-sm dark:text-slate-200">{inv.invoice_number}</p>
                              <p className="text-xs text-slate-500">{format(new Date(inv.issued_date), 'dd/MM/yyyy')}</p>
                            </div>
                            <div className="text-left">
                              <p className="font-bold dark:text-slate-200">₪{inv.total?.toLocaleString()}</p>
                              <StatusBadge status={inv.status} />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-slate-500 text-center py-4">אין פעילות כספית</p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="docs">
                <ClientDocuments clientId={clientId} />
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </div>
    </div>
  );
}