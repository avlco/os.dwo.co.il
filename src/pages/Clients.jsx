import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useTranslation } from 'react-i18next';
import PageHeader from '../components/ui/PageHeader';
import DataTable from '../components/ui/DataTable';
import EmptyState from '../components/ui/EmptyState';
import {
  Users,
  Search,
  Edit,
  Trash2,
  MoreHorizontal,
  Mail,
  Phone,
  Building2,
  UserCheck
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

export default function Clients() {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'he';
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    type: 'company',
    email: '',
    phone: '',
    address: '',
    country: 'IL',
    registration_number: '',
    tax_id: '',
    payment_terms: 'net_30',
    is_active: true,
    notes: '',
    client_number: '',
    assigned_lawyer_id: '',
    hourly_rate: 800,
    billing_currency: 'ILS',
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

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Client.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['clients']);
      setIsDialogOpen(false);
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Client.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['clients']);
      setIsDialogOpen(false);
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Client.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['clients']);
    },
  });

  const resetForm = () => {
    setFormData({
      name: '',
      type: 'company',
      email: '',
      phone: '',
      address: '',
      country: 'IL',
      registration_number: '',
      tax_id: '',
      payment_terms: 'net_30',
      is_active: true,
      notes: '',
      client_number: '',
      assigned_lawyer_id: '',
      hourly_rate: 800,
      billing_currency: 'ILS',
    });
    setEditingClient(null);
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
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (editingClient) {
      updateMutation.mutate({ id: editingClient.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const getCasesCount = (clientId) => {
    return cases.filter(c => c.client_id === clientId).length;
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
    return matchesSearch && matchesType;
  });

  const columns = [
    {
      header: t('clients.name'),
      accessor: 'name',
      render: (row) => (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
            {row.type === 'company' ? (
              <Building2 className="w-5 h-5 text-slate-500 dark:text-slate-400" />
            ) : (
              <Users className="w-5 h-5 text-slate-500 dark:text-slate-400" />
            )}
          </div>
          <div>
            <p className="font-medium text-slate-800 dark:text-slate-200">{row.name}</p>
            <div className="flex items-center gap-2">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {row.type === 'company' ? t('clients.type_company') : t('clients.type_individual')}
              </p>
              {row.client_number && (
                <Badge variant="outline" className="text-xs">
                  {row.client_number}
                </Badge>
              )}
            </div>
          </div>
        </div>
      ),
    },
    {
      header: t('clients.contact_details'),
      render: (row) => (
        <div className="space-y-1">
          {row.email && (
            <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
              <Mail className="w-3 h-3" />
              {row.email}
            </div>
          )}
          {row.phone && (
            <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
              <Phone className="w-3 h-3" />
              {row.phone}
            </div>
          )}
        </div>
      ),
    },
    {
      header: 'עו"ד מטפל',
      render: (row) => (
        row.assigned_lawyer_id ? (
          <div className="flex items-center gap-2 text-sm">
            <UserCheck className="w-4 h-4 text-blue-600" />
            <span className="dark:text-slate-300">{getLawyerName(row.assigned_lawyer_id)}</span>
          </div>
        ) : (
          <span className="text-slate-400 text-sm">-</span>
        )
      ),
    },
    {
      header: 'תעריף שעתי',
      render: (row) => (
        <span className="dark:text-slate-300 font-mono text-sm">
          {row.hourly_rate ? `${row.hourly_rate} ${row.billing_currency || '₪'}` : '-'}
        </span>
      ),
    },
    {
      header: t('clients.cases_count'),
      render: (row) => (
        <Badge variant="secondary" className="bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
          {getCasesCount(row.id)} תיקים
        </Badge>
      ),
    },
    {
      header: t('clients.status'),
      render: (row) => (
        <Badge variant={row.is_active !== false ? 'default' : 'secondary'} 
          className={row.is_active !== false ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400'}>
          {row.is_active !== false ? t('clients.active') : t('clients.inactive')}
        </Badge>
      ),
    },
    {
      header: '',
      render: (row) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 dark:hover:bg-slate-700">
              <MoreHorizontal className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="dark:bg-slate-800 dark:border-slate-700">
            <DropdownMenuItem onClick={() => openEditDialog(row)} className="flex items-center gap-2 dark:text-slate-200 dark:hover:bg-slate-700">
              <Edit className="w-4 h-4" />
              {t('clients.edit')}
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => deleteMutation.mutate(row.id)} 
              className="flex items-center gap-2 text-rose-600 dark:text-rose-400 dark:hover:bg-slate-700"
            >
              <Trash2 className="w-4 h-4" />
              {t('clients.delete')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('clients.title')}
        subtitle={`${clients.length} לקוחות במערכת`}
        action={openCreateDialog}
        actionLabel={t('clients.new_client')}
      />

      <div className="flex flex-wrap gap-4 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className={`absolute ${isRTL ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400`} />
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
            <SelectItem value="all" className="dark:text-slate-200">{t('clients.all_types')}</SelectItem>
            {clientTypes.map(type => (
              <SelectItem key={type.value} value={type.value} className="dark:text-slate-200">{type.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
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
        />
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto dark:bg-slate-800 dark:border-slate-700">
          <DialogHeader>
            <DialogTitle className="dark:text-slate-200">{editingClient ? 'עריכת לקוח' : 'לקוח חדש'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-6 mt-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2 space-y-2">
                <Label className="dark:text-slate-300">שם הלקוח *</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  className="dark:bg-slate-900 dark:border-slate-600"
                />
              </div>
              <div className="space-y-2">
                <Label className="dark:text-slate-300">מספר לקוח</Label>
                <Input
                  value={formData.client_number}
                  onChange={(e) => setFormData({ ...formData, client_number: e.target.value })}
                  placeholder="CL-2024-001"
                  className="dark:bg-slate-900 dark:border-slate-600"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="dark:text-slate-300">סוג לקוח *</Label>
                <Select value={formData.type} onValueChange={(v) => setFormData({ ...formData, type: v })}>
                  <SelectTrigger className="dark:bg-slate-900 dark:border-slate-600">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
                    {clientTypes.map(type => (
                      <SelectItem key={type.value} value={type.value} className="dark:text-slate-200">{type.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="dark:text-slate-300">עו"ד מטפל</Label>
                <Select value={formData.assigned_lawyer_id} onValueChange={(v) => setFormData({ ...formData, assigned_lawyer_id: v })}>
                  <SelectTrigger className="dark:bg-slate-900 dark:border-slate-600">
                    <SelectValue placeholder="בחר עו״ד" />
                  </SelectTrigger>
                  <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
                    <SelectItem value="" className="dark:text-slate-200">ללא</SelectItem>
                    {users.map(user => (
                      <SelectItem key={user.id} value={user.id} className="dark:text-slate-200">
                        {user.full_name || user.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="dark:text-slate-300">אימייל</Label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="dark:bg-slate-900 dark:border-slate-600"
                />
              </div>
              <div className="space-y-2">
                <Label className="dark:text-slate-300">טלפון</Label>
                <Input
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
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

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="dark:text-slate-300">תעריף שעתי</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.hourly_rate}
                  onChange={(e) => setFormData({ ...formData, hourly_rate: parseFloat(e.target.value) || 0 })}
                  className="dark:bg-slate-900 dark:border-slate-600"
                />
              </div>
              <div className="space-y-2">
                <Label className="dark:text-slate-300">מטבע</Label>
                <Select value={formData.billing_currency} onValueChange={(v) => setFormData({ ...formData, billing_currency: v })}>
                  <SelectTrigger className="dark:bg-slate-900 dark:border-slate-600">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
                    {currencies.map(curr => (
                      <SelectItem key={curr.value} value={curr.value} className="dark:text-slate-200">{curr.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="dark:text-slate-300">תנאי תשלום</Label>
                <Select value={formData.payment_terms} onValueChange={(v) => setFormData({ ...formData, payment_terms: v })}>
                  <SelectTrigger className="dark:bg-slate-900 dark:border-slate-600">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
                    {paymentTerms.map(term => (
                      <SelectItem key={term.value} value={term.value} className="dark:text-slate-200">{term.label}</SelectItem>
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
                <Label className="dark:text-slate-300">מספר תאגיד</Label>
                <Input
                  value={formData.registration_number}
                  onChange={(e) => setFormData({ ...formData, registration_number: e.target.value })}
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
              <Label className="dark:text-slate-300">הערות</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
                className="dark:bg-slate-900 dark:border-slate-600"
              />
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)} className="dark:border-slate-600">
                ביטול
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
    </div>
  );
}
