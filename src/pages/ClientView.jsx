import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { useTranslation } from 'react-i18next';
import StatusBadge from '../components/ui/StatusBadge';
import { useDateTimeSettings } from '../components/DateTimeSettingsProvider';
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
  UserCheck,
  Globe
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import DataTable from '../components/ui/DataTable';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";

import DocumentViewer from '../components/documents/DocumentViewer';
import DropboxBrowser from '../components/common/DropboxBrowser';
import { ClipboardList } from 'lucide-react';

// --- הדף הראשי ---
export default function ClientView() {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'he';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { formatDate } = useDateTimeSettings();
  const urlParams = new URLSearchParams(window.location.search);
  const clientId = urlParams.get('id');

  // --- States ---
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [formData, setFormData] = useState({});

  // --- Queries ---
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

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: async () => base44.entities.User.list(),
  });

  // Tasks for all this client's cases
  const caseIds = cases.map(c => c.id);
  const { data: clientTasks = [] } = useQuery({
    queryKey: ['client-tasks', clientId, caseIds],
    queryFn: async () => {
      if (caseIds.length === 0) return [];
      const allTasks = await base44.entities.Task.list('-created_date', 500);
      return allTasks.filter(t => caseIds.includes(t.case_id));
    },
    enabled: caseIds.length > 0,
  });

  const client = clientData?.[0];
  const BackIcon = isRTL ? ArrowRight : ArrowLeft;

  // --- Helpers ---
  const getLawyerName = (id) => users.find(u => u.id === id)?.full_name || t('client_view.unassigned');

  // --- Load Data for Edit ---
  useEffect(() => {
    if (client) {
      setFormData({
        name: client.name || '',
        type: client.type || 'company',
        communication_language: client.communication_language || 'he',
        email: client.email || '',
        phone: client.phone || '',
        address: client.address || '',
        country: client.country || 'IL',
        client_number: client.client_number || '',
        registration_number: client.registration_number || '',
        tax_id: client.tax_id || '',
        payment_terms: client.payment_terms || 'net_30',
        hourly_rate: client.hourly_rate || '',
        billing_currency: client.billing_currency || 'ILS',
        assigned_lawyer_id: client.assigned_lawyer_id || '',
        contact_person_name: client.contact_person_name || '',
        notes: client.notes || '',
        is_active: client.is_active !== false,
      });
    }
  }, [client]);

  // --- Update Mutation ---
  const updateMutation = useMutation({
    mutationFn: async (data) => {
      // 1. עדכון הלקוח במסד הנתונים הרגיל
      const response = await base44.entities.Client.update(clientId, data);
      
      // 2. בדיקה: האם השם השתנה?
      if (client.name && data.name && client.name !== data.name) {
        try {
          console.log(`[ClientView] Name changed. Updating Dropbox...`);
          
          // קריאה לפונקציה שעדכנו בשרת
          // שים לב: אנחנו משתמשים בשם הפונקציה המקורית 'createClientFolder'
          // אבל שולחים לה 'action: rename'
          await base44.functions.invoke('createClientFolder', {
            action: 'rename',
            oldName: client.name,
            newName: data.name,
            clientNumber: client.client_number
          });
          
        } catch (e) {
          console.warn('[ClientView] Failed to rename dropbox folder:', e);
          // לא זורקים שגיאה כדי לא לבטל את השמירה המוצלחת בדאטה-בייס
        }
      }
      return response;
    },
    onSuccess: () => {
      // **חשוב מאוד:** רענון כפול כדי שהמידע יתעדכן מיד
      queryClient.invalidateQueries(['client', clientId]);
      queryClient.invalidateQueries(['clients']);
      
      setIsEditOpen(false);
      toast({
        title: t('client_view.updated_success'),
        description: t('client_view.changes_saved'),
      });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: t('client_view.save_error'),
        description: error.message,
      });
    }
  });

  const handleSave = (e) => {
    e.preventDefault();
    if (!formData.name?.trim()) return toast({ variant: "destructive", title: t('client_view.name_required') });
    updateMutation.mutate(formData);
  };

  if (clientLoading) return <div className="space-y-6"><Skeleton className="h-12 w-1/3" /><Skeleton className="h-64 w-full" /></div>;
  if (!client) return <div className="text-center py-20">{t('client_view.not_found')}</div>;

  // הגדרות אפשרויות לטפסים (תואם ל-Clients.jsx)
  const clientTypes = [{ value: 'individual', label: t('client_view.type_individual') }, { value: 'company', label: t('client_view.type_company') }];
  const paymentTerms = [{ value: 'immediate', label: t('client_view.terms_immediate') }, { value: 'net_30', label: t('client_view.terms_net_30') }, { value: 'net_60', label: t('client_view.terms_net_60') }];
  const currencies = [{ value: 'ILS', label: '₪ ILS' }, { value: 'USD', label: '$ USD' }, { value: 'EUR', label: '€ EUR' }];

  // Helper: Get case type icon
  const getCaseTypeIcon = (type) => {
    const icons = {
      patent: '💡',
      trademark: '®️',
      design: '🎨',
      copyright: '©️',
      litigation: '⚖️',
      opposition: '🛡️'
    };
    return icons[type] || '📁';
  };

  // Helper: Get country flag
  const getCountryFlag = (territory) => {
    const flags = {
      'IL': '🇮🇱', 'US': '🇺🇸', 'EU': '🇪🇺', 'GB': '🇬🇧', 'DE': '🇩🇪', 
      'FR': '🇫🇷', 'CN': '🇨🇳', 'JP': '🇯🇵', 'KR': '🇰🇷', 'IN': '🇮🇳',
      'AU': '🇦🇺', 'CA': '🇨🇦', 'BR': '🇧🇷', 'RU': '🇷🇺', 'MX': '🇲🇽'
    };
    return flags[territory?.toUpperCase()] || '🌍';
  };

  const caseColumns = [
    { 
      header: t('client_view.case_type'), 
      accessorKey: 'case_type', 
      cell: ({ row }) => (
        <span className="text-lg" title={row.original.case_type}>
          {getCaseTypeIcon(row.original.case_type)}
        </span>
      )
    },
    { 
      header: t('client_view.case_number'), 
      accessorKey: 'case_number', 
      cell: ({ row }) => <span className="font-bold">{row.original.case_number}</span> 
    },
    { header: t('client_view.title'), accessorKey: 'title' },
    { 
      header: t('client_view.territory'), 
      accessorKey: 'territory', 
      cell: ({ row }) => (
        <span className="text-lg" title={row.original.territory}>
          {getCountryFlag(row.original.territory)}
        </span>
      )
    },
    { header: t('client_view.status'), accessorKey: 'status', cell: ({ row }) => <StatusBadge status={row.original.status} /> }
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to={createPageUrl('Clients')}>
          <Button variant="ghost" size="icon" className="rounded-xl"><BackIcon className="w-5 h-5" /></Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{client.name}</h1>
            <Badge variant={client.is_active !== false ? "default" : "secondary"}>
              {client.is_active !== false ? t('client_view.active') : t('client_view.inactive')}
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
        <Button variant="outline" onClick={() => setIsEditOpen(true)}>
          <Edit className={`w-4 h-4 ${isRTL ? 'ml-2' : 'mr-2'}`} />
          {t('client_view.edit')}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Info */}
        <div className="space-y-6">
          
          {/* Card 1: Contact */}
          <Card className="dark:bg-slate-800 dark:border-slate-700">
            <CardHeader><CardTitle className="text-base dark:text-slate-200">{t('client_view.contact_details')}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {client.email && (
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center"><Mail className="w-4 h-4 text-slate-500" /></div>
                  <div className="flex-1 min-w-0"><p className="text-xs text-slate-400">{t('client_view.email')}</p><p className="text-sm font-medium truncate dark:text-slate-200">{client.email}</p></div>
                </div>
              )}
              {client.phone && (
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center"><Phone className="w-4 h-4 text-slate-500" /></div>
                  <div className="flex-1 min-w-0"><p className="text-xs text-slate-400">{t('client_view.phone')}</p><p className="text-sm font-medium dir-ltr text-right dark:text-slate-200">{client.phone}</p></div>
                </div>
              )}
              {client.address && (
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center"><MapPin className="w-4 h-4 text-slate-500" /></div>
                  <div className="flex-1 min-w-0"><p className="text-xs text-slate-400">{t('client_view.address')}</p><p className="text-sm font-medium dark:text-slate-200">{client.address}, {client.country}</p></div>
                </div>
              )}
              {client.contact_person_name && (
                <div className="flex items-center gap-3 pt-2 border-t dark:border-slate-700">
                  <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center"><UserCheck className="w-4 h-4 text-slate-500" /></div>
                  <div className="flex-1 min-w-0"><p className="text-xs text-slate-400">{t('client_view.contact_person')}</p><p className="text-sm font-medium dark:text-slate-200">{client.contact_person_name}</p></div>
                </div>
              )}
              {/* Language Display */}
              <div className="flex items-center gap-3 pt-2 border-t dark:border-slate-700 mt-2">
                <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center"><Globe className="w-4 h-4 text-slate-500" /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-400">{t('client_view.communication_language')}</p>
                  <p className="text-sm font-medium dark:text-slate-200">{client.communication_language === 'en' ? t('client_view.language_english') : t('client_view.language_hebrew')}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Card 2: Legal & Billing */}
          <Card className="dark:bg-slate-800 dark:border-slate-700">
            <CardHeader><CardTitle className="text-base dark:text-slate-200">{t('client_view.legal_billing')}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-center border-b dark:border-slate-700 pb-2">
                <span className="text-sm text-slate-500">{t('client_view.assigned_lawyer')}</span>
                <span className="font-medium dark:text-slate-200">{getLawyerName(client.assigned_lawyer_id)}</span>
              </div>
              {(client.registration_number || client.tax_id) && (
                <div className="flex justify-between items-center border-b dark:border-slate-700 pb-2">
                  <span className="text-sm text-slate-500">{t('client_view.reg_tax')}</span>
                  <span className="font-medium dark:text-slate-200">{client.registration_number || client.tax_id}</span>
                </div>
              )}
              <div className="flex justify-between items-center border-b dark:border-slate-700 pb-2">
                <span className="text-sm text-slate-500">{t('client_view.hourly_rate')}</span>
                <span className="font-bold dark:text-slate-200">{client.hourly_rate ? `${client.hourly_rate} ${client.billing_currency}` : '-'}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-500">{t('client_view.payment_terms')}</span>
                <span className="font-medium dark:text-slate-200">{client.payment_terms}</span>
              </div>
            </CardContent>
          </Card>

          {/* Card 3: Notes */}
          {client.notes && (
            <Card className="dark:bg-slate-800 dark:border-slate-700">
              <CardHeader><CardTitle className="text-base dark:text-slate-200">{t('client_view.notes')}</CardTitle></CardHeader>
              <CardContent>
                <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap">{client.notes}</p>
              </CardContent>
            </Card>
          )}
        </div>
        {/* Right Column: Tabs Content */}
        <div className="lg:col-span-2">
          <Tabs defaultValue="cases" className="w-full">
            <TabsList className="w-full justify-start border-b rounded-none h-auto p-0 bg-transparent gap-6">
              <TabsTrigger 
                value="cases" 
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:bg-transparent px-2 py-3 dark:data-[state=active]:text-slate-200"
              >
                <Briefcase className={`w-4 h-4 ${isRTL ? 'ml-2' : 'mr-2'}`} /> {t('client_view.cases_tab')} ({cases.length})
              </TabsTrigger>
              <TabsTrigger 
                value="financials" 
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:bg-transparent px-2 py-3 dark:data-[state=active]:text-slate-200"
              >
                <Receipt className={`w-4 h-4 ${isRTL ? 'ml-2' : 'mr-2'}`} /> {t('client_view.financials_tab')}
              </TabsTrigger>
              <TabsTrigger
                value="tasks"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:bg-transparent px-2 py-3 dark:data-[state=active]:text-slate-200"
              >
                <ClipboardList className={`w-4 h-4 ${isRTL ? 'ml-2' : 'mr-2'}`} /> {t('client_view.tasks_tab', 'משימות')} ({clientTasks.length})
              </TabsTrigger>
              <TabsTrigger
                value="docs"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:bg-transparent px-2 py-3 dark:data-[state=active]:text-slate-200"
              >
                <Cloud className={`w-4 h-4 ${isRTL ? 'ml-2' : 'mr-2'}`} /> {t('client_view.documents_tab')}
              </TabsTrigger>
            </TabsList>

            <div className="pt-6">
              {/* Tab: Cases */}
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
                    <p className="text-slate-500">{t('client_view.no_cases')}</p>
                    <Button variant="link" onClick={() => navigate(createPageUrl('Cases'))}>{t('client_view.create_case')}</Button>
                  </div>
                )}
              </TabsContent>

              {/* Tab: Financials */}
              <TabsContent value="financials">
                <Card className="dark:bg-slate-800 dark:border-slate-700">
                  <CardHeader><CardTitle className="dark:text-slate-200">{t('client_view.recent_invoices')}</CardTitle></CardHeader>
                  <CardContent>
                    {financials.length > 0 ? (
                      <div className="space-y-2">
                        {financials.map(inv => (
                          <div key={inv.id} className="flex justify-between items-center p-3 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/50">
                            <div>
                              <p className="font-bold text-sm dark:text-slate-200">{inv.invoice_number}</p>
                              <p className="text-xs text-slate-500">{formatDate(inv.issued_date)}</p>
                            </div>
                            <div className={isRTL ? 'text-left' : 'text-right'}>
                              <p className="font-bold dark:text-slate-200">₪{inv.total?.toLocaleString()}</p>
                              <StatusBadge status={inv.status} />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-slate-500 text-center py-4">{t('client_view.no_financials')}</p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Tab: Tasks */}
              <TabsContent value="tasks">
                <Card className="dark:bg-slate-800 dark:border-slate-700">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2 dark:text-slate-200">
                      <ClipboardList className="w-5 h-5 text-blue-500" />
                      {t('client_view.all_tasks', 'כל המשימות')} ({clientTasks.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {clientTasks.length > 0 ? (
                      <div className="space-y-2">
                        {clientTasks.map(task => {
                          const relatedCase = cases.find(c => c.id === task.case_id);
                          return (
                            <div
                              key={task.id}
                              className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors"
                            >
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm text-slate-800 dark:text-slate-200 truncate">{task.title}</p>
                                <p className="text-xs text-slate-500">
                                  {relatedCase ? relatedCase.case_number : ''}{task.due_date ? ` • ${formatDate(task.due_date)}` : ''}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <StatusBadge status={task.status} />
                                <StatusBadge status={task.priority} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-slate-500 text-center py-4">{t('client_view.no_tasks', 'אין משימות')}</p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Tab: Documents */}
              <TabsContent value="docs">
                <div className="space-y-6">
                  <DocumentViewer clientId={clientId} />
                  {client && (
                    <DropboxBrowser
                      clientName={client.name}
                      clientNumber={client.client_number}
                    />
                  )}
                </div>
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </div>

      {/* --- Full Edit Dialog --- */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto dark:bg-slate-800 dark:border-slate-700">
          <DialogHeader>
            <DialogTitle className="dark:text-slate-200">{t('client_view.edit_client')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-6 mt-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2 space-y-2">
                <Label className="dark:text-slate-300">{t('client_view.name_field')}</Label>
                <Input 
                  value={formData.name || ''} 
                  onChange={(e) => setFormData({...formData, name: e.target.value})} 
                  required 
                  className="dark:bg-slate-900 dark:border-slate-600" 
                />
              </div>
              <div className="space-y-2">
                <Label className="dark:text-slate-300">{t('client_view.client_number')}</Label>
                <Input 
                  value={formData.client_number || ''} 
                  onChange={(e) => setFormData({...formData, client_number: e.target.value})} 
                  required 
                  disabled={true}
                  className="dark:bg-slate-900 dark:border-slate-600 disabled:opacity-50 disabled:cursor-not-allowed" 
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="dark:text-slate-300">{t('client_view.client_type')}</Label>
                <Select 
                  value={formData.type} 
                  onValueChange={(v) => setFormData({...formData, type: v})}
                >
                  <SelectTrigger className="dark:bg-slate-900 dark:border-slate-600"><SelectValue /></SelectTrigger>
                  <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
                    {clientTypes.map(ct => <SelectItem key={ct.value} value={ct.value}>{ct.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="dark:text-slate-300">{t('client_view.assigned_lawyer')}</Label>
                <Select 
                  value={formData.assigned_lawyer_id} 
                  onValueChange={(v) => setFormData({...formData, assigned_lawyer_id: v})}
                >
                  <SelectTrigger className="dark:bg-slate-900 dark:border-slate-600"><SelectValue placeholder={t('client_view.select_lawyer')} /></SelectTrigger>
                  <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
                    {users.map(u => <SelectItem key={u.id} value={u.id}>{u.full_name || u.email}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {formData.type === 'company' && (
              <div className="space-y-2">
                <Label className="dark:text-slate-300">{t('client_view.contact_name')}</Label>
                <Input 
                  value={formData.contact_person_name || ''} 
                  onChange={(e) => setFormData({...formData, contact_person_name: e.target.value})} 
                  className="dark:bg-slate-900 dark:border-slate-600" 
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="dark:text-slate-300">{t('client_view.email')}</Label>
                <Input 
                  value={formData.email || ''} 
                  onChange={(e) => setFormData({...formData, email: e.target.value})} 
                  className="dark:bg-slate-900 dark:border-slate-600" 
                />
              </div>
              <div className="space-y-2">
                <Label className="dark:text-slate-300">{t('client_view.phone')}</Label>
                <Input 
                  value={formData.phone || ''} 
                  onChange={(e) => setFormData({...formData, phone: e.target.value})} 
                  className="dark:bg-slate-900 dark:border-slate-600" 
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="dark:text-slate-300">{t('client_view.country')}</Label>
                <Input 
                  value={formData.country || ''} 
                  onChange={(e) => setFormData({...formData, country: e.target.value})} 
                  className="dark:bg-slate-900 dark:border-slate-600" 
                />
              </div>
              <div className="space-y-2">
                <Label className="dark:text-slate-300">{t('client_view.communication_language')}</Label>
                <Select 
                  value={formData.communication_language} 
                  onValueChange={(v) => setFormData({...formData, communication_language: v})}
                >
                  <SelectTrigger className="dark:bg-slate-900 dark:border-slate-600"><SelectValue /></SelectTrigger>
                  <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
                    <SelectItem value="he">{t('client_view.language_hebrew')}</SelectItem>
                    <SelectItem value="en">{isRTL ? 'אנגלית' : 'English'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="dark:text-slate-300">{t('client_view.registration_number')}</Label>
                <Input 
                  value={formData.registration_number || ''} 
                  onChange={(e) => setFormData({...formData, registration_number: e.target.value})} 
                  className="dark:bg-slate-900 dark:border-slate-600" 
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="dark:text-slate-300">{t('client_view.tax_id')}</Label>
                <Input 
                  value={formData.tax_id || ''} 
                  onChange={(e) => setFormData({...formData, tax_id: e.target.value})} 
                  className="dark:bg-slate-900 dark:border-slate-600" 
                />
              </div>
              <div className="space-y-2">
                <Label className="dark:text-slate-300">{t('client_view.hourly_rate')}</Label>
                <Input 
                  type="number" 
                  step="0.01" 
                  value={formData.hourly_rate} 
                  onChange={(e) => setFormData({...formData, hourly_rate: parseFloat(e.target.value) || 0})} 
                  className="dark:bg-slate-900 dark:border-slate-600" 
                />
              </div>
              <div className="space-y-2">
                <Label className="dark:text-slate-300">{t('client_view.currency')}</Label>
                <Select 
                  value={formData.billing_currency} 
                  onValueChange={(v) => setFormData({...formData, billing_currency: v})}
                >
                  <SelectTrigger className="dark:bg-slate-900 dark:border-slate-600"><SelectValue /></SelectTrigger>
                  <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
                    {currencies.map(curr => (
                      <SelectItem key={curr.value} value={curr.value}>{curr.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="dark:text-slate-300">{t('client_view.payment_terms')}</Label>
                <Select 
                  value={formData.payment_terms} 
                  onValueChange={(v) => setFormData({...formData, payment_terms: v})}
                >
                  <SelectTrigger className="dark:bg-slate-900 dark:border-slate-600"><SelectValue /></SelectTrigger>
                  <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
                    {paymentTerms.map(pt => (
                      <SelectItem key={pt.value} value={pt.value}>{pt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="dark:text-slate-300">{t('client_view.address')}</Label>
                <Input 
                  value={formData.address || ''} 
                  onChange={(e) => setFormData({...formData, address: e.target.value})} 
                  className="dark:bg-slate-900 dark:border-slate-600" 
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="dark:text-slate-300">{t('client_view.notes')}</Label>
              <Textarea 
                value={formData.notes || ''} 
                onChange={(e) => setFormData({...formData, notes: e.target.value})} 
                rows={3} 
                className="dark:bg-slate-900 dark:border-slate-600" 
              />
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setIsEditOpen(false)} 
                className="dark:border-slate-600"
              >
                {t('common.cancel')}
              </Button>
              <Button 
                type="submit" 
                className="bg-slate-800 hover:bg-slate-700 dark:bg-slate-700" 
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? t('client_view.saving') : t('client_view.save_changes')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}