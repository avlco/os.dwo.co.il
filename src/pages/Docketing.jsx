import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, isToday, isBefore } from 'date-fns';
import { he } from 'date-fns/locale';
import PageHeader from '../components/ui/PageHeader';
import StatusBadge from '../components/ui/StatusBadge';
import {
  Calendar,
  ChevronRight,
  ChevronLeft,
  Plus,
  Clock,
  AlertTriangle
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const deadlineTypes = [
  { value: 'office_action_response', label: 'תגובה לדו״ח בחינה' },
  { value: 'renewal', label: 'חידוש' },
  { value: 'opposition_response', label: 'תגובה להתנגדות' },
  { value: 'appeal', label: 'ערעור' },
  { value: 'payment', label: 'תשלום' },
  { value: 'filing', label: 'הגשה' },
  { value: 'custom', label: 'אחר' },
];

export default function Docketing() {
  const queryClient = useQueryClient();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    case_id: '',
    deadline_type: 'custom',
    description: '',
    due_date: '',
    reminder_date_1: '',
    reminder_date_2: '',
    is_critical: false,
    status: 'pending',
  });

  const { data: deadlines = [], isLoading } = useQuery({
    queryKey: ['deadlines'],
    queryFn: () => base44.entities.Deadline.list('-due_date', 500),
  });

  const { data: cases = [] } = useQuery({
    queryKey: ['cases'],
    queryFn: () => base44.entities.Case.list('-created_date', 500),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Deadline.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['deadlines']);
      setIsDialogOpen(false);
      resetForm();
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }) => base44.entities.Deadline.update(id, { status, completed_at: status === 'completed' ? new Date().toISOString() : null }),
    onSuccess: () => {
      queryClient.invalidateQueries(['deadlines']);
    },
  });

  const resetForm = () => {
    setFormData({
      case_id: '',
      deadline_type: 'custom',
      description: '',
      due_date: '',
      reminder_date_1: '',
      reminder_date_2: '',
      is_critical: false,
      status: 'pending',
    });
  };

  const openCreateDialog = (date = null) => {
    resetForm();
    if (date) {
      setFormData(prev => ({ ...prev, due_date: format(date, 'yyyy-MM-dd') }));
    }
    setIsDialogOpen(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    createMutation.mutate(formData);
  };

  const getCaseNumber = (caseId) => {
    const caseItem = cases.find(c => c.id === caseId);
    return caseItem?.case_number || '-';
  };

  // Calendar logic
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Get day of week for first day (0 = Sunday, 6 = Saturday)
  const startDay = monthStart.getDay();
  // In Hebrew calendar, week starts on Sunday
  const paddingDays = startDay;

  const getDeadlinesForDate = (date) => {
    return deadlines.filter(d => isSameDay(new Date(d.due_date), date));
  };

  const today = new Date();
  const upcomingDeadlines = deadlines
    .filter(d => d.status !== 'completed' && new Date(d.due_date) >= today)
    .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))
    .slice(0, 10);

  const overdueDeadlines = deadlines
    .filter(d => d.status !== 'completed' && isBefore(new Date(d.due_date), today))
    .sort((a, b) => new Date(a.due_date) - new Date(b.due_date));

  const weekDays = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

  return (
    <div className="space-y-6">
      <PageHeader
        title="יומן מועדים"
        subtitle="ניהול מועדים ותזכורות"
        action={() => openCreateDialog()}
        actionLabel="מועד חדש"
      />

      <Tabs defaultValue="calendar" className="space-y-6">
        <TabsList className="bg-white border">
          <TabsTrigger value="calendar">לוח שנה</TabsTrigger>
          <TabsTrigger value="list">רשימה</TabsTrigger>
        </TabsList>

        <TabsContent value="calendar">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Calendar */}
            <div className="lg:col-span-2">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-lg font-semibold">
                    {format(currentMonth, 'MMMM yyyy', { locale: he })}
                  </CardTitle>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Week days header */}
                  <div className="grid grid-cols-7 gap-1 mb-2">
                    {weekDays.map(day => (
                      <div key={day} className="text-center text-sm font-medium text-slate-500 py-2">
                        {day}
                      </div>
                    ))}
                  </div>
                  
                  {/* Calendar grid */}
                  <div className="grid grid-cols-7 gap-1">
                    {/* Padding days */}
                    {[...Array(paddingDays)].map((_, i) => (
                      <div key={`padding-${i}`} className="aspect-square p-1" />
                    ))}
                    
                    {/* Actual days */}
                    {daysInMonth.map((day) => {
                      const dayDeadlines = getDeadlinesForDate(day);
                      const hasDeadlines = dayDeadlines.length > 0;
                      const hasCritical = dayDeadlines.some(d => d.is_critical);
                      const hasOverdue = dayDeadlines.some(d => d.status !== 'completed' && isBefore(day, today));
                      
                      return (
                        <button
                          key={day.toISOString()}
                          onClick={() => {
                            setSelectedDate(day);
                            if (dayDeadlines.length === 0) {
                              openCreateDialog(day);
                            }
                          }}
                          className={`
                            aspect-square p-1 rounded-lg text-sm transition-colors relative
                            ${isToday(day) ? 'bg-slate-800 text-white' : 'hover:bg-slate-100'}
                            ${!isSameMonth(day, currentMonth) ? 'text-slate-300' : ''}
                          `}
                        >
                          <span className="block">{format(day, 'd')}</span>
                          {hasDeadlines && (
                            <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex gap-0.5">
                              {hasOverdue ? (
                                <div className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                              ) : hasCritical ? (
                                <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                              ) : (
                                <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                              )}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Sidebar - Selected date or upcoming */}
            <div className="space-y-6">
              {selectedDate && getDeadlinesForDate(selectedDate).length > 0 ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Calendar className="w-5 h-5 text-blue-500" />
                      {format(selectedDate, 'dd MMMM yyyy', { locale: he })}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {getDeadlinesForDate(selectedDate).map(deadline => (
                      <div key={deadline.id} className="p-3 bg-slate-50 rounded-xl">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-medium text-slate-800">{deadline.description}</p>
                            <p className="text-sm text-slate-500 mt-1">{getCaseNumber(deadline.case_id)}</p>
                          </div>
                          <StatusBadge status={deadline.is_critical ? 'critical' : deadline.status} />
                        </div>
                        {deadline.status !== 'completed' && (
                          <Button 
                            size="sm" 
                            variant="outline" 
                            className="mt-3 w-full"
                            onClick={() => updateStatusMutation.mutate({ id: deadline.id, status: 'completed' })}
                          >
                            סמן כהושלם
                          </Button>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Clock className="w-5 h-5 text-amber-500" />
                      מועדים קרובים
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {upcomingDeadlines.length === 0 ? (
                      <p className="text-center text-slate-400 py-4">אין מועדים קרובים</p>
                    ) : (
                      upcomingDeadlines.map(deadline => (
                        <div key={deadline.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                          <div className="w-10 h-10 rounded-lg bg-amber-100 flex flex-col items-center justify-center text-xs">
                            <span className="font-bold text-amber-700">{format(new Date(deadline.due_date), 'd')}</span>
                            <span className="text-amber-600">{format(new Date(deadline.due_date), 'MMM', { locale: he })}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-slate-800 truncate">{deadline.description}</p>
                            <p className="text-xs text-slate-500">{getCaseNumber(deadline.case_id)}</p>
                          </div>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              )}

              {overdueDeadlines.length > 0 && (
                <Card className="border-rose-200">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2 text-rose-600">
                      <AlertTriangle className="w-5 h-5" />
                      באיחור ({overdueDeadlines.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {overdueDeadlines.slice(0, 5).map(deadline => (
                      <div key={deadline.id} className="p-3 bg-rose-50 rounded-xl border border-rose-100">
                        <p className="font-medium text-slate-800">{deadline.description}</p>
                        <p className="text-sm text-rose-600 mt-1">
                          {format(new Date(deadline.due_date), 'dd/MM/yyyy')}
                        </p>
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="mt-2 w-full border-rose-200 hover:bg-rose-100"
                          onClick={() => updateStatusMutation.mutate({ id: deadline.id, status: 'completed' })}
                        >
                          סמן כהושלם
                        </Button>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="list">
          <Card>
            <CardContent className="p-0">
              <div className="divide-y divide-slate-100">
                {deadlines.length === 0 ? (
                  <p className="text-center text-slate-400 py-12">אין מועדים</p>
                ) : (
                  deadlines.map(deadline => {
                    const isOverdue = deadline.status !== 'completed' && isBefore(new Date(deadline.due_date), today);
                    return (
                      <div 
                        key={deadline.id} 
                        className={`flex items-center gap-4 p-4 ${isOverdue ? 'bg-rose-50' : ''}`}
                      >
                        <div className="w-14 h-14 rounded-xl bg-slate-100 flex flex-col items-center justify-center">
                          <span className="text-lg font-bold text-slate-700">
                            {format(new Date(deadline.due_date), 'd')}
                          </span>
                          <span className="text-xs text-slate-500">
                            {format(new Date(deadline.due_date), 'MMM', { locale: he })}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-slate-800">{deadline.description}</p>
                          <p className="text-sm text-slate-500">
                            {getCaseNumber(deadline.case_id)} • {deadlineTypes.find(t => t.value === deadline.deadline_type)?.label}
                          </p>
                        </div>
                        <StatusBadge status={isOverdue ? 'overdue' : deadline.status} />
                        {deadline.status !== 'completed' && (
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => updateStatusMutation.mutate({ id: deadline.id, status: 'completed' })}
                          >
                            הושלם
                          </Button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>מועד חדש</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>תיק</Label>
              <Select value={formData.case_id} onValueChange={(v) => setFormData({ ...formData, case_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="בחר תיק" />
                </SelectTrigger>
                <SelectContent>
                  {cases.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.case_number} - {c.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>סוג מועד</Label>
              <Select value={formData.deadline_type} onValueChange={(v) => setFormData({ ...formData, deadline_type: v })}>
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
              <Label>תיאור *</Label>
              <Input
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label>תאריך יעד *</Label>
              <Input
                type="date"
                value={formData.due_date}
                onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>תזכורת ראשונה</Label>
                <Input
                  type="date"
                  value={formData.reminder_date_1}
                  onChange={(e) => setFormData({ ...formData, reminder_date_1: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>תזכורת שנייה</Label>
                <Input
                  type="date"
                  value={formData.reminder_date_2}
                  onChange={(e) => setFormData({ ...formData, reminder_date_2: e.target.value })}
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="is_critical"
                checked={formData.is_critical}
                onCheckedChange={(checked) => setFormData({ ...formData, is_critical: checked })}
              />
              <Label htmlFor="is_critical" className="cursor-pointer">מועד קריטי</Label>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                ביטול
              </Button>
              <Button 
                type="submit" 
                className="bg-slate-800 hover:bg-slate-700"
                disabled={createMutation.isPending}
              >
                יצירה
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}