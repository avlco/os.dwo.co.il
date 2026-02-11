import React, { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import toast from 'react-hot-toast';
import TasksToolbar from './TasksToolbar';
import KanbanBoard from './KanbanBoard';
import TaskListView from './TaskListView';
import TaskDialog from './TaskDialog';
import TaskDetailSheet from './TaskDetailSheet';

const EMPTY_FORM = {
  title: '',
  description: '',
  task_type: 'custom',
  priority: 'medium',
  status: 'pending',
  case_id: '',
  due_date: '',
  assigned_to: [],
};

export default function TasksPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  // View state
  const [viewMode, setViewMode] = useState('board');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FORM);

  // Detail sheet state
  const [detailTask, setDetailTask] = useState(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Data queries
  const { data: tasks = [], isLoading: tasksLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => base44.entities.Task.list('-created_date', 500),
  });

  const { data: cases = [] } = useQuery({
    queryKey: ['cases'],
    queryFn: () => base44.entities.Case.list('-created_date', 500),
  });

  // Mutations
  const createTask = useMutation({
    mutationFn: (data) => base44.entities.Task.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setDialogOpen(false);
      setFormData(EMPTY_FORM);
      toast.success(t('tasks_page.create'));
    },
    onError: (err) => toast.error(err.message),
  });

  const updateTask = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Task.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setDialogOpen(false);
      setFormData(EMPTY_FORM);
      setEditingTask(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteTask = useMutation({
    mutationFn: (id) => base44.entities.Task.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setSheetOpen(false);
      setDetailTask(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const getCaseNumber = useCallback((caseId) => {
    const c = cases.find(c => c.id === caseId);
    return c ? c.case_number : '-';
  }, [cases]);

  // Filter tasks
  const filteredTasks = useMemo(() => {
    let result = tasks;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(t =>
        (t.title || '').toLowerCase().includes(q) ||
        (t.description || '').toLowerCase().includes(q)
      );
    }
    if (statusFilter !== 'all') {
      result = result.filter(t => t.status === statusFilter);
    }
    if (priorityFilter !== 'all') {
      result = result.filter(t => t.priority === priorityFilter);
    }
    return result;
  }, [tasks, search, statusFilter, priorityFilter]);

  // Handlers
  const handleNewTask = () => {
    setEditingTask(null);
    setFormData(EMPTY_FORM);
    setDialogOpen(true);
  };

  const handleEdit = (task) => {
    setEditingTask(task);
    setFormData({
      title: task.title || '',
      description: task.description || '',
      task_type: task.task_type || 'custom',
      priority: task.priority || 'medium',
      status: task.status || 'pending',
      case_id: task.case_id || '',
      due_date: task.due_date || '',
      assigned_to: task.assigned_to || [],
    });
    setSheetOpen(false);
    setDialogOpen(true);
  };

  const handleDelete = (taskId) => {
    deleteTask.mutate(taskId);
  };

  const handleSubmit = () => {
    const data = {
      ...formData,
      case_id: formData.case_id || null,
      assigned_to: formData.assigned_to || [],
    };

    if (editingTask) {
      // When completing via dialog, set completed_at
      if (data.status === 'completed' && editingTask.status !== 'completed') {
        data.completed_at = new Date().toISOString();
      } else if (data.status !== 'completed') {
        data.completed_at = null;
      }
      updateTask.mutate({ id: editingTask.id, data });
    } else {
      createTask.mutate(data);
    }
  };

  const handleToggleComplete = (task) => {
    if (task.status === 'completed') {
      updateTask.mutate({ id: task.id, data: { status: 'pending', completed_at: null } });
    } else {
      updateTask.mutate({ id: task.id, data: { status: 'completed', completed_at: new Date().toISOString() } });
    }
  };

  const handleTaskClick = (task) => {
    setDetailTask(task);
    setSheetOpen(true);
  };

  const handleDragEnd = (result) => {
    if (!result.destination) return;
    const { source, destination, draggableId } = result;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    const newStatus = destination.droppableId;
    const updateData = {
      status: newStatus,
      sort_order: destination.index,
    };

    if (newStatus === 'completed') {
      updateData.completed_at = new Date().toISOString();
    } else {
      updateData.completed_at = null;
    }

    // Optimistic update
    queryClient.setQueryData(['tasks'], (old) => {
      if (!old) return old;
      return old.map(t => t.id === draggableId ? { ...t, ...updateData } : t);
    });

    updateTask.mutate(
      { id: draggableId, data: updateData },
      {
        onError: () => {
          queryClient.invalidateQueries({ queryKey: ['tasks'] });
        },
      }
    );
  };

  if (tasksLoading) {
    return (
      <div className="space-y-8">
        <TasksToolbar
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          search={search}
          onSearchChange={setSearch}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          priorityFilter={priorityFilter}
          onPriorityFilterChange={setPriorityFilter}
          onNewTask={handleNewTask}
        />
        <div className="flex items-center justify-center py-20">
          <p className="text-slate-400 dark:text-slate-500">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <TasksToolbar
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        search={search}
        onSearchChange={setSearch}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        priorityFilter={priorityFilter}
        onPriorityFilterChange={setPriorityFilter}
        onNewTask={handleNewTask}
      />

      {tasks.length === 0 ? (
        <div className="text-center py-16 space-y-4">
          <p className="text-lg text-slate-400 dark:text-slate-500">{t('tasks_page.no_tasks')}</p>
          <p className="text-sm text-slate-400 dark:text-slate-500">{t('tasks_page.add_first')}</p>
        </div>
      ) : viewMode === 'board' ? (
        <KanbanBoard
          tasks={filteredTasks}
          onDragEnd={handleDragEnd}
          onTaskClick={handleTaskClick}
          getCaseNumber={getCaseNumber}
        />
      ) : (
        <TaskListView
          tasks={filteredTasks}
          onToggleComplete={handleToggleComplete}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onTaskClick={handleTaskClick}
          getCaseNumber={getCaseNumber}
        />
      )}

      <TaskDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        formData={formData}
        setFormData={setFormData}
        onSubmit={handleSubmit}
        isEditing={!!editingTask}
        isSubmitting={createTask.isPending || updateTask.isPending}
      />

      <TaskDetailSheet
        task={detailTask}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onEdit={handleEdit}
        onDelete={handleDelete}
        getCaseNumber={getCaseNumber}
      />
    </div>
  );
}
