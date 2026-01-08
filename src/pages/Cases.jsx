import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import PageHeader from '../components/ui/PageHeader';
import DataTable from '../components/ui/DataTable';
import StatusBadge from '../components/ui/StatusBadge';
import EmptyState from '../components/ui/EmptyState';
import {
  Briefcase,
  Search,
  Eye,
  Edit,
  Trash2,
  MoreHorizontal
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

export default function Cases() {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'he';
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCase, setEditingCase] = useState(null);
  const [formData, setFormData] = useState({
    case_number: '',
    title: '',
    case_type: 'patent',
    status: 'draft',
    client_id: '',
    application_number: '',
    filing_date: '',
    territory: 'IL',
    notes: '',
  });

  const caseTypes = [
    { value: 'patent', label: t('cases.type_patent') },
    { value: 'trademark', label: t('cases.type_trademark') },
    { value: 'design', label: t('cases.type_design') },
    { value: 'copyright', label: t('cases.type_copyright') },
    { value: 'litigation', label: t('cases.type_litigation') },
    { value: 'opposition', label: t('cases.type_opposition') },
  ];

  const caseStatuses = [
    { value: 'draft', label: t('cases.status_draft') },
    { value: 'filed', label: t('cases.status_filed') },
    { value: 'pending', label: t('cases.status_pending') },
    { value: 'under_examination', label: t('cases.status_under_examination') },
    { value: 'allowed', label: t('cases.status_allowed') },
    { value: 'registered', label: t('cases.status_registered') },
    { value: 'abandoned', label: t('cases.status_abandoned') },
    { value: 'expired', label: t('cases.status_expired') },
  ];

  const { data: cases = [], isLoading } = useQuery({
    queryKey: ['cases'],
    queryFn: () => base44.entities.Case.list('-created_date', 500),
  });

  const { data: clients = [] } = useQuery({
    queryKey: ['clients'],
    queryFn: () => base44.entities.Client.list('-created_date', 500),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Case.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['cases']);
      setIsDialogOpen(false);
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Case.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['cases']);
      setIsDialogOpen(false);
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Case.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['cases']);
    },
  });

  const resetForm = () => {
    setFormData({
      case_number: '',
      title: '',
      case_type: 'patent',
      status: 'draft',
      client_id: '',
      application_number: '',
      filing_date: '',
      territory: 'IL',
      notes: '',
    });
    setEditingCase(null);
  };

  const openCreateDialog = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const openEditDialog = (caseItem) => {
    setEditingCase(caseItem);
    setFormData({
      case_number: caseItem.case_number || '',
      title: caseItem.title || '',
      case_type: caseItem.case_type || 'patent',
      status: caseItem.status || 'draft',
      client_id: caseItem.client_id || '',
      application_number: caseItem.application_number || '',
      filing_date: caseItem.filing_date || '',
      territory: caseItem.territory || 'IL',
      notes: caseItem.notes || '',
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (editingCase) {
      updateMutation.mutate({ id: editingCase.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const getClientName = (clientId) => {
    const client = clients.find(c => c.id === clientId);
    return client?.name || '-';
  };

  const filteredCases = cases.filter(c => {
    const matchesSearch = c.case_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.application_number?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = filterType === 'all' || c.case_type === filterType;
    const matchesStatus = filterStatus === 'all' || c.status === filterStatus;
    return matchesSearch && matchesType && matchesStatus;
  });

  const columns = [
    {
      header: t('cases.case_number'),
      accessor: 'case_number',
      render: (row) => (
        <span className="font-medium text-slate-800 dark:text-slate-200">{row.case_number}</span>
      ),
    },
    {
      header: t('cases.title_field'),
      accessor: 'title',
      render: (row) => (
        <span className="text-slate-600 dark:text-slate-400 truncate max-w-xs block">{row.title}</span>
      ),
    },
    {
      header: t('cases.client'),
      accessor: 'client_id',
      render: (row) => <span className="dark:text-slate-300">{getClientName(row.client_id)}</span>,
    },
    {
      header: t('cases.type'),
      accessor: 'case_type',
      render: (row) => {
        const type = caseTypes.find(t => t.value === row.case_type);
        return <span className="dark:text-slate-300">{type?.label || row.case_type}</span>;
      },
    },
    {
      header: t('cases.status'),
      accessor: 'status',
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      header: t('cases.filing_date'),
      accessor: 'filing_date',
      render: (row) => <span className="dark:text-slate-300">{row.filing_date ? format(new Date(row.filing_date), 'dd/MM/yyyy') : '-'}</span>,
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
            <DropdownMenuItem asChild className="dark:text-slate-200 dark:hover:bg-slate-700">
              <Link to={createPageUrl(`CaseView?id=${row.id}`)} className="flex items-center gap-2">
                <Eye className="w-4 h-4" />
                {t('cases.view')}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => openEditDialog(row)} className="flex items-center gap-2 dark:text-slate-200 dark:hover:bg-slate-700">
              <Edit className="w-4 h-4" />
              {t('cases.edit')}
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => deleteMutation.mutate(row.id)} 
              className="flex items-center gap-2 text-rose-600 dark:text-rose-400 dark:hover:bg-slate-700"
            >
              <Trash2 className="w-4 h-4" />
              {t('cases.delete')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('cases.title')}
        subtitle={t('cases.cases_count', { count: cases.length })}
        action={openCreateDialog}
        actionLabel={t('cases.new_case')}
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className={`absolute ${isRTL ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400`} />
          <Input
            placeholder={t('cases.search_placeholder')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={`${isRTL ? 'pr-10' : 'pl-10'} bg-white dark:bg-slate-800 dark:border-slate-700`}
          />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-40 bg-white dark:bg-slate-800 dark:border-slate-700">
            <SelectValue placeholder={t('cases.case_type')} />
          </SelectTrigger>
          <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
            <SelectItem value="all" className="dark:text-slate-200">{t('cases.all_types')}</SelectItem>
            {caseTypes.map(type => (
              <SelectItem key={type.value} value={type.value} className="dark:text-slate-200">{type.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-40 bg-white dark:bg-slate-800 dark:border-slate-700">
            <SelectValue placeholder={t('cases.status')} />
          </SelectTrigger>
          <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
            <SelectItem value="all" className="dark:text-slate-200">{t('cases.all_statuses')}</SelectItem>
            {caseStatuses.map(status => (
              <SelectItem key={status.value} value={status.value} className="dark:text-slate-200">{status.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {cases.length === 0 && !isLoading ? (
        <EmptyState
          icon={Briefcase}
          title={t('cases.no_cases')}
          description={t('cases.no_cases_desc')}
          actionLabel={t('cases.add_case')}
          onAction={openCreateDialog}
        />
      ) : (
        <DataTable
          columns={columns}
          data={filteredCases}
          isLoading={isLoading}
          emptyMessage={t('cases.no_results')}
        />
      )}

      {/* Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto dark:bg-slate-800 dark:border-slate-700">
          <DialogHeader>
            <DialogTitle className="dark:text-slate-200">{editingCase ? t('cases.edit_case') : t('cases.new_case')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-6 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="dark:text-slate-300">{t('cases.case_number')} *</Label>
                <Input
                  value={formData.case_number}
                  onChange={(e) => setFormData({ ...formData, case_number: e.target.value })}
                  placeholder="P-2024-001"
                  required
                  className="dark:bg-slate-900 dark:border-slate-600"
                />
              </div>
              <div className="space-y-2">
                <Label className="dark:text-slate-300">{t('cases.type')} *</Label>
                <Select value={formData.case_type} onValueChange={(v) => setFormData({ ...formData, case_type: v })}>
                  <SelectTrigger className="dark:bg-slate-900 dark:border-slate-600">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
                    {caseTypes.map(type => (
                      <SelectItem key={type.value} value={type.value} className="dark:text-slate-200">{type.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="dark:text-slate-300">{t('cases.title_field')} *</Label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                required
                className="dark:bg-slate-900 dark:border-slate-600"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="dark:text-slate-300">{t('cases.client')}</Label>
                <Select value={formData.client_id} onValueChange={(v) => setFormData({ ...formData, client_id: v })}>
                  <SelectTrigger className="dark:bg-slate-900 dark:border-slate-600">
                    <SelectValue placeholder={t('cases.select_client')} />
                  </SelectTrigger>
                  <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
                    {clients.map(client => (
                      <SelectItem key={client.id} value={client.id} className="dark:text-slate-200">{client.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="dark:text-slate-300">{t('cases.status')} *</Label>
                <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                  <SelectTrigger className="dark:bg-slate-900 dark:border-slate-600">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
                    {caseStatuses.map(status => (
                      <SelectItem key={status.value} value={status.value} className="dark:text-slate-200">{status.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="dark:text-slate-300">{t('cases.application_number')}</Label>
                <Input
                  value={formData.application_number}
                  onChange={(e) => setFormData({ ...formData, application_number: e.target.value })}
                  placeholder={t('cases.application_number_placeholder')}
                  className="dark:bg-slate-900 dark:border-slate-600"
                />
              </div>
              <div className="space-y-2">
                <Label className="dark:text-slate-300">{t('cases.filing_date')}</Label>
                <Input
                  type="date"
                  value={formData.filing_date}
                  onChange={(e) => setFormData({ ...formData, filing_date: e.target.value })}
                  className="dark:bg-slate-900 dark:border-slate-600"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="dark:text-slate-300">{t('cases.country')}</Label>
              <Input
                value={formData.territory}
                onChange={(e) => setFormData({ ...formData, territory: e.target.value })}
                placeholder="IL"
                className="dark:bg-slate-900 dark:border-slate-600"
              />
            </div>

            <div className="space-y-2">
              <Label className="dark:text-slate-300">{t('cases.notes')}</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
                className="dark:bg-slate-900 dark:border-slate-600"
              />
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)} className="dark:border-slate-600">
                {t('cases.cancel')}
              </Button>
              <Button 
                type="submit" 
                className="bg-slate-800 hover:bg-slate-700 dark:bg-slate-700"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {editingCase ? t('cases.update') : t('cases.create')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}