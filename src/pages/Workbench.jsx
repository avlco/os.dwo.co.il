import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { useTranslation } from 'react-i18next';
import StatusBadge from '../components/ui/StatusBadge';
import TaskControlPanel from '../components/workbench/TaskControlPanel';
import MailContent from '../components/workbench/MailContent';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { ArrowRight, ArrowLeft } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export default function Workbench() {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'he';
  const queryClient = useQueryClient();
  const urlParams = new URLSearchParams(window.location.search);
  const taskId = urlParams.get('taskId');

  const [formData, setFormData] = useState({
    case_id: '',
    client_id: '',
    notes: '',
  });
  const [suggestedActions, setSuggestedActions] = useState([]);

  const { data: task, isLoading: taskLoading } = useQuery({
    queryKey: ['task', taskId],
    queryFn: () => base44.entities.Task.filter({ id: taskId }),
    enabled: !!taskId,
  });

  const { data: mail } = useQuery({
    queryKey: ['mail', task?.[0]?.mail_id],
    queryFn: () => base44.entities.Mail.filter({ id: task[0].mail_id }),
    enabled: !!task?.[0]?.mail_id,
  });

  const { data: cases = [] } = useQuery({
    queryKey: ['cases'],
    queryFn: () => base44.entities.Case.list('-created_date', 500),
  });

  const { data: clients = [] } = useQuery({
    queryKey: ['clients'],
    queryFn: () => base44.entities.Client.list('-created_date', 500),
  });

  const updateTaskMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Task.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['task', taskId]);
    },
  });

  const executeActionsMutation = useMutation({
    mutationFn: (payload) => base44.functions.invoke('executeMailActions', payload),
    onSuccess: () => {
      queryClient.invalidateQueries(['task', taskId]);
      queryClient.invalidateQueries(['tasks']);
      queryClient.invalidateQueries(['mails']);
      window.location.href = createPageUrl('MailRoom');
    },
  });

  useEffect(() => {
    if (task?.[0]) {
      const t = task[0];
      const extractedData = t.extracted_data || {};
      
      setFormData({
        case_id: t.case_id || extractedData.inferred_case?.id || '',
        client_id: t.client_id || extractedData.inferred_client?.id || '',
        notes: t.notes || '',
      });
      
      setSuggestedActions(extractedData.suggested_actions || []);
    }
  }, [task]);

  const currentTask = task?.[0];
  const currentMail = mail?.[0];

  const handleActionToggle = (index) => {
    const newActions = [...suggestedActions];
    newActions[index] = { ...newActions[index], selected: !newActions[index].selected };
    setSuggestedActions(newActions);
  };

  const handleActionUpdate = (index, updated) => {
    const newActions = [...suggestedActions];
    newActions[index] = updated;
    setSuggestedActions(newActions);
  };

  const handleSave = () => {
    updateTaskMutation.mutate({
      id: taskId,
      data: {
        ...formData,
        extracted_data: {
          ...currentTask?.extracted_data,
          suggested_actions: suggestedActions,
        },
      },
    });
  };

  const handleApproveAndExecute = () => {
    const selectedActions = suggestedActions.filter(a => a.selected);
    executeActionsMutation.mutate({
      task_id: taskId,
      selected_actions: selectedActions,
      case_id: formData.case_id,
      client_id: formData.client_id,
    });
  };

  const handleSkip = () => {
    window.location.href = createPageUrl('MailRoom');
  };

  if (taskLoading) {
    return (
      <div className="h-[calc(100vh-8rem)] space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-full w-full" />
      </div>
    );
  }

  if (!currentTask) {
    return (
      <div className="text-center py-16">
        <p className="text-slate-500 dark:text-slate-400">
          {isRTL ? 'משימה לא נמצאה' : 'Task not found'}
        </p>
        <Link to={createPageUrl('MailRoom')}>
          <Button variant="link" className="mt-4">
            {isRTL ? 'חזרה לחדר דואר' : 'Back to Mail Room'}
          </Button>
        </Link>
      </div>
    );
  }

  const BackArrow = isRTL ? ArrowRight : ArrowLeft;

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-4 mb-4 flex-shrink-0">
        <Link to={createPageUrl('MailRoom')}>
          <Button variant="ghost" size="icon" className="rounded-xl dark:hover:bg-slate-700">
            <BackArrow className="w-5 h-5" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-slate-800 dark:text-slate-200">
              {isRTL ? 'שולחן עבודה' : 'Workbench'}
            </h1>
          </div>
          <p className="text-slate-500 dark:text-slate-400 mt-1 truncate text-sm">
            {currentTask.title}
          </p>
        </div>
      </div>

      {/* Split View */}
      <div className="flex-1 min-h-0">
        <ResizablePanelGroup 
          direction="horizontal" 
          className="h-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
        >
          {isRTL ? (
            <>
              {/* RTL: Mail on Right, Controls on Left */}
              <ResizablePanel defaultSize={65} minSize={40}>
                <div className="h-full p-4 overflow-hidden">
                  <MailContent mail={currentMail} />
                </div>
              </ResizablePanel>
              <ResizableHandle withHandle className="bg-slate-200 dark:bg-slate-700" />
              <ResizablePanel defaultSize={35} minSize={25}>
                <div className="h-full p-4 overflow-hidden">
                  <TaskControlPanel
                    task={currentTask}
                    cases={cases}
                    clients={clients}
                    formData={formData}
                    setFormData={setFormData}
                    suggestedActions={suggestedActions}
                    onActionToggle={handleActionToggle}
                    onActionUpdate={handleActionUpdate}
                    onSave={handleSave}
                    onApprove={handleApproveAndExecute}
                    onSkip={handleSkip}
                    isApproving={executeActionsMutation.isPending}
                  />
                </div>
              </ResizablePanel>
            </>
          ) : (
            <>
              {/* LTR: Controls on Left, Mail on Right */}
              <ResizablePanel defaultSize={35} minSize={25}>
                <div className="h-full p-4 overflow-hidden">
                  <TaskControlPanel
                    task={currentTask}
                    cases={cases}
                    clients={clients}
                    formData={formData}
                    setFormData={setFormData}
                    suggestedActions={suggestedActions}
                    onActionToggle={handleActionToggle}
                    onActionUpdate={handleActionUpdate}
                    onSave={handleSave}
                    onApprove={handleApproveAndExecute}
                    onSkip={handleSkip}
                    isApproving={executeActionsMutation.isPending}
                  />
                </div>
              </ResizablePanel>
              <ResizableHandle withHandle className="bg-slate-200 dark:bg-slate-700" />
              <ResizablePanel defaultSize={65} minSize={40}>
                <div className="h-full p-4 overflow-hidden">
                  <MailContent mail={currentMail} />
                </div>
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      </div>
    </div>
  );
}