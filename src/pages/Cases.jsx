import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { format } from 'date-fns';
import PageHeader from '../components/ui/PageHeader';
import DataTable from '../components/ui/DataTable';
import StatusBadge from '../components/ui/StatusBadge';
import EmptyState from '../components/ui/EmptyState';
import {
  Briefcase,
  Search,
  Filter,
  Plus,
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

const caseTypes = [
  { value: 'patent', label: 'פטנט' },
  { value: 'trademark', label: 'סימן מסחר' },
  { value: 'design', label: 'עיצוב' },
  { value: 'copyright', label: 'זכויות יוצרים' },
  { value: 'litigation', label: 'ליטיגציה' },
  { value: 'opposition', label: 'התנגדות' },
];

const caseStatuses = [
  { value: 'draft', label: 'טיוטה' },
  { value: 'filed', label: 'הוגש' },
  { value: 'pending', label: 'ממתין' },
  { value: 'under_examination', label: 'בבחינה' },
  { value: 'allowed', label: 'אושר' },
  { value: 'registered', label: 'רשום' },
  { value: 'abandoned', label: 'ננטש' },
  { value: 'expired', label: 'פג תוקף' },
];

export default function Cases() {
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
      header: 'מספר תיק',
      accessor: 'case_number',
      render: (row) => (
        <span className="font-medium text-slate-800">{row.case_number}</span>
      ),
    },
    {
      header: 'כותרת',
      accessor: 'title',
      render: (row) => (
        <span className="text-slate-600 truncate max-w-xs block">{row.title}</span>
      ),
    },
    {
      header: 'לקוח',
      accessor: 'client_id',
      render: (row) => getClientName(row.client_id),
    },
    {
      header: 'סוג',
      accessor: 'case_type',
      render: (row) => {
        const type = caseTypes.find(t => t.value === row.case_type);
        return type?.label || row.case_type;
      },
    },
    {
      header: 'סטטוס',
      accessor: 'status',
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      header: 'תאריך הגשה',
      accessor: 'filing_date',
      render: (row) => row.filing_date ? format(new Date(row.filing_date), 'dd/MM/yyyy') : '-',
    },
    {
      header: '',
      render: (row) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreHorizontal className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link to={createPageUrl(`CaseView?id=${row.id}`)} className="flex items-center gap-2">
                <Eye className="w-4 h-4" />
                צפייה
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => openEditDialog(row)} className="flex items-center gap-2">
              <Edit className="w-4 h-4" />
              עריכה
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => deleteMutation.mutate(row.id)} 
              className="flex items-center gap-2 text-rose-600"
            >
              <Trash2 className="w-4 h-4" />
              מחיקה
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="ניהול תיקים"
        subtitle={`${cases.length} תיקים במערכת`}
        action={openCreateDialog}
        actionLabel="תיק חדש"
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="חיפוש לפי מספר תיק, כותרת..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pr-10 bg-white"
          />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-40 bg-white">
            <SelectValue placeholder="סוג תיק" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">כל הסוגים</SelectItem>
            {caseTypes.map(type => (
              <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-40 bg-white">
            <SelectValue placeholder="סטטוס" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">כל הסטטוסים</SelectItem>
            {caseStatuses.map(status => (
              <SelectItem key={status.value} value={status.value}>{status.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {cases.length === 0 && !isLoading ? (
        <EmptyState
          icon={Briefcase}
          title="אין תיקים במערכת"
          description="התחל על ידי הוספת תיק חדש למערכת"
          actionLabel="הוסף תיק"
          onAction={openCreateDialog}
        />
      ) : (
        <DataTable
          columns={columns}
          data={filteredCases}
          isLoading={isLoading}
          emptyMessage="לא נמצאו תיקים"
        />
      )}

      {/* Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingCase ? 'עריכת תיק' : 'תיק חדש'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-6 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>מספר תיק *</Label>
                <Input
                  value={formData.case_number}
                  onChange={(e) => setFormData({ ...formData, case_number: e.target.value })}
                  placeholder="P-2024-001"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>סוג תיק *</Label>
                <Select value={formData.case_type} onValueChange={(v) => setFormData({ ...formData, case_type: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {caseTypes.map(type => (
                      <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>כותרת *</Label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="שם הנכס"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>לקוח</Label>
                <Select value={formData.client_id} onValueChange={(v) => setFormData({ ...formData, client_id: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="בחר לקוח" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map(client => (
                      <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>סטטוס *</Label>
                <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {caseStatuses.map(status => (
                      <SelectItem key={status.value} value={status.value}>{status.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>מספר בקשה</Label>
                <Input
                  value={formData.application_number}
                  onChange={(e) => setFormData({ ...formData, application_number: e.target.value })}
                  placeholder="מספר בקשה רשמי"
                />
              </div>
              <div className="space-y-2">
                <Label>תאריך הגשה</Label>
                <Input
                  type="date"
                  value={formData.filing_date}
                  onChange={(e) => setFormData({ ...formData, filing_date: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>מדינה</Label>
              <Input
                value={formData.territory}
                onChange={(e) => setFormData({ ...formData, territory: e.target.value })}
                placeholder="IL"
              />
            </div>

            <div className="space-y-2">
              <Label>הערות</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
              />
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                ביטול
              </Button>
              <Button 
                type="submit" 
                className="bg-slate-800 hover:bg-slate-700"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {editingCase ? 'עדכון' : 'יצירה'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}