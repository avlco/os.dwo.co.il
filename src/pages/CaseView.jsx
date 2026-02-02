import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { format } from 'date-fns';
import StatusBadge from '../components/ui/StatusBadge';
import {
  ArrowRight,
  Calendar,
  FileText,
  Receipt,
  Clock,
  Plus,
  Edit,
  Trash2,
  Cloud,
  AlertTriangle // הוספתי אייקון חסר לדחיפות
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle } from
"@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue } from
"@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import DocumentViewer from '../components/documents/DocumentViewer';
import { useToast } from "@/components/ui/use-toast";
import { useTranslation } from 'react-i18next'; // הוספת תרגום
import { Badge } from "@/components/ui/badge"; // הוספת Badge

// --- הגדרות זהות לקובץ Cases.jsx ---
const caseTypes = [
{ value: 'patent', label: 'פטנט' },
{ value: 'trademark', label: 'סימן מסחר' },
{ value: 'design', label: 'עיצוב' },
{ value: 'copyright', label: 'זכויות יוצרים' },
{ value: 'litigation', label: 'ליטיגציה' },
{ value: 'opposition', label: 'התנגדות' }];


const caseStatuses = [
{ value: 'draft', label: 'טיוטה' },
{ value: 'filed', label: 'הוגש' },
{ value: 'pending', label: 'ממתין' },
{ value: 'under_examination', label: 'בבחינה' },
{ value: 'allowed', label: 'קיבול' },
{ value: 'registered', label: 'רשום' },
{ value: 'abandoned', label: 'זנוח' },
{ value: 'expired', label: 'פג תוקף' }];


const priorityLevels = [
{ value: 'low', label: 'נמוכה', color: 'text-gray-600' },
{ value: 'medium', label: 'בינונית', color: 'text-blue-600' },
{ value: 'high', label: 'גבוהה', color: 'text-orange-600' },
{ value: 'urgent', label: 'דחוף', color: 'text-red-600' }];


const deadlineTypes = [
{ value: 'office_action_response', label: 'תגובה לדו״ח בחינה' },
{ value: 'renewal', label: 'חידוש' },
{ value: 'opposition_response', label: 'תגובה להתנגדות' },
{ value: 'appeal', label: 'ערעור' },
{ value: 'payment', label: 'תשלום' },
{ value: 'filing', label: 'הגשה' },
{ value: 'custom', label: 'אחר' }];


