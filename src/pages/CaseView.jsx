import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
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
  Trash2
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

const caseTypes = {
  patent: 'פטנט',
  trademark: 'סימן מסחר',
  design: 'עיצוב',
  copyright: 'זכויות יוצרים',
  litigation: 'ליטיגציה',
  opposition: 'התנגדות',
};

const deadlineTypes = [
  { value: 'office_action_response', label: 'תגובה לדו״ח בחינה' },
  { value: 'renewal', label: 'חידוש' },
  { value: 'opposition_response', label: 'תגובה להתנגדות' },
  { value: 'appeal', label: 'ערעור' },
  { value: 'payment', label: 'תשלום' },
  { value: 'filing', label: 'הגשה' },
  { value: 'custom', label: 'אחר' },
];

export default function CaseView() {
  const queryClient = useQueryClient();
  const urlParams = new URLSearchParams(window.location.search);
  const caseId = urlParams.get('id');

  const [isDeadlineDialogOpen, setIsDeadlineDialogOpen] = useState(false);
  const [isTimeEntryDialogOpen, setIsTimeEntryDialogOpen] = useState(false);
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
    date_worked: format(new Date(), 'yyyy-MM-dd'),
    is_billable: true,
    rate: 500,
  });

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
        date_worked: format(new Date(), 'yyyy-MM-dd'),
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

  const currentCase = caseData?.[0];
  const currentClient = client?.[0];

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

  return (
    <div className="space-y-6">
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
          </div>
          <p className="text-slate-500 mt-1">{currentCase.title}</p>
        </div>
        <Link to={createPageUrl(`Cases`)} state={{ edit: currentCase.id }}>
          <Button variant="outline" className="gap-2">
            <Edit className="w-4 h-4" />
            עריכה
          </Button>
        </Link>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-slate-500 mb-1">לקוח</p>
            <p className="font-medium text-slate-800">{currentClient?.name || '-'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-slate-500 mb-1">סוג תיק</p>
            <p className="font-medium text-slate-800">{caseTypes[currentCase.case_type] || currentCase.case_type}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-slate-500 mb-1">מדינה</p>
            <p className="font-medium text-slate-800">{currentCase.territory || '-'}</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="details" className="space-y-6">
        <TabsList className="bg-white border">
          <TabsTrigger value="details">פרטים</TabsTrigger>
          <TabsTrigger value="deadlines">מועדים</TabsTrigger>
          <TabsTrigger value="tasks">משימות</TabsTrigger>
          <TabsTrigger value="financials">כספים</TabsTrigger>
        </TabsList>

        <TabsContent value="details">
          <Card>
            <CardHeader>
              <CardTitle>פרטי התיק</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <p className="text-sm text-slate-500">מספר בקשה</p>
                  <p className="font-medium">{currentCase.application_number || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">תאריך הגשה</p>
                  <p className="font-medium">
                    {currentCase.filing_date ? format(new Date(currentCase.filing_date), 'dd/MM/yyyy') : '-'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">תאריך קדימות</p>
                  <p className="font-medium">
                    {currentCase.priority_date ? format(new Date(currentCase.priority_date), 'dd/MM/yyyy') : '-'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">תאריך רישום</p>
                  <p className="font-medium">
                    {currentCase.grant_date ? format(new Date(currentCase.grant_date), 'dd/MM/yyyy') : '-'}
                  </p>
                </div>
                <div className="md:col-span-2">
                  <p className="text-sm text-slate-500">הערות</p>
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
                מועדים
              </CardTitle>
              <Button onClick={() => setIsDeadlineDialogOpen(true)} className="gap-2 bg-slate-800">
                <Plus className="w-4 h-4" />
                מועד חדש
              </Button>
            </CardHeader>
            <CardContent>
              {deadlines.length === 0 ? (
                <p className="text-center text-slate-400 py-8">אין מועדים</p>
              ) : (
                <div className="space-y-3">
                  {deadlines.map((deadline) => (
                    <div 
                      key={deadline.id}
                      className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl"
                    >
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
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-500" />
                משימות
              </CardTitle>
            </CardHeader>
            <CardContent>
              {tasks.length === 0 ? (
                <p className="text-center text-slate-400 py-8">אין משימות</p>
              ) : (
                <div className="space-y-3">
                  {tasks.map((task) => (
                    <div 
                      key={task.id}
                      className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl"
                    >
                      <div className="flex-1">
                        <p className="font-medium text-slate-800">{task.title}</p>
                        {task.due_date && (
                          <p className="text-sm text-slate-500">
                            {format(new Date(task.due_date), 'dd/MM/yyyy')}
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

        <TabsContent value="financials">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-slate-500 mb-1">סה״כ שעות</p>
                <p className="text-2xl font-bold text-slate-800">{totalHours.toFixed(1)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-slate-500 mb-1">סה״כ לחיוב</p>
                <p className="text-2xl font-bold text-slate-800">₪{totalBillable.toLocaleString()}</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-emerald-500" />
                רישום שעות
              </CardTitle>
              <Button onClick={() => setIsTimeEntryDialogOpen(true)} className="gap-2 bg-slate-800">
                <Plus className="w-4 h-4" />
                רישום חדש
              </Button>
            </CardHeader>
            <CardContent>
              {timeEntries.length === 0 ? (
                <p className="text-center text-slate-400 py-8">אין רישומי שעות</p>
              ) : (
                <div className="space-y-3">
                  {timeEntries.map((entry) => (
                    <div 
                      key={entry.id}
                      className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl"
                    >
                      <div className="flex-1">
                        <p className="font-medium text-slate-800">{entry.description}</p>
                        <p className="text-sm text-slate-500">
                          {format(new Date(entry.date_worked), 'dd/MM/yyyy')}
                        </p>
                      </div>
                      <div className="text-left">
                        <p className="font-medium">{entry.hours} שעות</p>
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

      {/* Deadline Dialog */}
      <Dialog open={isDeadlineDialogOpen} onOpenChange={setIsDeadlineDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>מועד חדש</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); createDeadlineMutation.mutate(deadlineForm); }} className="space-y-4">
            <div className="space-y-2">
              <Label>סוג מועד</Label>
              <Select value={deadlineForm.deadline_type} onValueChange={(v) => setDeadlineForm({ ...deadlineForm, deadline_type: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {deadlineTypes.map(type => (
                    <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>תיאור</Label>
              <Input
                value={deadlineForm.description}
                onChange={(e) => setDeadlineForm({ ...deadlineForm, description: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>תאריך יעד</Label>
              <Input
                type="date"
                value={deadlineForm.due_date}
                onChange={(e) => setDeadlineForm({ ...deadlineForm, due_date: e.target.value })}
                required
              />
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setIsDeadlineDialogOpen(false)}>ביטול</Button>
              <Button type="submit" className="bg-slate-800">יצירה</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Time Entry Dialog */}
      <Dialog open={isTimeEntryDialogOpen} onOpenChange={setIsTimeEntryDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>רישום שעות</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); createTimeEntryMutation.mutate({ ...timeEntryForm, hours: parseFloat(timeEntryForm.hours) }); }} className="space-y-4">
            <div className="space-y-2">
              <Label>תיאור פעילות</Label>
              <Textarea
                value={timeEntryForm.description}
                onChange={(e) => setTimeEntryForm({ ...timeEntryForm, description: e.target.value })}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>שעות</Label>
                <Input
                  type="number"
                  step="0.25"
                  value={timeEntryForm.hours}
                  onChange={(e) => setTimeEntryForm({ ...timeEntryForm, hours: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>תאריך</Label>
                <Input
                  type="date"
                  value={timeEntryForm.date_worked}
                  onChange={(e) => setTimeEntryForm({ ...timeEntryForm, date_worked: e.target.value })}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>תעריף שעתי</Label>
              <Input
                type="number"
                value={timeEntryForm.rate}
                onChange={(e) => setTimeEntryForm({ ...timeEntryForm, rate: parseFloat(e.target.value) })}
              />
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setIsTimeEntryDialogOpen(false)}>ביטול</Button>
              <Button type="submit" className="bg-slate-800">רישום</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}