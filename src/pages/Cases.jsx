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
  MoreHorizontal,
  UserCheck,
  Calendar,
  AlertTriangle
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

export default function Cases() {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'he';
  const queryClient = useQueryClient();
  const { toast } = useToast();
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
    assigned_lawyer_id: '',
    hourly_rate: '',
    expiry_date: '',
    renewal_date: '',
    priority_level: 'medium',
    official_status_date: '',
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

  const priorityLevels = [
    { value: 'low', label: 'נמוכה', color: 'text-gray-600' },
    { value: 'medium', label: 'בינונית', color: 'text-blue-600' },
    { value: 'high', label: 'גבוהה', color: 'text-orange-600' },
    { value: 'urgent', label: 'דחוף', color: 'text-red-600' },
  ];

  const { data: cases = [], isLoading } = useQuery({
    queryKey: ['cases'],
    queryFn: () => base44.entities.Case.list('-created_date', 500),
  });

  const { data: clients = [] } = useQuery({
    queryKey: ['clients'],
    queryFn: () => base44.entities.Client.list('-created_date', 500),
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
    mutationFn: (data) => base44.entities.Case.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['cases']);
      setIsDialogOpen(false);
      resetForm();
      toast({
        title: "התיק נוסף בהצלחה",
        description: `התיק "${formData.case_number}" נוצר במערכת`,
      });
    },
    onError: (error) => {
      console.error('Failed to create case:', error);
      toast({
        variant: "destructive",
        title: "שגיאה ביצירת תיק",
        description: error.message || "אנא נסה שנית או פנה לתמיכה",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Case.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['cases']);
      setIsDialogOpen(false);
      resetForm();
      toast({
        title: "התיק עודכן בהצלחה",
        description: "השינויים נשמרו במערכת",
      });
    },
    onError: (error) => {
      console.error('Failed to update case:', error);
      toast({
        variant: "destructive",
        title: "שגיאה בעדכון תיק",
        description: error.message || "אנא נסה שנית",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Case.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['cases']);
      toast({
        title: "התיק נמחק בהצלחה",
        description: "התיק הוסר מהמערכת",
      });
    },
    onError: (error) => {
      console.error('Failed to delete case:', error);
      toast({
        variant: "destructive",
        title: "שגיאה במחיקת תיק",
        description: error.message || "אנא נסה שנית",
      });
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
      assigned_lawyer_id: '',
      hourly_rate: '',
      expiry_date: '',
      renewal_date: '',
      priority_level: 'medium',
      official_status_date: '',
    });
    setEditingCase(null);
  };

  const validateCaseForm = (data) => {
    const errors = [];

    // Required fields
    if (!data.case_number || data.case_number.trim() === '') {
      errors.push('מספר תיק הוא שדה חובה');
    }

    if (!data.title || data.title.trim() === '') {
      errors.push('נושא התיק הוא שדה חובה');
    }

    // Date logic validation
    if (data.filing_date && data.renewal_date) {
      const filing = new Date(data.filing_date);
      const renewal = new Date(data.renewal_date);

      if (renewal <= filing) {
        errors.push('תאריך חידוש חייב להיות אחרי תאריך ההגשה');
      }
    }

    if (data.filing_date && data.expiry_date) {
      const filing = new Date(data.filing_date);
      const expiry = new Date(data.expiry_date);

      if (expiry <= filing) {
        errors.push('תאריך פקיעה חייב להיות אחרי תאריך ההגשה');
      }
    }

    // Hourly rate validation
    if (data.hourly_rate && parseFloat(data.hourly_rate) < 0) {
      errors.push('תעריף שעתי חייב להיות מספר חיובי');
    }

    return errors;
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
      assigned_lawyer_id: caseItem.assigned_lawyer_id || '',
      hourly_rate: caseItem.hourly_rate || '',
      expiry_date: caseItem.expiry_date || '',
      renewal_date: caseItem.renewal_date || '',
      priority_level: caseItem.priority_level || 'medium',
      official_status_date: caseItem.official_status_date || '',
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    // Validate form
    const validationErrors = validateCaseForm(formData);

    if (validationErrors.length > 0) {
      toast({
        variant: "destructive",
        title: "שגיאת ולידציה",
        description: validationErrors.join(', '),
      });
      return;
    }

    // Check uniqueness of case_number
    const isDuplicate = cases.some(c =>
      c.case_number === formData.case_number &&
      (!editingCase || c.id !== editingCase.id)
    );

    if (isDuplicate) {
      toast({
        variant: "destructive",
        title: "מספר תיק כבר קיים",
        description: `קיים כבר תיק במספר "${formData.case_number}"`,
      });
      return;
    }

    const submitData = { ...formData };

    // Convert empty strings to null for optional fields
    if (!submitData.hourly_rate) submitData.hourly_rate = null;
    if (!submitData.assigned_lawyer_id) submitData.assigned_lawyer_id = null;
    if (!submitData.client_id) submitData.client_id = null;
    if (!submitData.filing_date || submitData.filing_date === '') submitData.filing_date = null;
    if (!submitData.expiry_date || submitData.expiry_date === '') submitData.expiry_date = null;
    if (!submitData.renewal_date || submitData.renewal_date === '') submitData.renewal_date = null;
    if (!submitData.official_status_date || submitData.official_status_date === '') submitData.official_status_date = null;

    if (editingCase) {
      updateMutation.mutate({ id: editingCase.id, data: submitData });
    } else {
      createMutation.mutate(submitData);
    }
  };

  const getClientName = (clientId) => {
    const client = clients.find(c => c.id === clientId);
    return client?.name || '-';
  };

  const getLawyerName = (lawyerId) => {
    const lawyer = users.find(u => u.id === lawyerId);
    return lawyer?.full_name || lawyer?.email || '-';
  };

  const getPriorityLabel = (level) => {
    const priority = priorityLevels.find(p => p.value === level);
    return priority?.label || level;
  };

  const getPriorityColor = (level) => {
    const priority = priorityLevels.find(p => p.value === level);
    return priority?.color || 'text-gray-600';
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
      cell: ({ row }) => {
        const r = row.original;
        return (
          <div>
            <span className="font-medium text-slate-800 dark:text-slate-200">{r.case_number}</span>
            {r.priority_level && r.priority_level !== 'medium' && r.priority_level !== 'low' && (
              <div className="flex items-center gap-1 mt-1">
                <AlertTriangle className={`w-3 h-3 ${getPriorityColor(r.priority_level)}`} />
                <span className={`text-xs ${getPriorityColor(r.priority_level)}`}>
                  {getPriorityLabel(r.priority_level)}
                </span>
              </div>
            )}
          </div>
        );
      },
    },
    {
      header: t('cases.title_field'),
      accessor: 'title',
      cell: ({ row }) => (
        <span className="text-slate-600 dark:text-slate-400 truncate max-w-xs block">
          {row.original.title}
        </span>
      ),
    },
    {
      header: t('cases.client'),
      accessor: 'client_id',
      cell: ({ row }) => (
        <span className="dark:text-slate-300">
          {getClientName(row.original.client_id)}
        </span>
      ),
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
      header: t('cases.type'),
      accessor: 'case_type',
      cell: ({ row }) => {
        const r = row.original;
        const type = caseTypes.find(t => t.value === r.case_type);
        return <span className="dark:text-slate-300">{type?.label || r.case_type}</span>;
      },
    },
    {
      header: t('cases.status'),
      accessor: 'status',
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      id: 'deadlines',
      header: 'מועדים',
      cell: ({ row }) => {
        const r = row.original;
        return (
          <div className="space-y-1 text-xs">
            {r.expiry_date && (
              <div className="flex items-center gap-1 text-orange-600">
                <Calendar className="w-3 h-3" />
                <span>פקיעה: {format(new Date(r.expiry_date), 'dd/MM/yyyy')}</span>
              </div>
            )}
            {r.renewal_date && (
              <div className="flex items-center gap-1 text-blue-600">
                <Calendar className="w-3 h-3" />
                <span>חידוש: {format(new Date(r.renewal_date), 'dd/MM/yyyy')}</span>
              </div>
            )}
            {!r.expiry_date && !r.renewal_date && (
              <span className="text-slate-400">-</span>
            )}
          </div>
        );
      },
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        const r = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 dark:hover:bg-slate-700">
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="dark:bg-slate-800 dark:border-slate-700">
              <DropdownMenuItem asChild className="dark:text-slate-200 dark:hover:bg-slate-700">
                <Link to={createPageUrl(`CaseView?id=${r.id}`)} className="flex items-center gap-2">
                  <Eye className="w-4 h-4" />
                  {t('cases.view')}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => openEditDialog(r)}
                className="flex items-center gap-2 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <Edit className="w-4 h-4" />
                {t('cases.edit')}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => deleteMutation.mutate(r.id)}
                className="flex items-center gap-2 text-rose-600 dark:text-rose-400 dark:hover:bg-slate-700"
              >
                <Trash2 className="w-4 h-4" />
                {t('cases.delete')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('cases.title')}
        subtitle={`${cases.length} תיקים במערכת`}
        action={openCreateDialog}
        actionLabel={t('cases.new_case')}
      />

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
              <SelectItem key={type.value} value={type.value} className="dark:text-slate-200">
                {type.label}
              </SelectItem>
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
              <SelectItem key={status.value} value={status.value} className="dark:text-slate-200">
                {status.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

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

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto dark:bg-slate-800 dark:border-slate-700">
          <DialogHeader>
            <DialogTitle className="dark:text-slate-200">
              {editingCase ? 'עריכת תיק' : 'תיק חדש'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-6 mt-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="dark:text-slate-300">מספר תיק *</Label>
                <Input
                  value={formData.case_number}
                  onChange={(e) => setFormData({ ...formData, case_number: e.target.value })}
                  placeholder="P-2024-001"
                  required
                  className="dark:bg-slate-900 dark:border-slate-600"
                />
              </div>
              <div className="space-y-2">
                <Label className="dark:text-slate-300">סוג תיק *</Label>
                <Select
                  value={formData.case_type}
                  onValueChange={(v) => setFormData({ ...formData, case_type: v })}
                >
                  <SelectTrigger className="dark:bg-slate-900 dark:border-slate-600">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
                    {caseTypes.map(type => (
                      <SelectItem key={type.value} value={type.value} className="dark:text-slate-200">
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="dark:text-slate-300">דחיפות</Label>
                <Select
                  value={formData.priority_level}
                  onValueChange={(v) => setFormData({ ...formData, priority_level: v })}
                >
                  <SelectTrigger className="dark:bg-slate-900 dark:border-slate-600">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
                    {priorityLevels.map(priority => (
                      <SelectItem
                        key={priority.value}
                        value={priority.value}
                        className="dark:text-slate-200"
                      >
                        {priority.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="dark:text-slate-300">נושא התיק / תיאור המצאה *</Label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="לדוגמה: שיטה לזיהוי פנים באמצעות AI"
                required
                className="dark:bg-slate-900 dark:border-slate-600"
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="dark:text-slate-300">לקוח</Label>
                <Select
                  value={formData.client_id || undefined}
                  onValueChange={(v) => setFormData({ ...formData, client_id: v })}
                >
                  <SelectTrigger className="dark:bg-slate-900 dark:border-slate-600">
                    <SelectValue placeholder="בחר לקוח" />
                  </SelectTrigger>
                  <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
                    {clients.map(client => (
                      <SelectItem key={client.id} value={client.id} className="dark:text-slate-200">
                        {client.name}
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
              <div className="space-y-2">
                <Label className="dark:text-slate-300">סטטוס *</Label>
                <Select
                  value={formData.status}
                  onValueChange={(v) => setFormData({ ...formData, status: v })}
                >
                  <SelectTrigger className="dark:bg-slate-900 dark:border-slate-600">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
                    {caseStatuses.map(status => (
                      <SelectItem key={status.value} value={status.value} className="dark:text-slate-200">
                        {status.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="dark:text-slate-300">מספר בקשה רשמי</Label>
                <Input
                  value={formData.application_number}
                  onChange={(e) => setFormData({ ...formData, application_number: e.target.value })}
                  placeholder="IL123456"
                  className="dark:bg-slate-900 dark:border-slate-600"
                />
              </div>
              <div className="space-y-2">
                <Label className="dark:text-slate-300">תאריך הגשה</Label>
                <Input
                  type="date"
                  value={formData.filing_date}
                  onChange={(e) => setFormData({ ...formData, filing_date: e.target.value })}
                  className="dark:bg-slate-900 dark:border-slate-600"
                />
              </div>
              <div className="space-y-2">
                <Label className="dark:text-slate-300">מדינה</Label>
                <Input
                  value={formData.territory}
                  onChange={(e) => setFormData({ ...formData, territory: e.target.value })}
                  placeholder="IL"
                  className="dark:bg-slate-900 dark:border-slate-600"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="dark:text-slate-300">מועד פקיעה</Label>
                <Input
                  type="date"
                  value={formData.expiry_date}
                  onChange={(e) => setFormData({ ...formData, expiry_date: e.target.value })}
                  className="dark:bg-slate-900 dark:border-slate-600"
                />
              </div>
              <div className="space-y-2">
                <Label className="dark:text-slate-300">מועד חידוש</Label>
                <Input
                  type="date"
                  value={formData.renewal_date}
                  onChange={(e) => setFormData({ ...formData, renewal_date: e.target.value })}
                  className="dark:bg-slate-900 dark:border-slate-600"
                />
              </div>
              <div className="space-y-2">
                <Label className="dark:text-slate-300">תעריף שעתי (אופציונלי)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.hourly_rate}
                  onChange={(e) => setFormData({ ...formData, hourly_rate: e.target.value })}
                  placeholder="800"
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
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
                className="dark:border-slate-600"
              >
                ביטול
              </Button>
              <Button
                type="submit"
                className="bg-slate-800 hover:bg-slate-700 dark:bg-slate-700"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {editingCase ? 'עדכן' : 'צור'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
