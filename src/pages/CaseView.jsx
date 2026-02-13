import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '../utils';
import StatusBadge from '../components/ui/StatusBadge';
import { useDateTimeSettings } from '../components/DateTimeSettingsProvider';
import { formatForDateInput } from '../components/utils/dateTimeUtils';
import {
  ArrowRight,
  ArrowLeft,
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
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import DocumentViewer from '../components/documents/DocumentViewer';
import { useToast } from "@/components/ui/use-toast";
import { useTranslation } from 'react-i18next'; // הוספת תרגום
import { Badge } from "@/components/ui/badge"; // הוספת Badge

// --- Case option arrays using translation keys ---
const caseTypeValues = ['patent', 'trademark', 'design', 'copyright', 'litigation', 'opposition'];
const caseStatusValues = ['draft', 'filed', 'pending', 'under_examination', 'allowed', 'registered', 'abandoned', 'expired'];
const priorityColors = { low: 'text-gray-600', medium: 'text-blue-600', high: 'text-orange-600', urgent: 'text-red-600' };
const priorityValues = ['low', 'medium', 'high', 'urgent'];
const deadlineTypeValues = ['office_action_response', 'renewal', 'opposition_response', 'appeal', 'payment', 'filing', 'custom'];

export default function CaseView() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { formatDate, formatDateTime } = useDateTimeSettings();
  const isRTL = i18n.language === 'he';
  const BackIcon = isRTL ? ArrowRight : ArrowLeft;
  const urlParams = new URLSearchParams(window.location.search);
  const caseId = urlParams.get('id');

  // --- States ---
  const [isDeadlineDialogOpen, setIsDeadlineDialogOpen] = useState(false);
  const [isTimeEntryDialogOpen, setIsTimeEntryDialogOpen] = useState(false);
  
  // State חדש: דיאלוג עריכת תיק
  const [isEditCaseDialogOpen, setIsEditCaseDialogOpen] = useState(false);

  // --- Forms ---
  const [editCaseForm, setEditCaseForm] = useState({}); // טופס עריכה לתיק
  const [formErrors, setFormErrors] = useState({});
  const [deadlineForm, setDeadlineForm] = useState({
    deadline_type: 'custom',
    description: '',
    due_date: '',
    is_critical: false,
    status: 'pending',
  });
  const [timeEntryForm, setTimeEntryForm] = useState({
    description: '',
    hours: '',
    date_worked: formatForDateInput(new Date()),
    is_billable: true,
    rate: 500,
  });

  // --- Queries ---
  const { data: caseData, isLoading } = useQuery({
    queryKey: ['case', caseId],
    queryFn: () => base44.entities.Case.filter({ id: caseId }),
    enabled: !!caseId,
  });

  const { data: client } = useQuery({
    queryKey: ['client', caseData?.[0]?.client_id],
    queryFn: () => base44.entities.Client.filter({ id: caseData[0].client_id }),
    enabled: !!caseData?.[0]?.client_id,
  });

  // נתונים נוספים לטופס העריכה (רשימת לקוחות ועורכי דין)
  const { data: allClients = [] } = useQuery({
    queryKey: ['clients'],
    queryFn: () => base44.entities.Client.list(),
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => base44.entities.User.list(),
  });

  const { data: allCases = [] } = useQuery({
    queryKey: ['allCases'],
    queryFn: () => base44.entities.Case.list('-created_date', 500),
  });

  const { data: deadlines = [] } = useQuery({
    queryKey: ['deadlines', caseId],
    queryFn: () => base44.entities.Deadline.filter({ case_id: caseId }, '-due_date'),
    enabled: !!caseId,
  });

  const { data: timeEntries = [] } = useQuery({
    queryKey: ['timeEntries', caseId],
    queryFn: () => base44.entities.TimeEntry.filter({ case_id: caseId }, '-date_worked'),
    enabled: !!caseId,
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks', caseId],
    queryFn: () => base44.entities.Task.filter({ case_id: caseId }, '-created_date'),
    enabled: !!caseId,
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
        official_status_date: currentCase.official_status_date || '',
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
        description: "הנתונים נשמרו במערכת",
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
        status: 'pending',
      });
    },
  });

  const createTimeEntryMutation = useMutation({
    mutationFn: (data) => base44.entities.TimeEntry.create({ ...data, case_id: caseId }),
    onSuccess: () => {
      queryClient.invalidateQueries(['timeEntries', caseId]);
      setIsTimeEntryDialogOpen(false);
      setTimeEntryForm({
        description: '',
        hours: '',
        date_worked: formatForDateInput(new Date()),
        is_billable: true,
        rate: 500,
      });
    },
  });

  const deleteDeadlineMutation = useMutation({
    mutationFn: (id) => base44.entities.Deadline.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['deadlines', caseId]);
    },
  });

  // פונקציית השמירה לטופס העריכה
  const handleEditSubmit = (e) => {
    e.preventDefault();
    
    // Clear previous errors
    setFormErrors({});
    const errors = {};

    // Validate case_number - only digits allowed
    if (!editCaseForm.case_number || editCaseForm.case_number.trim() === '') {
      errors.case_number = 'מספר תיק הוא שדה חובה';
    } else if (!/^[0-9]+$/.test(editCaseForm.case_number)) {
      errors.case_number = 'מספר תיק חייב להכיל ספרות בלבד';
    } else {
      // Check for duplicate case_number (excluding current case)
      const isDuplicateCaseNumber = allCases.some(c =>
        c.case_number === editCaseForm.case_number && c.id !== caseId
      );
      if (isDuplicateCaseNumber) {
        errors.case_number = `מספר תיק "${editCaseForm.case_number}" כבר קיים במערכת`;
      }
    }

    // Validate title
    if (!editCaseForm.title || editCaseForm.title.trim() === '') {
  errors.title = 'שם התיק הוא שדה חובה';
} else {
  const isDuplicateTitle = allCases.some(c =>
    c.title?.toLowerCase() === editCaseForm.title.toLowerCase() && c.id !== caseId
  );
  if (isDuplicateTitle) {
    errors.title = `שם תיק \"${editCaseForm.title}\" כבר קיים במערכת`;
  }
}

    // If there are errors, show them and stop
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      toast({
        variant: "destructive",
        title: "שגיאת ולידציה",
        description: "יש לתקן את השדות המסומנים",
      });
      return;
    }
    
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
      </div>
    );
  }

  if (!currentCase) {
    return (
      <div className="text-center py-16">
        <p className="text-slate-500">תיק לא נמצא</p>
        <Link to={createPageUrl('Cases')}>
          <Button variant="link" className="mt-4">חזרה לרשימת התיקים</Button>
        </Link>
      </div>
    );
  }

  const totalHours = timeEntries.reduce((sum, t) => sum + (t.hours || 0), 0);
  const totalBillable = timeEntries
    .filter(t => t.is_billable)
    .reduce((sum, t) => sum + ((t.hours || 0) * (t.rate || 0)), 0);

  // תווית דחיפות
  const priorityColor = priorityColors[currentCase.priority_level];
  const priorityLabel = currentCase.priority_level ? t(`cases.priority_${currentCase.priority_level}`) : null;

  return (
    <div className="space-y-6 pb-10">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to={createPageUrl('Cases')}>
          <Button variant="ghost" size="icon" className="rounded-xl">
            <BackIcon className="w-5 h-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-200">{currentCase.case_number}</h1>
            <StatusBadge status={currentCase.status} />
            {priorityLabel && (
              <Badge variant="outline" className={`${priorityColor} border-current ${isRTL ? 'mr-2' : 'ml-2'}`}>
                {priorityLabel}
              </Badge>
            )}
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
        <Card className="dark:bg-slate-800 dark:border-slate-700">
          <CardContent className="pt-6">
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">{t('case_view.client_label')}</p>
            <p className="font-medium text-slate-800 dark:text-slate-200">{currentClient?.name || '-'}</p>
          </CardContent>
        </Card>
        <Card className="dark:bg-slate-800 dark:border-slate-700">
          <CardContent className="pt-6">
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">{t('cases.case_type')}</p>
            <p className="font-medium text-slate-800 dark:text-slate-200">
              {currentCase.case_type ? t(`cases.type_${currentCase.case_type}`) : currentCase.case_type}
            </p>
          </CardContent>
        </Card>
        <Card className="dark:bg-slate-800 dark:border-slate-700">
          <CardContent className="pt-6">
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">{t('case_view.territory_label')}</p>
            <p className="font-medium text-slate-800 dark:text-slate-200">{currentCase.territory || '-'}</p>
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
            <Cloud className="w-4 h-4" />
            {t('case_view.documents_tab')}
          </TabsTrigger>
          <TabsTrigger value="financials" className="dark:text-slate-300 dark:data-[state=active]:bg-slate-700">{t('case_view.financials_tab')}</TabsTrigger>
        </TabsList>

        <TabsContent value="details">
          <Card className="dark:bg-slate-800 dark:border-slate-700">
            <CardHeader>
              <CardTitle className="dark:text-slate-100">{t('case_view.case_details')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <p className="text-sm text-slate-500">{t('case_view.application_number')}</p>
                  <p className="font-medium">{currentCase.application_number || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">{t('case_view.filing_date')}</p>
                  <p className="font-medium">
                    {formatDate(currentCase.filing_date)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">{t('case_view.priority_date')}</p>
                  <p className="font-medium">
                    {formatDate(currentCase.priority_date)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">{t('case_view.grant_date')}</p>
                  <p className="font-medium">
                    {formatDate(currentCase.grant_date)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">{t('case_view.expiry_date')}</p>
                  <p className="font-medium">
                    {formatDate(currentCase.expiry_date)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">{t('case_view.renewal_date')}</p>
                  <p className="font-medium">
                    {formatDate(currentCase.renewal_date)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">{t('case_view.official_status_date')}</p>
                  <p className="font-medium">
                    {formatDate(currentCase.official_status_date)}
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
          <Card className="dark:bg-slate-800 dark:border-slate-700">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2 dark:text-slate-100">
                <Calendar className="w-5 h-5 text-amber-500" />
                {t('case_view.deadlines_header')}
              </CardTitle>
              <Button onClick={() => setIsDeadlineDialogOpen(true)} className="gap-2 bg-slate-800">
                <Plus className="w-4 h-4" />
                {t('case_view.new_deadline')}
              </Button>
            </CardHeader>
            <CardContent>
              {deadlines.length === 0 ? (
                <p className="text-center text-slate-400 py-8">{t('case_view.no_deadlines')}</p>
              ) : (
                <div className="space-y-3">
                  {deadlines.map((deadline) => (
                    <div 
  key={deadline.id}
  className="flex items-center gap-4 p-4 bg-slate-50 dark:bg-card rounded-xl"
>
                      <div className="flex-1">
                        <p className="font-medium text-slate-800 dark:text-slate-200">{deadline.description}</p>
                        <p className="text-sm text-slate-500">
                          {formatDate(deadline.due_date)}
                        </p>
                      </div>
                      <StatusBadge status={deadline.status} />
                      <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={() => deleteDeadlineMutation.mutate(deadline.id)}
                      >
                        <Trash2 className="w-4 h-4 text-rose-500" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tasks">
          <Card className="dark:bg-slate-800 dark:border-slate-700">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2 dark:text-slate-100">
                <FileText className="w-5 h-5 text-blue-500" />
                {t('case_view.tasks_header')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {tasks.length === 0 ? (
                <p className="text-center text-slate-400 py-8">{t('case_view.no_tasks')}</p>
              ) : (
                <div className="space-y-3">
                  {tasks.map((task) => (
                    <div 
                      key={task.id}
                      className="flex items-center gap-4 p-4 bg-slate-50 dark:bg-card rounded-xl"
                    >
                      <div className="flex-1">
                        <p className="font-medium text-slate-800 dark:text-slate-200">{task.title}</p>
                        {task.due_date && (
                          <p className="text-sm text-slate-500">
                            {formatDate(task.due_date)}
                          </p>
                        )}
                      </div>
                      <StatusBadge status={task.status} />
                      <StatusBadge status={task.priority} />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documents">
          <DocumentViewer caseId={caseId} />
        </TabsContent>

        <TabsContent value="financials">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <Card className="dark:bg-slate-800 dark:border-slate-700">
              <CardContent className="pt-6">
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">{t('case_view.total_hours')}</p>
                <p className="text-2xl font-bold text-slate-800 dark:text-slate-200">{totalHours.toFixed(1)}</p>
              </CardContent>
            </Card>
            <Card className="dark:bg-slate-800 dark:border-slate-700">
              <CardContent className="pt-6">
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">{t('case_view.total_billable')}</p>
                <p className="text-2xl font-bold text-slate-800 dark:text-slate-200">₪{totalBillable.toLocaleString()}</p>
              </CardContent>
            </Card>
          </div>

          <Card className="dark:bg-slate-800 dark:border-slate-700">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2 dark:text-slate-100">
                <Clock className="w-5 h-5 text-emerald-500" />
                {t('case_view.time_entries')}
              </CardTitle>
              <Button onClick={() => setIsTimeEntryDialogOpen(true)} className="gap-2 bg-slate-800">
                <Plus className="w-4 h-4" />
                {t('case_view.new_time_entry')}
              </Button>
            </CardHeader>
            <CardContent>
              {timeEntries.length === 0 ? (
                <p className="text-center text-slate-400 py-8">{t('case_view.no_time_entries')}</p>
              ) : (
                <div className="space-y-3">
                  {timeEntries.map((entry) => (
                    <div 
                      key={entry.id}
                      className="flex items-center gap-4 p-4 bg-slate-50 dark:bg-card rounded-xl"
                    >
                      <div className="flex-1">
                        <p className="font-medium text-slate-800 dark:text-slate-200">{entry.description}</p>
                        <p className="text-sm text-slate-500">
                          {formatDate(entry.date_worked)}
                        </p>
                      </div>
                      <div className={isRTL ? 'text-right' : 'text-left'}>
                        <p className="font-medium">{entry.hours} {t('case_view.hours_label')}</p>
                        {entry.is_billable && (
                          <p className="text-sm text-emerald-600">₪{((entry.hours || 0) * (entry.rate || 0)).toLocaleString()}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit Case Dialog */}
      <Dialog open={isEditCaseDialogOpen} onOpenChange={setIsEditCaseDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto dark:bg-slate-800 dark:border-slate-700">
          <DialogHeader>
            <DialogTitle>{t('case_view.edit_case_title')} {editCaseForm.case_number}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditSubmit} className="space-y-6 mt-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>{t('case_view.case_number_field')}</Label>
                <Input
                  value={editCaseForm.case_number}
                  onChange={(e) => { setEditCaseForm({ ...editCaseForm, case_number: e.target.value }); setFormErrors(prev => ({...prev, case_number: null})); }}
                  placeholder="12345"
                  required
                  className={formErrors.case_number ? 'border-red-500' : ''}
                />
                {formErrors.case_number && <p className="text-sm text-red-500">{formErrors.case_number}</p>}
              </div>
              <div className="space-y-2">
                <Label>{t('case_view.case_type_field')}</Label>
                <Select
                  value={editCaseForm.case_type}
                  onValueChange={(v) => setEditCaseForm({ ...editCaseForm, case_type: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {caseTypeValues.map(val => (
                      <SelectItem key={val} value={val}>{t(`cases.type_${val}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('case_view.priority_field')}</Label>
                <Select
                  value={editCaseForm.priority_level}
                  onValueChange={(v) => setEditCaseForm({ ...editCaseForm, priority_level: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {priorityValues.map(val => (
                      <SelectItem key={val} value={val}>{t(`cases.priority_${val}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="space-y-2">
<Label>
  {t('case_view.case_title_field', 'שם התיק')} <span className="text-red-500">*</span>
</Label>
              <Input
                value={editCaseForm.title}
                onChange={(e) => { setEditCaseForm({ ...editCaseForm, title: e.target.value }); setFormErrors(prev => ({...prev, title: null})); }}
                required
                className={formErrors.title ? 'border-red-500' : ''}
              />
              {formErrors.title && <p className="text-sm text-red-500">{formErrors.title}</p>}
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>{t('case_view.client_label')}</Label>
                <Select
                  value={editCaseForm.client_id || undefined}
                  onValueChange={(v) => setEditCaseForm({ ...editCaseForm, client_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('case_view.select_client')} />
                  </SelectTrigger>
                  <SelectContent>
                    {allClients.map(client => (
                      <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('case_view.assigned_lawyer_label')}</Label>
                <Select
                  value={editCaseForm.assigned_lawyer_id || undefined}
                  onValueChange={(v) => setEditCaseForm({ ...editCaseForm, assigned_lawyer_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('case_view.select_lawyer')} />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map(user => (
                      <SelectItem key={user.id} value={user.id}>{user.full_name || user.email}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('case_view.status_label')}</Label>
                <Select
                  value={editCaseForm.status}
                  onValueChange={(v) => setEditCaseForm({ ...editCaseForm, status: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {caseStatusValues.map(val => (
                      <SelectItem key={val} value={val}>{t(`cases.status_${val}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>{t('case_view.application_number_label')}</Label>
                <Input
                  value={editCaseForm.application_number}
                  onChange={(e) => setEditCaseForm({ ...editCaseForm, application_number: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('case_view.filing_date_label')}</Label>
                <Input
                  type="date"
                  value={editCaseForm.filing_date || ''}
                  onChange={(e) => setEditCaseForm({ ...editCaseForm, filing_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('case_view.territory_label')}</Label>
                <Input
                  value={editCaseForm.territory}
                  onChange={(e) => setEditCaseForm({ ...editCaseForm, territory: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>{t('case_view.expiry_date_label')}</Label>
                <Input
                  type="date"
                  value={editCaseForm.expiry_date || ''}
                  onChange={(e) => setEditCaseForm({ ...editCaseForm, expiry_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('case_view.renewal_date_label')}</Label>
                <Input
                  type="date"
                  value={editCaseForm.renewal_date || ''}
                  onChange={(e) => setEditCaseForm({ ...editCaseForm, renewal_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('case_view.official_status_date_label')}</Label>
                <Input
                  type="date"
                  value={editCaseForm.official_status_date || ''}
                  onChange={(e) => setEditCaseForm({ ...editCaseForm, official_status_date: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('case_view.hourly_rate_optional')}</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={editCaseForm.hourly_rate}
                  onChange={(e) => setEditCaseForm({ ...editCaseForm, hourly_rate: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
  <Label>{t('case_view.case_description_field', 'תיאור התיק')}</Label>
  <Textarea
    value={editCaseForm.notes}
    onChange={(e) => setEditCaseForm({ ...editCaseForm, notes: e.target.value })}
    rows={2}
    style={{ overflow: 'hidden', resize: 'none' }}
    onInput={(e) => {
      e.target.style.height = 'auto';
      e.target.style.height = `${e.target.scrollHeight}px`;
    }}
  />
</div>

            <div className="flex justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsEditCaseDialogOpen(false)}
              >
                {t('common.cancel')}
              </Button>
              <Button
                type="submit"
                className="bg-slate-800"
                disabled={updateCaseMutation.isPending}
              >
                {t('common.save_changes')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Deadline Dialog */}
      <Dialog open={isDeadlineDialogOpen} onOpenChange={setIsDeadlineDialogOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto dark:bg-slate-800 dark:border-slate-700">
          <DialogHeader>
            <DialogTitle>{t('case_view.new_deadline')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); createDeadlineMutation.mutate(deadlineForm); }} className="space-y-4">
            <div className="space-y-2">
              <Label>{t('case_view.deadline_type')}</Label>
              <Select value={deadlineForm.deadline_type} onValueChange={(v) => setDeadlineForm({ ...deadlineForm, deadline_type: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {deadlineTypeValues.map(val => (
                    <SelectItem key={val} value={val}>{t(`case_view.deadline_type_${val}`, t(`docketing.type_${val}`, val))}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('case_view.deadline_description')}</Label>
              <Input
                value={deadlineForm.description}
                onChange={(e) => setDeadlineForm({ ...deadlineForm, description: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>{t('case_view.deadline_due_date')}</Label>
              <Input
                type="date"
                value={deadlineForm.due_date}
                onChange={(e) => setDeadlineForm({ ...deadlineForm, due_date: e.target.value })}
                required
              />
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
        <DialogContent className="max-h-[85vh] overflow-y-auto dark:bg-slate-800 dark:border-slate-700">
          <DialogHeader>
            <DialogTitle>{t('case_view.time_entries')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); createTimeEntryMutation.mutate({ ...timeEntryForm, hours: parseFloat(timeEntryForm.hours) }); }} className="space-y-4">
            <div className="space-y-2">
              <Label>{t('case_view.time_entry_description')}</Label>
              <Textarea
                value={timeEntryForm.description}
                onChange={(e) => setTimeEntryForm({ ...timeEntryForm, description: e.target.value })}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('case_view.time_entry_hours')}</Label>
                <Input
                  type="number"
                  step="0.25"
                  value={timeEntryForm.hours}
                  onChange={(e) => setTimeEntryForm({ ...timeEntryForm, hours: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>{t('case_view.time_entry_date')}</Label>
                <Input
                  type="date"
                  value={timeEntryForm.date_worked}
                  onChange={(e) => setTimeEntryForm({ ...timeEntryForm, date_worked: e.target.value })}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t('case_view.time_entry_rate')}</Label>
              <Input
                type="number"
                value={timeEntryForm.rate}
                onChange={(e) => setTimeEntryForm({ ...timeEntryForm, rate: parseFloat(e.target.value) })}
              />
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setIsTimeEntryDialogOpen(false)}>{t('common.cancel')}</Button>
              <Button type="submit" className="bg-slate-800">{t('financials.log')}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}