export default function CaseView() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const urlParams = new URLSearchParams(window.location.search);
  const caseId = urlParams.get('id');

  // --- States ---
  const [isDeadlineDialogOpen, setIsDeadlineDialogOpen] = useState(false);
  const [isTimeEntryDialogOpen, setIsTimeEntryDialogOpen] = useState(false);

  // State חדש: דיאלוג עריכת תיק
  const [isEditCaseDialogOpen, setIsEditCaseDialogOpen] = useState(false);

  // --- Forms ---
  const [editCaseForm, setEditCaseForm] = useState({}); // טופס עריכה לתיק
  const [deadlineForm, setDeadlineForm] = useState({
    deadline_type: 'custom',
    description: '',
    due_date: '',
    is_critical: false,
    status: 'pending'
  });
  const [timeEntryForm, setTimeEntryForm] = useState({
    description: '',
    hours: '',
    date_worked: format(new Date(), 'yyyy-MM-dd'),
    is_billable: true,
    rate: 500
  });

  // --- Queries ---
  const { data: caseData, isLoading } = useQuery({
    queryKey: ['case', caseId],
    queryFn: () => base44.entities.Case.filter({ id: caseId }),
    enabled: !!caseId
  });

  const { data: client } = useQuery({
    queryKey: ['client', caseData?.[0]?.client_id],
    queryFn: () => base44.entities.Client.filter({ id: caseData[0].client_id }),
    enabled: !!caseData?.[0]?.client_id
  });

  // נתונים נוספים לטופס העריכה (רשימת לקוחות ועורכי דין)
  const { data: allClients = [] } = useQuery({
    queryKey: ['clients'],
    queryFn: () => base44.entities.Client.list()
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => base44.entities.User.list()
  });

  const { data: deadlines = [] } = useQuery({
    queryKey: ['deadlines', caseId],
    queryFn: () => base44.entities.Deadline.filter({ case_id: caseId }, '-due_date'),
    enabled: !!caseId
  });

  const { data: timeEntries = [] } = useQuery({
    queryKey: ['timeEntries', caseId],
    queryFn: () => base44.entities.TimeEntry.filter({ case_id: caseId }, '-date_worked'),
    enabled: !!caseId
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks', caseId],
    queryFn: () => base44.entities.Task.filter({ case_id: caseId }, '-created_date'),
    enabled: !!caseId
  });

  const currentCase = caseData?.[0];
  const currentClient = client?.[0];

  // --- useEffect: טעינת הנתונים לטופס העריכה ---
  useEffect(() => {
    if (currentCase) {
      setEditCaseForm({
        case_number: currentCase.case_number || '',
        title: currentCase.title || '',
        case_type: currentCase.case_type || 'patent',
        status: currentCase.status || 'draft',
        client_id: currentCase.client_id || '',
        application_number: currentCase.application_number || '',
        filing_date: currentCase.filing_date || '',
        territory: currentCase.territory || 'IL',
        notes: currentCase.notes || '',
        assigned_lawyer_id: currentCase.assigned_lawyer_id || '',
        hourly_rate: currentCase.hourly_rate || '',
        expiry_date: currentCase.expiry_date || '',
        renewal_date: currentCase.renewal_date || '',
        priority_level: currentCase.priority_level || 'medium',
        official_status_date: currentCase.official_status_date || ''
      });
    }
  }, [currentCase]);

  // --- Mutations ---

  // 1. עדכון תיק (החלק החשוב)
  const updateCaseMutation = useMutation({
    mutationFn: (data) => base44.entities.Case.update(caseId, data),
    onSuccess: () => {
      // רענון כפול: גם התיק הספציפי וגם הרשימה
      queryClient.invalidateQueries(['case', caseId]);
      queryClient.invalidateQueries(['cases']);

      setIsEditCaseDialogOpen(false);
      toast({
        title: "התיק עודכן בהצלחה",
        description: "הנתונים נשמרו במערכת"
      });
    },
    onError: (error) => {
      toast({ variant: "destructive", title: "שגיאה", description: error.message });
    }
  });

  const createDeadlineMutation = useMutation({
    mutationFn: (data) => base44.entities.Deadline.create({ ...data, case_id: caseId }),
    onSuccess: () => {
      queryClient.invalidateQueries(['deadlines', caseId]);
      setIsDeadlineDialogOpen(false);
      setDeadlineForm({
        deadline_type: 'custom',
        description: '',
        due_date: '',
        is_critical: false,
        status: 'pending'
      });
    }
  });

  const createTimeEntryMutation = useMutation({
    mutationFn: (data) => base44.entities.TimeEntry.create({ ...data, case_id: caseId }),
    onSuccess: () => {
      queryClient.invalidateQueries(['timeEntries', caseId]);
      setIsTimeEntryDialogOpen(false);
      setTimeEntryForm({
        description: '',
        hours: '',
        date_worked: format(new Date(), 'yyyy-MM-dd'),
        is_billable: true,
        rate: 500
      });
    }
  });

  const deleteDeadlineMutation = useMutation({
    mutationFn: (id) => base44.entities.Deadline.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['deadlines', caseId]);
    }
  });

  // פונקציית השמירה לטופס העריכה
  const handleEditSubmit = (e) => {
    e.preventDefault();
    const submitData = { ...editCaseForm };

    // ניקוי שדות ריקים
    if (!submitData.hourly_rate) submitData.hourly_rate = null;
    if (!submitData.assigned_lawyer_id) submitData.assigned_lawyer_id = null;
    if (!submitData.filing_date) submitData.filing_date = null;
    if (!submitData.expiry_date) submitData.expiry_date = null;
    if (!submitData.renewal_date) submitData.renewal_date = null;
    if (!submitData.official_status_date) submitData.official_status_date = null;

    updateCaseMutation.mutate(submitData);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>);

  }

  if (!currentCase) {
    return (
      <div className="text-center py-16">
        <p className="text-slate-500">תיק לא נמצא</p>
        <Link to={createPageUrl('Cases')}>
          <Button variant="link" className="mt-4">חזרה לרשימת התיקים</Button>
        </Link>
      </div>);

  }

  const totalHours = timeEntries.reduce((sum, t) => sum + (t.hours || 0), 0);
  const totalBillable = timeEntries.
  filter((t) => t.is_billable).
  reduce((sum, t) => sum + (t.hours || 0) * (t.rate || 0), 0);

  // תווית דחיפות
  const priorityInfo = priorityLevels.find((p) => p.value === currentCase.priority_level);

  return (
    <div className="space-y-6 pb-10">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to={createPageUrl('Cases')}>
          <Button variant="ghost" size="icon" className="rounded-xl">
            <ArrowRight className="w-5 h-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-800">{currentCase.case_number}</h1>
            <StatusBadge status={currentCase.status} />
            {priorityInfo &&
            <Badge variant="outline" className={`${priorityInfo.color} border-current ml-2`}>
                {priorityInfo.label}
              </Badge>
            }
          </div>
          <p className="text-slate-500 mt-1">{currentCase.title}</p>
        </div>
        
        {/* כפתור העריכה שונה: פותח דיאלוג במקום לעבור עמוד */}
        <Button variant="outline" className="gap-2" onClick={() => setIsEditCaseDialogOpen(true)}>
          <Edit className="w-4 h-4" />
          {t('common.edit')}
        </Button>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="bg-[#1e293b] pt-6 p-6">
            <p className="text-sm text-slate-500 mb-1">{t('case_view.client_label')}</p>
            <p className="font-medium text-slate-800">{currentClient?.name || '-'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="bg-[#1e293b] pt-6 p-6">
            <p className="text-sm text-slate-500 mb-1">{t('cases.case_type')}</p>
            <p className="font-medium text-slate-800">
              {caseTypes.find((ct) => ct.value === currentCase.case_type)?.label || currentCase.case_type}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="bg-[#1e293b] pt-6 p-6">
            <p className="text-sm text-slate-500 mb-1">{t('case_view.territory_label')}</p>
            <p className="font-medium text-slate-800">{currentCase.territory || '-'}</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="details" className="space-y-6">
        <TabsList className="bg-white dark:bg-slate-800 border dark:border-slate-700">
          <TabsTrigger value="details" className="dark:text-slate-300 dark:data-[state=active]:bg-slate-700">{t('case_view.details_tab')}</TabsTrigger>
          <TabsTrigger value="deadlines" className="dark:text-slate-300 dark:data-[state=active]:bg-slate-700">{t('case_view.events_tab')}</TabsTrigger>
          <TabsTrigger value="tasks" className="dark:text-slate-300 dark:data-[state=active]:bg-slate-700">{t('case_view.tasks_tab')}</TabsTrigger>
          <TabsTrigger value="documents" className="dark:text-slate-300 dark:data-[state=active]:bg-slate-700">
            <Cloud className="w-4 h-4 ml-1" />
            {t('case_view.documents_tab')}
          </TabsTrigger>
          <TabsTrigger value="financials" className="dark:text-slate-300 dark:data-[state=active]:bg-slate-700">{t('case_view.financials_tab')}</TabsTrigger>
        </TabsList>

        <TabsContent value="details">
          <Card>
            <CardHeader className="bg-[#1e293b] p-6 flex flex-col space-y-1.5">
              <CardTitle>{t('case_view.case_details')}</CardTitle>
            </CardHeader>
            <CardContent className="bg-[#1e293b] pt-0 p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <p className="text-sm text-slate-500">{t('case_view.application_number')}</p>
                  <p className="font-medium">{currentCase.application_number || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">{t('case_view.filing_date')}</p>
                  <p className="font-medium">
                    {currentCase.filing_date ? format(new Date(currentCase.filing_date), 'dd/MM/yyyy') : '-'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">{t('case_view.priority_date')}</p>
                  <p className="font-medium">
                    {currentCase.priority_date ? format(new Date(currentCase.priority_date), 'dd/MM/yyyy') : '-'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">{t('case_view.grant_date')}</p>
                  <p className="font-medium">
                    {currentCase.grant_date ? format(new Date(currentCase.grant_date), 'dd/MM/yyyy') : '-'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">{t('case_view.expiry_date')}</p>
                  <p className="font-medium">
                    {currentCase.expiry_date ? format(new Date(currentCase.expiry_date), 'dd/MM/yyyy') : '-'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">{t('case_view.renewal_date')}</p>
                  <p className="font-medium">
                    {currentCase.renewal_date ? format(new Date(currentCase.renewal_date), 'dd/MM/yyyy') : '-'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">{t('case_view.official_status_date')}</p>
                  <p className="font-medium">
                    {currentCase.official_status_date ? format(new Date(currentCase.official_status_date), 'dd/MM/yyyy') : '-'}
                  </p>
                </div>
                <div className="md:col-span-2">
                  <p className="text-sm text-slate-500">{t('case_view.notes_label')}</p>
                  <p className="font-medium whitespace-pre-wrap">{currentCase.notes || '-'}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="deadlines">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-amber-500" />
                {t('case_view.deadlines_header')}
              </CardTitle>
              <Button onClick={() => setIsDeadlineDialogOpen(true)} className="gap-2 bg-slate-800">
                <Plus className="w-4 h-4" />
                {t('case_view.new_deadline')}
              </Button>
            </CardHeader>
            <CardContent>
              {deadlines.length === 0 ?
              <p className="text-center text-slate-400 py-8">{t('case_view.no_deadlines')}</p> :

              <div className="space-y-3">
                  {deadlines.map((deadline) =>
                <div
                  key={deadline.id}
                  className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl">

                      <div className="flex-1">
                        <p className="font-medium text-slate-800">{deadline.description}</p>
                        <p className="text-sm text-slate-500">
                          {format(new Date(deadline.due_date), 'dd/MM/yyyy')}
                        </p>
                      </div>
                      <StatusBadge status={deadline.status} />
                      <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteDeadlineMutation.mutate(deadline.id)}>

                        <Trash2 className="w-4 h-4 text-rose-500" />
                      </Button>
                    </div>
                )}
                </div>
              }
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tasks">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-500" />
                {t('case_view.tasks_header')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {tasks.length === 0 ?
              <p className="text-center text-slate-400 py-8">{t('case_view.no_tasks')}</p> :

              <div className="space-y-3">
                  {tasks.map((task) =>
                <div
                  key={task.id}
                  className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl">

                      <div className="flex-1">
                        <p className="font-medium text-slate-800">{task.title}</p>
                        {task.due_date &&
                    <p className="text-sm text-slate-500">
                            {format(new Date(task.due_date), 'dd/MM/yyyy')}
                          </p>
                    }
                      </div>
                      <StatusBadge status={task.status} />
                      <StatusBadge status={task.priority} />
                    </div>
                )}
                </div>
              }
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documents">
          <DocumentViewer caseId={caseId} />
        </TabsContent>

        <TabsContent value="financials">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-slate-500 mb-1">{t('case_view.total_hours')}</p>
                <p className="text-2xl font-bold text-slate-800">{totalHours.toFixed(1)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-slate-500 mb-1">{t('case_view.total_billable')}</p>
                <p className="text-2xl font-bold text-slate-800">₪{totalBillable.toLocaleString()}</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-emerald-500" />
                {t('case_view.time_entries')}
              </CardTitle>
              <Button onClick={() => setIsTimeEntryDialogOpen(true)} className="gap-2 bg-slate-800">
                <Plus className="w-4 h-4" />
                {t('case_view.new_time_entry')}
              </Button>
            </CardHeader>
            <CardContent>
              {timeEntries.length === 0 ?
              <p className="text-center text-slate-400 py-8">{t('case_view.no_time_entries')}</p> :

              <div className="space-y-3">
                  {timeEntries.map((entry) =>
                <div
                  key={entry.id}
                  className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl">

                      <div className="flex-1">
                        <p className="font-medium text-slate-800">{entry.description}</p>
                        <p className="text-sm text-slate-500">
                          {format(new Date(entry.date_worked), 'dd/MM/yyyy')}
                        </p>
                      </div>
                      <div className="text-left">
                        <p className="font-medium">{entry.hours} {t('case_view.hours_label')}</p>
                        {entry.is_billable &&
                    <p className="text-sm text-emerald-600">₪{((entry.hours || 0) * (entry.rate || 0)).toLocaleString()}</p>
                    }
                      </div>
                    </div>
                )}
                </div>
              }
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit Case Dialog */}
      <Dialog open={isEditCaseDialogOpen} onOpenChange={setIsEditCaseDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('case_view.edit_case_title')} {editCaseForm.case_number}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditSubmit} className="space-y-6 mt-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>{t('case_view.case_number_field')}</Label>
                <Input
                  value={editCaseForm.case_number}
                  onChange={(e) => setEditCaseForm({ ...editCaseForm, case_number: e.target.value })}
                  required />

              </div>
              <div className="space-y-2">
                <Label>{t('case_view.case_type_field')}</Label>
                <Select
                  value={editCaseForm.case_type}
                  onValueChange={(v) => setEditCaseForm({ ...editCaseForm, case_type: v })}>

                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {caseTypes.map((type) =>
                    <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('case_view.priority_field')}</Label>
                <Select
                  value={editCaseForm.priority_level}
                  onValueChange={(v) => setEditCaseForm({ ...editCaseForm, priority_level: v })}>

                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {priorityLevels.map((priority) =>
                    <SelectItem key={priority.value} value={priority.value}>{priority.label}</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label>{t('case_view.case_title_label')}</Label>
              <Input
                value={editCaseForm.title}
                onChange={(e) => setEditCaseForm({ ...editCaseForm, title: e.target.value })}
                required />

            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>{t('case_view.client_label')}</Label>
                <Select
                  value={editCaseForm.client_id || undefined}
                  onValueChange={(v) => setEditCaseForm({ ...editCaseForm, client_id: v })}>

                  <SelectTrigger>
                    <SelectValue placeholder={t('case_view.select_client')} />
                  </SelectTrigger>
                  <SelectContent>
                    {allClients.map((client) =>
                    <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('case_view.assigned_lawyer_label')}</Label>
                <Select
                  value={editCaseForm.assigned_lawyer_id || undefined}
                  onValueChange={(v) => setEditCaseForm({ ...editCaseForm, assigned_lawyer_id: v })}>

                  <SelectTrigger>
                    <SelectValue placeholder={t('case_view.select_lawyer')} />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map((user) =>
                    <SelectItem key={user.id} value={user.id}>{user.full_name || user.email}</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('case_view.status_label')}</Label>
                <Select
                  value={editCaseForm.status}
                  onValueChange={(v) => setEditCaseForm({ ...editCaseForm, status: v })}>

                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {caseStatuses.map((status) =>
                    <SelectItem key={status.value} value={status.value}>{status.label}</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>{t('case_view.application_number_label')}</Label>
                <Input
                  value={editCaseForm.application_number}
                  onChange={(e) => setEditCaseForm({ ...editCaseForm, application_number: e.target.value })} />

              </div>
              <div className="space-y-2">
                <Label>{t('case_view.filing_date_label')}</Label>
                <Input
                  type="date"
                  value={editCaseForm.filing_date || ''}
                  onChange={(e) => setEditCaseForm({ ...editCaseForm, filing_date: e.target.value })} />

              </div>
              <div className="space-y-2">
                <Label>{t('case_view.territory_label')}</Label>
                <Input
                  value={editCaseForm.territory}
                  onChange={(e) => setEditCaseForm({ ...editCaseForm, territory: e.target.value })} />

              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>{t('case_view.expiry_date_label')}</Label>
                <Input
                  type="date"
                  value={editCaseForm.expiry_date || ''}
                  onChange={(e) => setEditCaseForm({ ...editCaseForm, expiry_date: e.target.value })} />

              </div>
              <div className="space-y-2">
                <Label>{t('case_view.renewal_date_label')}</Label>
                <Input
                  type="date"
                  value={editCaseForm.renewal_date || ''}
                  onChange={(e) => setEditCaseForm({ ...editCaseForm, renewal_date: e.target.value })} />

              </div>
              <div className="space-y-2">
                <Label>{t('case_view.official_status_date_label')}</Label>
                <Input
                  type="date"
                  value={editCaseForm.official_status_date || ''}
                  onChange={(e) => setEditCaseForm({ ...editCaseForm, official_status_date: e.target.value })} />

              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('case_view.hourly_rate_optional')}</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={editCaseForm.hourly_rate}
                  onChange={(e) => setEditCaseForm({ ...editCaseForm, hourly_rate: e.target.value })} />

              </div>
            </div>

            <div className="space-y-2">
              <Label>{t('case_view.notes_label')}</Label>
              <Textarea
                value={editCaseForm.notes}
                onChange={(e) => setEditCaseForm({ ...editCaseForm, notes: e.target.value })}
                rows={3} />

            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsEditCaseDialogOpen(false)}>

                {t('common.cancel')}
              </Button>
              <Button
                type="submit"
                className="bg-slate-800"
                disabled={updateCaseMutation.isPending}>

                {t('common.save_changes')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Deadline Dialog */}
      <Dialog open={isDeadlineDialogOpen} onOpenChange={setIsDeadlineDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('case_view.new_deadline')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => {e.preventDefault();createDeadlineMutation.mutate(deadlineForm);}} className="space-y-4">
            <div className="space-y-2">
              <Label>{t('case_view.deadline_type')}</Label>
              <Select value={deadlineForm.deadline_type} onValueChange={(v) => setDeadlineForm({ ...deadlineForm, deadline_type: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {deadlineTypes.map((type) =>
                  <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('case_view.deadline_description')}</Label>
              <Input
                value={deadlineForm.description}
                onChange={(e) => setDeadlineForm({ ...deadlineForm, description: e.target.value })}
                required />

            </div>
            <div className="space-y-2">
              <Label>{t('case_view.deadline_due_date')}</Label>
              <Input
                type="date"
                value={deadlineForm.due_date}
                onChange={(e) => setDeadlineForm({ ...deadlineForm, due_date: e.target.value })}
                required />

            </div>
            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setIsDeadlineDialogOpen(false)}>{t('common.cancel')}</Button>
              <Button type="submit" className="bg-slate-800">{t('common.create')}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Time Entry Dialog */}
      <Dialog open={isTimeEntryDialogOpen} onOpenChange={setIsTimeEntryDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('case_view.time_entries')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => {e.preventDefault();createTimeEntryMutation.mutate({ ...timeEntryForm, hours: parseFloat(timeEntryForm.hours) });}} className="space-y-4">
            <div className="space-y-2">
              <Label>{t('case_view.time_entry_description')}</Label>
              <Textarea
                value={timeEntryForm.description}
                onChange={(e) => setTimeEntryForm({ ...timeEntryForm, description: e.target.value })}
                required />

            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('case_view.time_entry_hours')}</Label>
                <Input
                  type="number"
                  step="0.25"
                  value={timeEntryForm.hours}
                  onChange={(e) => setTimeEntryForm({ ...timeEntryForm, hours: e.target.value })}
                  required />

              </div>
              <div className="space-y-2">
                <Label>{t('case_view.time_entry_date')}</Label>
                <Input
                  type="date"
                  value={timeEntryForm.date_worked}
                  onChange={(e) => setTimeEntryForm({ ...timeEntryForm, date_worked: e.target.value })}
                  required />

              </div>
            </div>
            <div className="space-y-2">
              <Label>{t('case_view.time_entry_rate')}</Label>
              <Input
                type="number"
                value={timeEntryForm.rate}
                onChange={(e) => setTimeEntryForm({ ...timeEntryForm, rate: parseFloat(e.target.value) })} />

            </div>
            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setIsTimeEntryDialogOpen(false)}>{t('common.cancel')}</Button>
              <Button type="submit" className="bg-slate-800">{t('financials.log')}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>);

}