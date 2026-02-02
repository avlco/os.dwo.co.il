import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useTranslation } from 'react-i18next';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, isToday, isBefore } from 'date-fns';
import { he } from 'date-fns/locale';
import PageHeader from '../components/ui/PageHeader';
import StatusBadge from '../components/ui/StatusBadge';
import {
  Calendar,
  ChevronRight,
  ChevronLeft,
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

export default function Docketing() {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'he';
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

  const deadlineTypes = [
    { value: 'office_action_response', label: t('docketing.type_office_action') },
    { value: 'renewal', label: t('docketing.type_renewal') },
    { value: 'opposition_response', label: t('docketing.type_opposition') },
    { value: 'appeal', label: t('docketing.type_appeal') },
    { value: 'payment', label: t('docketing.type_payment') },
    { value: 'filing', label: t('docketing.type_filing') },
    { value: 'custom', label: t('docketing.type_custom') },
  ];

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

  const startDay = monthStart.getDay();
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

  const weekDays = t('docketing.week_days', { returnObjects: true }) || ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('docketing.title')}
        subtitle={t('docketing.subtitle')}
        action={() => openCreateDialog()}
        actionLabel={t('docketing.new_deadline')}
      />

      <Tabs defaultValue="calendar" className="space-y-6">
        <TabsList className="bg-white dark:bg-slate-800 border dark:border-slate-700">
          <TabsTrigger value="calendar" className="dark:text-slate-300 dark:data-[state=active]:bg-slate-700">{t('docketing.calendar_tab')}</TabsTrigger>
          <TabsTrigger value="list" className="dark:text-slate-300 dark:data-[state=active]:bg-slate-700">{t('docketing.list_tab')}</TabsTrigger>
        </TabsList>

        <TabsContent value="calendar">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Calendar */}
            <div className="lg:col-span-2">
              <Card className="dark:bg-slate-800 dark:border-slate-700">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-lg font-semibold dark:text-slate-200">
                    {format(currentMonth, 'MMMM yyyy', { locale: isRTL ? he : undefined })}
                  </CardTitle>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="dark:hover:bg-slate-700">
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="dark:hover:bg-slate-700">
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-7 gap-1 mb-2">
                    {weekDays.map((day, idx) => (
                      <div key={idx} className="text-center text-sm font-medium text-slate-500 dark:text-slate-400 py-2">
                        {day}
                      </div>
                    ))}
                  </div>
                  
                  <div className="grid grid-cols-7 gap-1">
                    {[...Array(paddingDays)].map((_, i) => (
                      <div key={`padding-${i}`} className="aspect-square p-1" />
                    ))}
                    
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
                          }}
                          onDoubleClick={() => {
                            openCreateDialog(day);
                          }}
                          className={`
                            aspect-square p-1 rounded-lg text-sm transition-colors relative
                            ${isToday(day) ? 'bg-slate-800 dark:bg-slate-600 text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-700'}
                            ${!isSameMonth(day, currentMonth) ? 'text-slate-300 dark:text-slate-600' : 'dark:text-slate-200'}
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

            {/* Sidebar */}
            <div className="space-y-6">
              {selectedDate && getDeadlinesForDate(selectedDate).length > 0 ? (
                <Card className="dark:bg-slate-800 dark:border-slate-700">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2 dark:text-slate-200">
                      <Calendar className="w-5 h-5 text-blue-500" />
                      {format(selectedDate, 'dd MMMM yyyy', { locale: isRTL ? he : undefined })}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {getDeadlinesForDate(selectedDate).map(deadline => (
                      <div key={deadline.id} className="p-3 bg-slate-50 dark:bg-slate-700/50 rounded-xl">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-medium text-slate-800 dark:text-slate-200">{deadline.description}</p>
                            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{getCaseNumber(deadline.case_id)}</p>
                          </div>
                          <StatusBadge status={deadline.is_critical ? 'critical' : deadline.status} />
                        </div>
                        {deadline.status !== 'completed' && (
                          <Button 
                            size="sm" 
                            variant="outline" 
                            className="mt-3 w-full dark:border-slate-600"
                            onClick={() => updateStatusMutation.mutate({ id: deadline.id, status: 'completed' })}
                          >
                            {t('docketing.mark_completed')}
                          </Button>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ) : (
                <Card className="dark:bg-slate-800 dark:border-slate-700">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2 dark:text-slate-200">
                      <Clock className="w-5 h-5 text-amber-500" />
                      {t('docketing.upcoming_deadlines')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {upcomingDeadlines.length === 0 ? (
                      <p className="text-center text-slate-400 dark:text-slate-500 py-4">{t('docketing.no_upcoming')}</p>
                    ) : (
                      upcomingDeadlines.map(deadline => (
                        <div key={deadline.id} className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-xl">
                          <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex flex-col items-center justify-center text-xs">
                            <span className="font-bold text-amber-700 dark:text-amber-400">{format(new Date(deadline.due_date), 'd')}</span>
                            <span className="text-amber-600 dark:text-amber-500">{format(new Date(deadline.due_date), 'MMM', { locale: isRTL ? he : undefined })}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-slate-800 dark:text-slate-200 truncate">{deadline.description}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">{getCaseNumber(deadline.case_id)}</p>
                          </div>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              )}

              {overdueDeadlines.length > 0 && (
                <Card className="border-rose-200 dark:border-rose-800 dark:bg-slate-800">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2 text-rose-600 dark:text-rose-400">
                      <AlertTriangle className="w-5 h-5" />
                      {t('docketing.overdue_count', { count: overdueDeadlines.length })}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {overdueDeadlines.slice(0, 5).map(deadline => (
                      <div key={deadline.id} className="p-3 bg-rose-50 dark:bg-rose-900/20 rounded-xl border border-rose-100 dark:border-rose-800">
                        <p className="font-medium text-slate-800 dark:text-slate-200">{deadline.description}</p>
                        <p className="text-sm text-rose-600 dark:text-rose-400 mt-1">
                          {format(new Date(deadline.due_date), 'dd/MM/yyyy')}
                        </p>
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="mt-2 w-full border-rose-200 dark:border-rose-700 hover:bg-rose-100 dark:hover:bg-rose-900/30"
                          onClick={() => updateStatusMutation.mutate({ id: deadline.id, status: 'completed' })}
                        >
                          {t('docketing.mark_completed')}
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
          <Card className="dark:bg-slate-800 dark:border-slate-700">
            <CardContent className="p-0">
              <div className="divide-y divide-slate-100 dark:divide-slate-700">
                {deadlines.length === 0 ? (
                  <p className="text-center text-slate-400 dark:text-slate-500 py-12">{t('docketing.no_deadlines')}</p>
                ) : (
                  deadlines.map(deadline => {
                    const isOverdue = deadline.status !== 'completed' && isBefore(new Date(deadline.due_date), today);
                    return (
                      <div 
                        key={deadline.id} 
                        className={`flex items-center gap-4 p-4 ${isOverdue ? 'bg-rose-50 dark:bg-rose-900/20' : ''}`}
                      >
                        <div className="w-14 h-14 rounded-xl bg-slate-100 dark:bg-slate-700 flex flex-col items-center justify-center">
                          <span className="text-lg font-bold text-slate-700 dark:text-slate-200">
                            {format(new Date(deadline.due_date), 'd')}
                          </span>
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            {format(new Date(deadline.due_date), 'MMM', { locale: isRTL ? he : undefined })}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-slate-800 dark:text-slate-200">{deadline.description}</p>
                          <p className="text-sm text-slate-500 dark:text-slate-400">
                            {getCaseNumber(deadline.case_id)} • {deadlineTypes.find(t => t.value === deadline.deadline_type)?.label}
                          </p>
                        </div>
                        <StatusBadge status={isOverdue ? 'overdue' : deadline.status} />
                        {deadline.status !== 'completed' && (
                          <Button 
                            size="sm" 
                            variant="outline"
                            className="dark:border-slate-600"
                            onClick={() => updateStatusMutation.mutate({ id: deadline.id, status: 'completed' })}
                          >
                            {t('docketing.completed')}
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
        <DialogContent className="max-w-lg dark:bg-slate-800 dark:border-slate-700">
          <DialogHeader>
            <DialogTitle className="dark:text-slate-200">{t('docketing.dialog_title')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label className="dark:text-slate-300">{t('docketing.case_field')}</Label>
              <Select value={formData.case_id} onValueChange={(v) => setFormData({ ...formData, case_id: v })}>
                <SelectTrigger className="dark:bg-slate-900 dark:border-slate-600">
                  <SelectValue placeholder={t('docketing.select_case')} />
                </SelectTrigger>
                <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
                  {cases.map(c => (
                    <SelectItem key={c.id} value={c.id} className="dark:text-slate-200">{c.case_number} - {c.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="dark:text-slate-300">{t('docketing.type_field')}</Label>
              <Select value={formData.deadline_type} onValueChange={(v) => setFormData({ ...formData, deadline_type: v })}>
                <SelectTrigger className="dark:bg-slate-900 dark:border-slate-600">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
                  {deadlineTypes.map(type => (
                    <SelectItem key={type.value} value={type.value} className="dark:text-slate-200">{type.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="dark:text-slate-300">{t('docketing.description_field')}</Label>
              <Input
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                required
                className="dark:bg-slate-900 dark:border-slate-600"
              />
            </div>

            <div className="space-y-2">
              <Label className="dark:text-slate-300">{t('docketing.due_date_field')}</Label>
              <Input
                type="date"
                value={formData.due_date}
                onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                required
                className="dark:bg-slate-900 dark:border-slate-600"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="dark:text-slate-300">{t('docketing.reminder_1')}</Label>
                <Input
                  type="date"
                  value={formData.reminder_date_1}
                  onChange={(e) => setFormData({ ...formData, reminder_date_1: e.target.value })}
                  className="dark:bg-slate-900 dark:border-slate-600"
                />
              </div>
              <div className="space-y-2">
                <Label className="dark:text-slate-300">{t('docketing.reminder_2')}</Label>
                <Input
                  type="date"
                  value={formData.reminder_date_2}
                  onChange={(e) => setFormData({ ...formData, reminder_date_2: e.target.value })}
                  className="dark:bg-slate-900 dark:border-slate-600"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="is_critical"
                checked={formData.is_critical}
                onCheckedChange={(checked) => setFormData({ ...formData, is_critical: checked })}
              />
              <Label htmlFor="is_critical" className="cursor-pointer dark:text-slate-300">{t('docketing.critical')}</Label>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)} className="dark:border-slate-600">
                {t('docketing.cancel')}
              </Button>
              <Button 
                type="submit" 
                className="bg-slate-800 hover:bg-slate-700 dark:bg-slate-700"
                disabled={createMutation.isPending}
              >
                {t('docketing.create')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}