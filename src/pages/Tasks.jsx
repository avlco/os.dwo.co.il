import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useTranslation } from 'react-i18next';
import { format, isBefore } from 'date-fns';
import PageHeader from '../components/ui/PageHeader';
import StatusBadge from '../components/ui/StatusBadge';
import EmptyState from '../components/ui/EmptyState';
import {
  FileText,
  Search,
  CheckCircle2,
  Clock,
  Edit,
  Trash2
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";

export default function Tasks() {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'he';
  const queryClient = useQueryClient();
  const today = new Date();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    task_type: 'custom',
    status: 'pending',
    priority: 'medium',
    case_id: '',
    client_id: '',
    due_date: '',
  });

  const taskTypes = [
    { value: 'review_oa', label: t('tasks_page.type_review_oa') },
    { value: 'respond_to_client', label: t('tasks_page.type_respond_client') },
    { value: 'draft_report', label: t('tasks_page.type_draft_report') },
    { value: 'file_application', label: t('tasks_page.type_file_application') },
    { value: 'pay_renewal_fee', label: t('tasks_page.type_pay_renewal') },
    { value: 'prepare_response', label: t('tasks_page.type_prepare_response') },
    { value: 'custom', label: t('tasks_page.type_custom') },
  ];

  const taskStatuses = [
    { value: 'pending', label: t('tasks_page.status_pending') },
    { value: 'awaiting_approval', label: t('tasks_page.status_awaiting') },
    { value: 'in_progress', label: t('tasks_page.status_in_progress') },
    { value: 'completed', label: t('tasks_page.status_completed') },
    { value: 'cancelled', label: t('tasks_page.status_cancelled') },
  ];

  const priorities = [
    { value: 'low', label: t('tasks_page.priority_low') },
    { value: 'medium', label: t('tasks_page.priority_medium') },
    { value: 'high', label: t('tasks_page.priority_high') },
    { value: 'critical', label: t('tasks_page.priority_critical') },
  ];

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => base44.entities.Task.list('-created_date', 500),
  });

  const { data: cases = [] } = useQuery({
    queryKey: ['cases'],
    queryFn: () => base44.entities.Case.list('-created_date', 500),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Task.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['tasks']);
      setIsDialogOpen(false);
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Task.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['tasks']);
      setIsDialogOpen(false);
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Task.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['tasks']);
    },
  });

  const toggleComplete = async (task) => {
    const newStatus = task.status === 'completed' ? 'pending' : 'completed';
    await base44.entities.Task.update(task.id, { 
      status: newStatus,
      completed_at: newStatus === 'completed' ? new Date().toISOString() : null
    });
    queryClient.invalidateQueries(['tasks']);
  };

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      task_type: 'custom',
      status: 'pending',
      priority: 'medium',
      case_id: '',
      client_id: '',
      due_date: '',
    });
    setEditingTask(null);
  };

  const openCreateDialog = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const openEditDialog = (task) => {
    setEditingTask(task);
    setFormData({
      title: task.title || '',
      description: task.description || '',
      task_type: task.task_type || 'custom',
      status: task.status || 'pending',
      priority: task.priority || 'medium',
      case_id: task.case_id || '',
      client_id: task.client_id || '',
      due_date: task.due_date || '',
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (editingTask) {
      updateMutation.mutate({ id: editingTask.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const getCaseNumber = (caseId) => {
    const caseItem = cases.find(c => c.id === caseId);
    return caseItem?.case_number || '-';
  };

  const filteredTasks = tasks.filter(t => {
    const matchesSearch = t.title?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === 'all' || t.status === filterStatus;
    const matchesPriority = filterPriority === 'all' || t.priority === filterPriority;
    return matchesSearch && matchesStatus && matchesPriority;
  });

  const isOverdue = (task) => {
    if (!task.due_date || task.status === 'completed') return false;
    return isBefore(new Date(task.due_date), today);
  };

  const pendingTasks = filteredTasks.filter(t => t.status === 'pending' || t.status === 'in_progress' || t.status === 'awaiting_approval');
  const completedTasks = filteredTasks.filter(t => t.status === 'completed');

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('tasks_page.title')}
        subtitle={t('tasks_page.subtitle', { count: tasks.length })}
        action={openCreateDialog}
        actionLabel={t('tasks_page.new_task')}
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className={`absolute ${isRTL ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400`} />
          <Input
            placeholder={t('tasks_page.search')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={`${isRTL ? 'pr-10' : 'pl-10'} bg-white dark:bg-slate-800 dark:border-slate-700`}
          />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-40 bg-white dark:bg-slate-800 dark:border-slate-700">
            <SelectValue placeholder={t('tasks_page.status_filter')} />
          </SelectTrigger>
          <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
            <SelectItem value="all" className="dark:text-slate-200">{t('tasks_page.all_statuses')}</SelectItem>
            {taskStatuses.map(status => (
              <SelectItem key={status.value} value={status.value} className="dark:text-slate-200">{status.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterPriority} onValueChange={setFilterPriority}>
          <SelectTrigger className="w-40 bg-white dark:bg-slate-800 dark:border-slate-700">
            <SelectValue placeholder={t('tasks_page.priority_filter')} />
          </SelectTrigger>
          <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
            <SelectItem value="all" className="dark:text-slate-200">{t('tasks_page.all_priorities')}</SelectItem>
            {priorities.map(p => (
              <SelectItem key={p.value} value={p.value} className="dark:text-slate-200">{p.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tasks */}
      {tasks.length === 0 && !isLoading ? (
        <EmptyState
          icon={FileText}
          title={t('tasks_page.no_tasks')}
          description={t('tasks_page.add_first')}
          actionLabel={t('tasks_page.add_task')}
          onAction={openCreateDialog}
        />
      ) : (
        <div className="space-y-6">
          {/* Pending Tasks */}
          <div>
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-4 flex items-center gap-2">
              <Clock className="w-5 h-5 text-amber-500" />
              {t('tasks_page.open_tasks', { count: pendingTasks.length })}
            </h2>
            <div className="space-y-3">
              {pendingTasks.map((task) => (
                <Card 
                  key={task.id} 
                  className={`border transition-colors hover:shadow-md dark:bg-slate-800 dark:border-slate-700 ${isOverdue(task) ? 'border-rose-200 dark:border-rose-800 bg-rose-50/30 dark:bg-rose-900/10' : 'border-slate-200'}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      <Checkbox
                        checked={task.status === 'completed'}
                        onCheckedChange={() => toggleComplete(task)}
                        className="mt-1"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-slate-800 dark:text-slate-200">{task.title}</p>
                          <StatusBadge status={task.priority} />
                          {task.case_id && (
                            <span className="text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded">
                              {getCaseNumber(task.case_id)}
                            </span>
                          )}
                        </div>
                        {task.description && (
                          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">{task.description}</p>
                        )}
                        {task.due_date && (
                          <p className={`text-sm mt-2 ${isOverdue(task) ? 'text-rose-600 dark:text-rose-400 font-medium' : 'text-slate-500 dark:text-slate-400'}`}>
                            {t('tasks_page.due_label')} {format(new Date(task.due_date), 'dd/MM/yyyy')}
                            {isOverdue(task) && ` ${t('tasks_page.overdue')}`}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button variant="ghost" size="icon" onClick={() => openEditDialog(task)} className="dark:hover:bg-slate-700">
                          <Edit className="w-4 h-4 text-slate-400" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(task.id)} className="dark:hover:bg-slate-700">
                          <Trash2 className="w-4 h-4 text-rose-400" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {pendingTasks.length === 0 && (
                <p className="text-center text-slate-400 dark:text-slate-500 py-8">{t('tasks_page.no_open')}</p>
              )}
            </div>
          </div>

          {/* Completed Tasks */}
          {completedTasks.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-4 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-500" />
                {t('tasks_page.completed_tasks', { count: completedTasks.length })}
              </h2>
              <div className="space-y-3">
                {completedTasks.slice(0, 5).map((task) => (
                  <Card key={task.id} className="border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-4">
                        <Checkbox
                          checked={true}
                          onCheckedChange={() => toggleComplete(task)}
                          className="mt-1"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-slate-500 dark:text-slate-400 line-through">{task.title}</p>
                          {task.completed_at && (
                            <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">
                              {t('tasks_page.completed_on')}{format(new Date(task.completed_at), 'dd/MM/yyyy')}
                            </p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg dark:bg-slate-800 dark:border-slate-700">
          <DialogHeader>
            <DialogTitle className="dark:text-slate-200">{editingTask ? t('tasks_page.dialog_edit') : t('tasks_page.dialog_new')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label className="dark:text-slate-300">{t('tasks_page.title_field')}</Label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                required
                className="dark:bg-slate-900 dark:border-slate-600"
              />
            </div>

            <div className="space-y-2">
              <Label className="dark:text-slate-300">{t('tasks_page.description_field')}</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                className="dark:bg-slate-900 dark:border-slate-600"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="dark:text-slate-300">{t('tasks_page.type_field')}</Label>
                <Select value={formData.task_type} onValueChange={(v) => setFormData({ ...formData, task_type: v })}>
                  <SelectTrigger className="dark:bg-slate-900 dark:border-slate-600">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
                    {taskTypes.map(type => (
                      <SelectItem key={type.value} value={type.value} className="dark:text-slate-200">{type.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="dark:text-slate-300">{t('tasks_page.priority_field')}</Label>
                <Select value={formData.priority} onValueChange={(v) => setFormData({ ...formData, priority: v })}>
                  <SelectTrigger className="dark:bg-slate-900 dark:border-slate-600">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
                    {priorities.map(p => (
                      <SelectItem key={p.value} value={p.value} className="dark:text-slate-200">{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="dark:text-slate-300">{t('tasks_page.case_field')}</Label>
                <Select value={formData.case_id} onValueChange={(v) => setFormData({ ...formData, case_id: v })}>
                  <SelectTrigger className="dark:bg-slate-900 dark:border-slate-600">
                    <SelectValue placeholder={t('tasks_page.select_case')} />
                  </SelectTrigger>
                  <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
                    {cases.map(c => (
                      <SelectItem key={c.id} value={c.id} className="dark:text-slate-200">{c.case_number}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="dark:text-slate-300">{t('tasks_page.due_date_field')}</Label>
                <Input
                  type="date"
                  value={formData.due_date}
                  onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                  className="dark:bg-slate-900 dark:border-slate-600"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)} className="dark:border-slate-600">
                {t('tasks_page.cancel')}
              </Button>
              <Button 
                type="submit" 
                className="bg-slate-800 hover:bg-slate-700 dark:bg-slate-700"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {editingTask ? t('tasks_page.update') : t('tasks_page.create')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}