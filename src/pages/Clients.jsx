import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useTranslation } from 'react-i18next';
import { useNavigate, useLocation } from 'react-router-dom';
import { createPageUrl } from '../utils';
import PageHeader from '../components/ui/PageHeader';
import DataTable from '../components/ui/DataTable';
import EmptyState from '../components/ui/EmptyState';
import ImportExportDialog from '../components/import-export/ImportExportDialog';
import {
  Users,
  Search,
  Edit,
  Trash2,
  Archive,
  RefreshCcw,
  MoreHorizontal,
  Mail,
  Phone,
  Building2,
  UserCheck,
  Eye,
  Upload,
  Download
} from 'lucide-react';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";

export default function Clients() {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'he';
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [showArchived, setShowArchived] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [isImportExportOpen, setIsImportExportOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    type: 'company',
    communication_language: 'he',
    email: '',
    phone: '',
    address: '',
    country: 'IL',
    registration_number: '',
    tax_id: '',
    payment_terms: 'net_30',
    is_active: true,
    notes: '',
    client_number: '0001',
    assigned_lawyer_id: '',
    hourly_rate: 800,
    billing_currency: 'ILS',
    contact_person_name: '',
  });

  const clientTypes = [
    { value: 'individual', label: t('clients.type_individual') },
    { value: 'company', label: t('clients.type_company') },
  ];

  const paymentTerms = [
    { value: 'immediate', label: t('clients.terms_immediate') },
    { value: 'net_30', label: t('clients.terms_net_30') },
    { value: 'net_60', label: t('clients.terms_net_60') },
  ];

  const currencies = [
    { value: 'ILS', label: '₪ ILS' },
    { value: 'USD', label: '$ USD' },
    { value: 'EUR', label: '€ EUR' },
  ];

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ['clients'],
    queryFn: () => base44.entities.Client.list('-created_date', 500),
  });

  const { data: cases = [] } = useQuery({
    queryKey: ['cases'],
    queryFn: () => base44.entities.Case.list('-created_date', 500),
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      try {
        return await base44.entities.User.list();
      } catch (error) {
        console.error('Error loading users:', error);
        return [];
      }
    },
  });

  // פתיחה אוטומטית של עריכה אם יש ב-URL פרמטר edit
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const editId = params.get('edit');
    if (editId && clients.length > 0) {
      const clientToEdit = clients.find(c => c.id === editId);
      if (clientToEdit) {
        openEditDialog(clientToEdit);
        // מנקה את ה-URL
        window.history.replaceState({}, '', createPageUrl('Clients')); 
      }
    }
  }, [location.search, clients]);

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Client.create(data),
    onSuccess: async () => {
      queryClient.invalidateQueries(['clients']);
      setIsDialogOpen(false);
      
      // יצירת תיקייה ב-Dropbox
      try {
        await base44.functions.invoke('createClientFolder', {
          client_name: formData.name,
          client_number: formData.client_number
        });
        console.log('[Clients] Dropbox folder created');
      } catch (folderError) {
        console.error('[Clients] Failed to create Dropbox folder:', folderError);
      }
      
      resetForm();
      toast({
        title: "הלקוח נוסף בהצלחה",
        description: `הלקוח "${formData.name}" נוצר במערכת`,
      });
    },
    onError: (error) => {
      console.error('Failed to create client:', error);
      toast({
        variant: "destructive",
        title: "שגיאה ביצירת לקוח",
        description: error.message || "אנא נסה שנית או פנה לתמיכה",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Client.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['clients']);
      setIsDialogOpen(false);
      resetForm();
      toast({
        title: "הלקוח עודכן בהצלחה",
        description: "השינויים נשמרו במערכת",
      });
    },
    onError: (error) => {
      console.error('Failed to update client:', error);
      toast({
        variant: "destructive",
        title: "שגיאה בעדכון לקוח",
        description: error.message || "אנא נסה שנית",
      });
    },
  });

  // לוגיקת ארכיון/שחזור מעודכנת
  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      const clientCases = cases.filter(c => c.client_id === id);

      if (clientCases.length > 0) {
        const confirmed = window.confirm(
          `ללקוח זה יש ${clientCases.length} תיקים פעילים.\n\n` +
          `העברת הלקוח לארכיון תסתיר אותו מהרשימות השוטפות.\n\n` +
          `האם להמשיך?`
        );

        if (!confirmed) {
          throw new Error('USER_CANCELLED');
        }
      }

      return base44.entities.Client.update(id, { is_active: false });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['clients']);
      toast({
        title: "הלקוח הועבר לארכיון",
        description: "ניתן לצפות בלקוח על ידי לחיצה על 'הצג ארכיון'",
      });
    },
    onError: (error) => {
      if (error.message !== 'USER_CANCELLED') {
        console.error('Failed to archive client:', error);
        toast({
          variant: "destructive",
          title: "שגיאה בעדכון סטטוס",
          description: error.message || "אנא נסה שנית",
        });
      }
    },
  });

  const resetForm = () => {
    setFormData({
      name: '',
      type: 'company',
      communication_language: 'he',
      email: '',
      phone: '',
      address: '',
      country: 'IL',
      registration_number: '',
      tax_id: '',
      payment_terms: 'net_30',
      is_active: true,
      notes: '',
      client_number: '0001',
      assigned_lawyer_id: '',
      hourly_rate: 800,
      billing_currency: 'ILS',
      contact_person_name: '',
    });
    setEditingClient(null);
  };

  const validateClientForm = (data) => {
    const errors = [];

    if (!data.name || data.name.trim() === '') {
      errors.push('שם הלקוח הוא שדה חובה');
    }

    if (!data.client_number || data.client_number.trim() === '') {
      errors.push('מספר לקוח הוא שדה חובה');
    }

    const hasEmail = data.email && data.email.trim() !== '';
    const hasPhone = data.phone && data.phone.trim() !== '';

    if (!hasEmail && !hasPhone) {
      errors.push('חובה למלא לפחות אמצעי תקשורת אחד: אימייל או טלפון');
    }

    if (hasEmail) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(data.email)) {
        errors.push('כתובת האימייל אינה תקינה');
      }
    }

    if (hasPhone) {
      const phoneRegex = /^[\d\s\-\+\(\)]+$/;
      if (!phoneRegex.test(data.phone)) {
        errors.push('מספר הטלפון אינו תקין');
      }
    }

    if (data.hourly_rate && parseFloat(data.hourly_rate) < 0) {
      errors.push('תעריף שעתי חייב להיות מספר חיובי');
    }

    return errors;
  };

  const openCreateDialog = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const openEditDialog = (client) => {
    setEditingClient(client);
    setFormData({
      name: client.name || '',
      type: client.type || 'company',
      communication_language: client.communication_language || 'he',
      email: client.email || '',
      phone: client.phone || '',
      address: client.address || '',
      country: client.country || 'IL',
      registration_number: client.registration_number || '',
      tax_id: client.tax_id || '',
      payment_terms: client.payment_terms || 'net_30',
      is_active: client.is_active !== false,
      notes: client.notes || '',
      client_number: client.client_number || '',
      assigned_lawyer_id: client.assigned_lawyer_id || '',
      hourly_rate: client.hourly_rate || 800,
      billing_currency: client.billing_currency || 'ILS',
      contact_person_name: client.contact_person_name || '',
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    const validationErrors = validateClientForm(formData);

    if (validationErrors.length > 0) {
      toast({
        variant: "destructive",
        title: "שגיאת ולידציה",
        description: validationErrors.join(', '),
      });
      return;
    }

    if (formData.client_number && formData.client_number.trim() !== '') {
      const isDuplicate = clients.some(c =>
        c.client_number === formData.client_number &&
        (!editingClient || c.id !== editingClient.id)
      );

      if (isDuplicate) {
        const duplicate = clients.find(c => c.client_number === formData.client_number);
        const nextNumber = (parseInt(formData.client_number) + 1).toString().padStart(4, '0');
        toast({
          variant: "destructive",
          title: `מספר ${formData.client_number} תפוס`,
          description: `"${duplicate.name}" משתמש בו. נסה ${nextNumber}`,
        });
        return;
      }
    }

    if (editingClient) {
      updateMutation.mutate({ id: editingClient.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const getCasesCount = (clientId) => {
    return cases.filter(c => c.client_id === clientId).length;
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const response = await base44.functions.invoke('exportData', { entityType: 'clients' });
      const { content, filename, mimeType } = response.data;
      
      const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast({ title: "הייצוא הושלם", description: `${clients.length} לקוחות יוצאו בהצלחה` });
    } catch (error) {
      toast({ variant: "destructive", title: "שגיאה בייצוא", description: error.message });
    } finally {
      setIsExporting(false);
    }
  };

  const handleImport = async (items) => {
    try {
      const response = await base44.functions.invoke('importData', { entityType: 'clients', items });
      const { created, updated, failed, errors } = response.data;
      
      queryClient.invalidateQueries(['clients']);
      
      let description = `נוצרו ${created}, עודכנו ${updated}`;
      if (failed > 0) description += `, נכשלו ${failed}`;
      
      toast({ 
        title: "הייבוא הושלם", 
        description,
        variant: failed > 0 ? "warning" : "default"
      });
    } catch (error) {
      toast({ variant: "destructive", title: "שגיאה בייבוא", description: error.message });
      throw error;
    }
  };

  const getLawyerName = (lawyerId) => {
    const lawyer = users.find(u => u.id === lawyerId);
    return lawyer?.full_name || lawyer?.email || '-';
  };

  const filteredClients = clients.filter(c => {
    const matchesSearch = c.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.client_number?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = filterType === 'all' || c.type === filterType;
    const isActive = showArchived ? true : (c.is_active !== false); // שינוי קטן: אם מציגים ארכיון, מציגים הכל (גם פעיל וגם לא)
    return matchesSearch && matchesType && isActive;
  });

  const columns = [
    {
      header: t('clients.name'),
      accessor: 'name',
      cell: ({ row }) => {
        const r = row.original;
        return (
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
              {r.type === 'company' ? (
                <Building2 className="w-5 h-5 text-slate-500 dark:text-slate-400" />
              ) : (
                <Users className="w-5 h-5 text-slate-500 dark:text-slate-400" />
              )}
            </div>
            <div>
              <p className="font-medium text-slate-800 dark:text-slate-200">{r.name}</p>
              <div className="flex items-center gap-2">
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {r.type === 'company' ? t('clients.type_company') : t('clients.type_individual')}
                </p>
                {r.client_number && (
                  <Badge variant="outline" className="text-xs">
                    {r.client_number}
                  </Badge>
                )}
                {r.communication_language === 'en' && <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">EN</Badge>}
              </div>
            </div>
          </div>
        );
      },
    },
    {
      id: 'contact_details',
      header: t('clients.contact_details'),
      cell: ({ row }) => {
        const r = row.original;
        return (
          <div className="space-y-1">
            {r.email && (
              <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                <Mail className="w-3 h-3" />
                {r.email}
              </div>
            )}
            {r.phone && (
              <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                <Phone className="w-3 h-3" />
                {r.phone}
              </div>
            )}
          </div>
        );
      },
    },
    {
      id: 'assigned_lawyer',
      header: 'עו"ד מטפל',
      cell: ({ row }) => {
        const r = row.original;
        return r.assigned_lawyer_id ? (
          <div className="flex items-center gap-2 text-sm">
            <UserCheck className="w-4 h-4 text-blue-600" />
            <span className="dark:text-slate-300">{getLawyerName(r.assigned_lawyer_id)}</span>
          </div>
        ) : (
          <span className="text-slate-400 text-sm">-</span>
        );
      },
    },
    {
      id: 'hourly_rate',
      header: 'תעריף שעתי',
      cell: ({ row }) => {
        const r = row.original;
        return (
          <span className="dark:text-slate-300 font-mono text-sm">
            {r.hourly_rate ? `${r.hourly_rate} ${r.billing_currency || '₪'}` : '-'}
          </span>
        );
      },
    },
    {
      id: 'cases_count',
      header: t('clients.cases_count'),
      cell: ({ row }) => {
        const r = row.original;
        return (
          <Badge
            variant="secondary"
            className="bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
          >
            {getCasesCount(r.id)} תיקים
          </Badge>
        );
      },
    },
    {
      id: 'status',
      header: t('clients.status'),
      cell: ({ row }) => {
        const r = row.original;
        const active = r.is_active !== false;
        return (
          <Badge
            variant={active ? 'default' : 'secondary'}
            className={
              active
                ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
            }
          >
            {active ? t('clients.active') : t('clients.inactive')}
          </Badge>
        );
      },
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        const r = row.original;
        const isActive = r.is_active !== false;
        
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 dark:hover:bg-slate-700">
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="dark:bg-slate-800 dark:border-slate-700">
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(createPageUrl('ClientView', { id: r.id }));
                }}
                className="flex items-center gap-2 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <Eye className="w-4 h-4" />
                צפייה
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  openEditDialog(r);
                }}
                className="flex items-center gap-2 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <Edit className="w-4 h-4" />
                {t('clients.edit')}
              </DropdownMenuItem>
              
              {/* כפתור ארכיון / שחזור דינמי */}
              {isActive ? (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteMutation.mutate(r.id);
                  }}
                  className="flex items-center gap-2 text-amber-600 dark:text-amber-400 dark:hover:bg-slate-700"
                >
                  <Archive className="w-4 h-4" />
                  ארכיון
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    updateMutation.mutate({ id: r.id, data: { is_active: true } });
                  }}
                  className="flex items-center gap-2 text-green-600 dark:text-green-400 dark:hover:bg-slate-700"
                >
                  <RefreshCcw className="w-4 h-4" />
                  שחזור
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader
          title={t('clients.title')}
          subtitle={`${clients.length} לקוחות במערכת`}
          action={openCreateDialog}
          actionLabel={t('clients.new_client')}
        />
        <Button 
          variant="outline" 
          onClick={() => setIsImportExportOpen(true)}
          className="gap-2"
        >
          <Upload className="w-4 h-4" />
          ייבוא/ייצוא
        </Button>
      </div>

      <div className="flex flex-wrap gap-4 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search
            className={`absolute ${isRTL ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400`}
          />
          <Input
            placeholder={t('clients.search_placeholder')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={`${isRTL ? 'pr-10' : 'pl-10'} bg-white dark:bg-slate-800 dark:border-slate-700`}
          />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-40 bg-white dark:bg-slate-800 dark:border-slate-700">
            <SelectValue placeholder={t('clients.client_type')} />
          </SelectTrigger>
          <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
            <SelectItem value="all" className="dark:text-slate-200">
              {t('clients.all_types')}
            </SelectItem>
            {clientTypes.map(type => (
              <SelectItem key={type.value} value={type.value} className="dark:text-slate-200">
                {type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => setShowArchived(!showArchived)}
          className="ml-2"
        >
          {showArchived ? 'הסתר' : 'הצג'} ארכיון
        </Button>
      </div>

      {clients.length === 0 && !isLoading ? (
        <EmptyState
          icon={Users}
          title={t('clients.no_clients')}
          description={t('clients.no_clients_desc')}
          actionLabel={t('clients.add_client')}
          onAction={openCreateDialog}
        />
      ) : (
        <DataTable
          columns={columns}
          data={filteredClients}
          isLoading={isLoading}
          emptyMessage={t('clients.no_results')}
          onRowClick={(row) => navigate(createPageUrl('ClientView', { id: row.id }))}
        />
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto dark:bg-slate-800 dark:border-slate-700">
          <DialogHeader>
            <DialogTitle className="dark:text-slate-200">
              {editingClient ? 'עריכת לקוח' : 'לקוח חדש'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-6 mt-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2 space-y-2">
                <Label className="dark:text-slate-300">{formData.type === 'company' ? 'שם החברה *' : 'שם הלקוח *'}</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  className="dark:bg-slate-900 dark:border-slate-600"
                />
              </div>
              <div className="space-y-2">
                <Label className="dark:text-slate-300">מספר לקוח *</Label>
                <Input
                  value={formData.client_number}
                  onChange={(e) => setFormData({ ...formData, client_number: e.target.value })}
                  placeholder="CL-2024-001"
                  required
                  disabled={!!editingClient} // נועל את השדה אם אנחנו במצב עריכה
                  className="dark:bg-slate-900 dark:border-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="dark:text-slate-300">סוג לקוח *</Label>
                <Select
                  value={formData.type}
                  onValueChange={(v) => setFormData({ ...formData, type: v })}
                >
                  <SelectTrigger className="dark:bg-slate-900 dark:border-slate-600">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
                    {clientTypes.map(type => (
                      <SelectItem key={type.value} value={type.value} className="dark:text-slate-200">
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="dark:text-slate-300">עו"ד מטפל</Label>
                <Select
                  value={formData.assigned_lawyer_id || undefined}
                  onValueChange={(v) => setFormData({ ...formData, assigned_lawyer_id: v })}
                >
                  <SelectTrigger className="dark:bg-slate-900 dark:border-slate-600">
                    <SelectValue placeholder="בחר עו״ד" />
                  </SelectTrigger>
                  <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
                    {users.map(user => (
                      <SelectItem key={user.id} value={user.id} className="dark:text-slate-200">
                        {user.full_name || user.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {formData.type === 'company' && (
              <div className="space-y-2">
                <Label className="dark:text-slate-300">שם איש קשר בחברה</Label>
                <Input
                  value={formData.contact_person_name}
                  onChange={(e) => setFormData({ ...formData, contact_person_name: e.target.value })}
                  placeholder="שם איש הקשר הראשי"
                  className="dark:bg-slate-900 dark:border-slate-600"
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="dark:text-slate-300">אימייל (לפחות אמצעי תקשורת אחד חובה)</Label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="example@domain.com"
                  className="dark:bg-slate-900 dark:border-slate-600"
                />
              </div>
              <div className="space-y-2">
                <Label className="dark:text-slate-300">טלפון (לפחות אמצעי תקשורת אחד חובה)</Label>
                <Input
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="+972-50-1234567"
                  className="dark:bg-slate-900 dark:border-slate-600"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="dark:text-slate-300">תעריף שעתי</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.hourly_rate}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      hourly_rate: parseFloat(e.target.value) || 0,
                    })
                  }
                  className="dark:bg-slate-900 dark:border-slate-600"
                />
              </div>
              <div className="space-y-2">
                <Label className="dark:text-slate-300">מטבע</Label>
                <Select
                  value={formData.billing_currency}
                  onValueChange={(v) => setFormData({ ...formData, billing_currency: v })}
                >
                  <SelectTrigger className="dark:bg-slate-900 dark:border-slate-600">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
                    {currencies.map(curr => (
                      <SelectItem key={curr.value} value={curr.value} className="dark:text-slate-200">
                        {curr.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="dark:text-slate-300">תנאי תשלום</Label>
                <Select
                  value={formData.payment_terms}
                  onValueChange={(v) => setFormData({ ...formData, payment_terms: v })}
                >
                  <SelectTrigger className="dark:bg-slate-900 dark:border-slate-600">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
                    {paymentTerms.map(term => (
                      <SelectItem key={term.value} value={term.value} className="dark:text-slate-200">
                        {term.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="dark:text-slate-300">מדינה</Label>
                <Input
                  value={formData.country}
                  onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                  className="dark:bg-slate-900 dark:border-slate-600"
                />
              </div>
              <div className="space-y-2">
                <Label className="dark:text-slate-300">שפת תקשורת</Label>
                <Select
                  value={formData.communication_language}
                  onValueChange={(v) => setFormData({ ...formData, communication_language: v })}
                >
                  <SelectTrigger className="dark:bg-slate-900 dark:border-slate-600">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
                    <SelectItem value="he" className="dark:text-slate-200">עברית</SelectItem>
                    <SelectItem value="en" className="dark:text-slate-200">אנגלית (English)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="dark:text-slate-300">מספר תאגיד</Label>
                <Input
                  value={formData.registration_number}
                  onChange={(e) =>
                    setFormData({ ...formData, registration_number: e.target.value })
                  }
                  className="dark:bg-slate-900 dark:border-slate-600"
                />
              </div>
              <div className="space-y-2">
                <Label className="dark:text-slate-300">מספר עוסק</Label>
                <Input
                  value={formData.tax_id}
                  onChange={(e) => setFormData({ ...formData, tax_id: e.target.value })}
                  className="dark:bg-slate-900 dark:border-slate-600"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="dark:text-slate-300">כתובת</Label>
              <Input
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="dark:bg-slate-900 dark:border-slate-600"
              />
            </div>

            <div className="space-y-2">
              <Label className="dark:text-slate-300">הערות</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
                className="dark:bg-slate-900 dark:border-slate-600"
              />
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
                className="dark:border-slate-600"
              >
                {t('common.cancel')}
              </Button>
              <Button
                type="submit"
                className="bg-slate-800 hover:bg-slate-700 dark:bg-slate-700"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {editingClient ? 'עדכן' : 'צור'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <ImportExportDialog
        open={isImportExportOpen}
        onOpenChange={setIsImportExportOpen}
        entityType="clients"
        existingData={clients}
        onExport={handleExport}
        onImport={handleImport}
        isLoading={isExporting}
      />
    </div>
  );
}