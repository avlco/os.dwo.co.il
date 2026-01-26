import React, { useState, useEffect } from 'react';
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

// --- רכיב פנימי למסמכי לקוח ---
function ClientDocuments({ clientId }) {
  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['client-tasks-docs', clientId],
    queryFn: () => base44.entities.Task.filter({ client_id: clientId }),
    enabled: !!clientId,
  });

  const dropboxDocuments = [];
  tasks.forEach(task => {
    const executionLog = task.extracted_data?.execution_log || [];
    executionLog.forEach(entry => {
      // תנאי מורחב: תופס גם העלאות מוצלחות וגם תוצאות עם URL
      if (entry.status === 'success' && (entry.action_type === 'upload_to_dropbox' || entry.result_url)) {
        dropboxDocuments.push({
          id: `${task.id}_${entry.executed_at}`,
          task_title: task.title,
          url: entry.result_url,
          uploaded_at: entry.executed_at,
          filename: entry.details?.filename || 'מסמך ללא שם',
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
  const queryClient = useQueryClient();
  const { toast } = useToast();
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

  const client = clientData?.[0];
  const BackIcon = isRTL ? ArrowRight : ArrowLeft;

  // --- Helpers ---
  const getLawyerName = (id) => users.find(u => u.id === id)?.full_name || 'לא משויך';

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
      // 1. עדכון הלקוח במסד הנתונים
      const response = await base44.entities.Client.update(clientId, data);
      
      // 2. לוגיקת שינוי שם תיקייה בדרופבוקס (אם השם השתנה)
      if (client.name && data.name && client.name !== data.name) {
        try {
          console.log(`[ClientView] Detected name change. Updating Dropbox folder...`);
          await base44.functions.invoke('renameClientFolder', {
            oldName: client.name,
            newName: data.name,
            clientNumber: client.client_number
          });
        } catch (e) {
          console.warn('[ClientView] Failed to rename dropbox folder:', e);
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
        title: "הלקוח עודכן בהצלחה",
        description: "השינויים נשמרו במערכת",
      });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "שגיאה",
        description: error.message,
      });
    }
  });

  const handleSave = (e) => {
    e.preventDefault();
    if (!formData.name?.trim()) return toast({ variant: "destructive", title: "שם הוא שדה חובה" });
    updateMutation.mutate(formData);
  };

  if (clientLoading) return <div className="space-y-6"><Skeleton className="h-12 w-1/3" /><Skeleton className="h-64 w-full" /></div>;
  if (!client) return <div className="text-center py-20">לקוח לא נמצא</div>;

  // הגדרות לטפסים (הועתק מ-Clients.jsx)
  const clientTypes = [{ value: 'individual', label: 'פרטי' }, { value: 'company', label: 'חברה' }];
  const paymentTerms = [{ value: 'immediate', label: 'מיידי' }, { value: 'net_30', label: 'שוטף + 30' }, { value: 'net_60', label: 'שוטף + 60' }];
  const currencies = [{ value: 'ILS', label: '₪ ILS' }, { value: 'USD', label: '$ USD' }, { value: 'EUR', label: '€ EUR' }];

  const caseColumns = [
    { header: 'מספר תיק', accessorKey: 'case_number', cell: ({ row }) => <span className="font-bold">{row.original.case_number}</span> },
    { header: 'כותרת', accessorKey: 'title' },
    { header: 'סטטוס', accessorKey: 'status', cell: ({ row }) => <StatusBadge status={row.original.status} /> }
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
        <Button variant="outline" onClick={() => setIsEditOpen(true)}>
          <Edit className="w-4 h-4 mr-2" />
          עריכה
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Info */}
        <div className="space-y-6">
          
          {/* Card 1: Contact */}
          <Card className="dark:bg-slate-800 dark:border-slate-700">
            <CardHeader><CardTitle className="text-base dark:text-slate-200">פרטי קשר</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {client.email && (
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center"><Mail className="w-4 h-4 text-slate-500" /></div>
                  <div className="flex-1 min-w-0"><p className="text-xs text-slate-400">אימייל</p><p className="text-sm font-medium truncate dark:text-slate-200">{client.email}</p></div>
                </div>
              )}
              {client.phone && (
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center"><Phone className="w-4 h-4 text-slate-500" /></div>
                  <div className="flex-1 min-w-0"><p className="text-xs text-slate-400">טלפון</p><p className="text-sm font-medium dir-ltr text-right dark:text-slate-200">{client.phone}</p></div>
                </div>
              )}
              {client.address && (
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center"><MapPin className="w-4 h-4 text-slate-500" /></div>
                  <div className="flex-1 min-w-0"><p className="text-xs text-slate-400">כתובת</p><p className="text-sm font-medium dark:text-slate-200">{client.address}, {client.country}</p></div>
                </div>
              )}
              {client.contact_person_name && (
                <div className="flex items-center gap-3 pt-2 border-t dark:border-slate-700">
                  <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center"><UserCheck className="w-4 h-4 text-slate-500" /></div>
                  <div className="flex-1 min-w-0"><p className="text-xs text-slate-400">איש קשר</p><p className="text-sm font-medium dark:text-slate-200">{client.contact_person_name}</p></div>
                </div>
              )}
              {/* Language Display */}
              <div className="flex items-center gap-3 pt-2 border-t dark:border-slate-700">
                <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center"><Globe className="w-4 h-4 text-slate-500" /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-400">שפת תקשורת</p>
                  <p className="text-sm font-medium dark:text-slate-200">{client.communication_language === 'en' ? 'אנגלית (English)' : 'עברית'}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Card 2: Legal & Billing */}
          <Card className="dark:bg-slate-800 dark:border-slate-700">
            <CardHeader><CardTitle className="text-base dark:text-slate-200">פרטים משפטיים וחיוב</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-center border-b dark:border-slate-700 pb-2">
                <span className="text-sm text-slate-500">עו"ד מטפל</span>
                <span className="font-medium dark:text-slate-200">{getLawyerName(client.assigned_lawyer_id)}</span>
              </div>
              {(client.registration_number || client.tax_id) && (
                <div className="flex justify-between items-center border-b dark:border-slate-700 pb-2">
                  <span className="text-sm text-slate-500">ח.פ / עוסק</span>
                  <span className="font-medium dark:text-slate-200">{client.registration_number || client.tax_id}</span>
                </div>
              )}
              <div className="flex justify-between items-center border-b dark:border-slate-700 pb-2">
                <span className="text-sm text-slate-500">תעריף שעתי</span>
                <span className="font-bold dark:text-slate-200">{client.hourly_rate ? `${client.hourly_rate} ${client.billing_currency}` : '-'}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-500">תנאי תשלום</span>
                <span className="font-medium dark:text-slate-200">{client.payment_terms}</span>
              </div>
            </CardContent>
          </Card>

          {/* Card 3: Notes */}
          {client.notes && (
            <Card className="dark:bg-slate-800 dark:border-slate-700">
              <CardHeader><CardTitle className="text-base dark:text-slate-200">הערות</CardTitle></CardHeader>
              <CardContent>
                <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap">{client.notes}</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Column: Tabs */}
        <div className="lg:col-span-2">
          <Tabs defaultValue="cases" className="w-full">
            <TabsList className="w-full justify-start border-b rounded-none h-auto p-0 bg-transparent gap-6">
              <TabsTrigger value="cases" className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:bg-transparent px-2 py-3 dark:data-[state=active]:text-slate-200"><Briefcase className="w-4 h-4 mr-2" /> תיקים ({cases.length})</TabsTrigger>
              <TabsTrigger value="financials" className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:bg-transparent px-2 py-3 dark:data-[state=active]:text-slate-200"><Receipt className="w-4 h-4 mr-2" /> כספים</TabsTrigger>
              <TabsTrigger value="docs" className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:bg-transparent px-2 py-3 dark:data-[state=active]:text-slate-200"><Cloud className="w-4 h-4 mr-2" /> מסמכים</TabsTrigger>
            </TabsList>

            <div className="pt-6">
              <TabsContent value="cases">
                {cases.length > 0 ? (
                  <DataTable columns={caseColumns} data={cases} isLoading={casesLoading} onRowClick={(row) => navigate(createPageUrl('CaseView', { id: row.id }))} />
                ) : (
                  <div className="text-center py-12 border-2 border-dashed rounded-xl"><p className="text-slate-500">אין תיקים ללקוח זה</p><Button variant="link" onClick={() => navigate(createPageUrl('Cases'))}>צור תיק חדש</Button></div>
                )}
              </TabsContent>

              <TabsContent value="financials">
                <Card className="dark:bg-slate-800 dark:border-slate-700">
                  <CardHeader><CardTitle className="dark:text-slate-200">חשבוניות אחרונות</CardTitle></CardHeader>
                  <CardContent>
                    {financials.length > 0 ? (
                      <div className="space-y-2">{financials.map(inv => (<div key={inv.id} className="flex justify-between items-center p-3 border rounded-lg hover:bg-slate-50"><p className="font-bold text-sm dark:text-slate-200">{inv.invoice_number}</p><div className="text-left"><p className="font-bold dark:text-slate-200">₪{inv.total?.toLocaleString()}</p><StatusBadge status={inv.status} /></div></div>))}</div>
                    ) : <p className="text-slate-500 text-center py-4">אין פעילות כספית</p>}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="docs"><ClientDocuments clientId={clientId} /></TabsContent>
            </div>
          </Tabs>
        </div>
      </div>

      {/* --- Full Edit Dialog (מועתק מ-Clients.jsx) --- */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto dark:bg-slate-800 dark:border-slate-700">
          <DialogHeader><DialogTitle className="dark:text-slate-200">עריכת לקוח</DialogTitle></DialogHeader>
          <form onSubmit={handleSave} className="space-y-6 mt-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2 space-y-2"><Label className="dark:text-slate-300">שם הלקוח / חברה *</Label><Input value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} required className="dark:bg-slate-900 dark:border-slate-600" /></div>
              <div className="space-y-2"><Label className="dark:text-slate-300">מספר לקוח</Label><Input value={formData.client_number} onChange={(e) => setFormData({...formData, client_number: e.target.value})} required className="dark:bg-slate-900 dark:border-slate-600" /></div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label className="dark:text-slate-300">סוג לקוח</Label>
                <Select value={formData.type} onValueChange={(v) => setFormData({...formData, type: v})}>
                  <SelectTrigger className="dark:bg-slate-900 dark:border-slate-600"><SelectValue /></SelectTrigger>
                  <SelectContent className="dark:bg-slate-800 dark:border-slate-700">{clientTypes.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label className="dark:text-slate-300">עו"ד מטפל</Label>
                <Select value={formData.assigned_lawyer_id} onValueChange={(v) => setFormData({...formData, assigned_lawyer_id: v})}>
                  <SelectTrigger className="dark:bg-slate-900 dark:border-slate-600"><SelectValue placeholder="בחר עו״ד" /></SelectTrigger>
                  <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
                    {users.map(u => <SelectItem key={u.id} value={u.id}>{u.full_name || u.email}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {formData.type === 'company' && (
              <div className="space-y-2"><Label className="dark:text-slate-300">שם איש קשר</Label><Input value={formData.contact_person_name} onChange={(e) => setFormData({...formData, contact_person_name: e.target.value})} className="dark:bg-slate-900 dark:border-slate-600" /></div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label className="dark:text-slate-300">אימייל</Label><Input value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} className="dark:bg-slate-900 dark:border-slate-600" /></div>
              <div className="space-y-2"><Label className="dark:text-slate-300">טלפון</Label><Input value={formData.phone} onChange={(e) => setFormData({...formData, phone: e.target.value})} className="dark:bg-slate-900 dark:border-slate-600" /></div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2"><Label className="dark:text-slate-300">מדינה</Label><Input value={formData.country} onChange={(e) => setFormData({...formData, country: e.target.value})} className="dark:bg-slate-900 dark:border-slate-600" /></div>
              <div className="space-y-2"><Label className="dark:text-slate-300">שפת תקשורת</Label>
                <Select value={formData.communication_language} onValueChange={(v) => setFormData({...formData, communication_language: v})}>
                  <SelectTrigger className="dark:bg-slate-900 dark:border-slate-600"><SelectValue /></SelectTrigger>
                  <SelectContent className="dark:bg-slate-800 dark:border-slate-700"><SelectItem value="he">עברית</SelectItem><SelectItem value="en">אנגלית</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label className="dark:text-slate-300">ח.פ / תאגיד</Label><Input value={formData.registration_number} onChange={(e) => setFormData({...formData, registration_number: e.target.value})} className="dark:bg-slate-900 dark:border-slate-600" /></div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2"><Label className="dark:text-slate-300">מספר עוסק</Label><Input value={formData.tax_id} onChange={(e) => setFormData({...formData, tax_id: e.target.value})} className="dark:bg-slate-900 dark:border-slate-600" /></div>
              <div className="space-y-2"><Label className="dark:text-slate-300">תעריף שעתי</Label><Input type="number" step="0.01" value={formData.hourly_rate} onChange={(e) => setFormData({...formData, hourly_rate: parseFloat(e.target.value) || 0})} className="dark:bg-slate-900 dark:border-slate-600" /></div>
              <div className="space-y-2"><Label className="dark:text-slate-300">מטבע</Label>
                <Select value={formData.billing_currency} onValueChange={(v) => setFormData({...formData, billing_currency: v})}>
                  <SelectTrigger className="dark:bg-slate-900 dark:border-slate-600"><SelectValue /></SelectTrigger>
                  <SelectContent className="dark:bg-slate-800 dark:border-slate-700">{currencies.map(curr => <SelectItem key={curr.value} value={curr.value}>{curr.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label className="dark:text-slate-300">תנאי תשלום</Label>
                <Select value={formData.payment_terms} onValueChange={(v) => setFormData({...formData, payment_terms: v})}>
                  <SelectTrigger className="dark:bg-slate-900 dark:border-slate-600"><SelectValue /></SelectTrigger>
                  <SelectContent className="dark:bg-slate-800 dark:border-slate-700">{paymentTerms.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label className="dark:text-slate-300">כתובת</Label><Input value={formData.address} onChange={(e) => setFormData({...formData, address: e.target.value})} className="dark:bg-slate-900 dark:border-slate-600" /></div>
            </div>

            <div className="space-y-2"><Label className="dark:text-slate-300">הערות</Label><Textarea value={formData.notes} onChange={(e) => setFormData({...formData, notes: e.target.value})} rows={3} className="dark:bg-slate-900 dark:border-slate-600" /></div>

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
                {updateMutation.isPending ? 'שומר...' : 'שמור שינויים'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}