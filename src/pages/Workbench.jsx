import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { useTranslation } from 'react-i18next';
import TaskControlPanel from '../components/workbench/TaskControlPanel';
import MailContent from '../components/workbench/MailContent';
import ExecutionSummary from '../components/workbench/ExecutionSummary';
import { toast } from 'sonner';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { ArrowRight, ArrowLeft } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

// Custom hook for detecting mobile screens
function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(window.innerWidth < breakpoint);
  
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [breakpoint]);
  
  return isMobile;
}

export default function Workbench() {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'he';
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const urlParams = new URLSearchParams(window.location.search);
  const taskId = urlParams.get('taskId');

  const [formData, setFormData] = useState({
    case_id: '',
    client_id: '',
    notes: '',
  });
  const [suggestedActions, setSuggestedActions] = useState([]);
  const [processingActionIndex, setProcessingActionIndex] = useState(null);
  const [executionResults, setExecutionResults] = useState(null);
  const [showSummary, setShowSummary] = useState(false);

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
    mutationFn: async (payload) => {
      setProcessingActionIndex(null);
      const results = [];
      for (let i = 0; i < payload.selected_actions.length; i++) {
        const actionIndex = suggestedActions.findIndex(a => a.id === payload.selected_actions[i].id);
        setProcessingActionIndex(actionIndex >= 0 ? actionIndex : i);
        try {
          const actionPayload = {
            task_id: taskId,
            selected_actions: [payload.selected_actions[i]],
            case_id: payload.case_id,
            client_id: payload.client_id,
          };
          const result = await base44.functions.invoke('executeMailActions', actionPayload);
          results.push({ action: payload.selected_actions[i].action_type, status: 'success', data: result.data });
        } catch (err) {
          results.push({ action: payload.selected_actions[i].action_type, status: 'error', error: err.message });
        }
      }
      return results;
    },
    onSuccess: (results) => {
      queryClient.invalidateQueries(['task', taskId]);
      queryClient.invalidateQueries(['tasks']);
      queryClient.invalidateQueries(['mails']);
      setProcessingActionIndex(null);
      setExecutionResults(results);
      setShowSummary(true);
      
      const successCount = results.filter(r => r.status === 'success').length;
      const errorCount = results.filter(r => r.status === 'error').length;
      
      if (errorCount > 0 && successCount > 0) {
        toast.warning(t('workbench.actions_mixed', { success: successCount, failed: errorCount }));
      } else if (errorCount > 0) {
        toast.error(t('workbench.actions_failed', { count: errorCount }));
      } else {
        toast.success(t('workbench.actions_success', { count: successCount }));
      }
    },
    onError: (error) => {
      setProcessingActionIndex(null);
      toast.error(t('workbench.error_executing') + error.message);
    },
  });

  useEffect(() => {
    if (task?.[0]) {
      const taskData = task[0];
      const extractedData = taskData.extracted_data || {};
      
      setFormData({
        case_id: taskData.case_id || extractedData.inferred_case?.id || '',
        client_id: taskData.client_id || extractedData.inferred_client?.id || '',
        notes: taskData.notes || '',
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
    const originalCaseId = currentTask?.original_inferred_case_id || currentTask?.extracted_data?.inferred_case?.id;
    const originalClientId = currentTask?.original_inferred_client_id || currentTask?.extracted_data?.inferred_client?.id;
    const hasOverride = (formData.case_id && formData.case_id !== originalCaseId) || 
                        (formData.client_id && formData.client_id !== originalClientId);
    
    updateTaskMutation.mutate({
      id: taskId,
      data: {
        ...formData,
        manual_override: hasOverride,
        extracted_data: {
          ...currentTask?.extracted_data,
          suggested_actions: suggestedActions,
        },
      },
    });
  };

  const handleApproveAndExecute = () => {
    const selectedActions = suggestedActions.filter(a => a.selected);
    if (selectedActions.length === 0) {
      alert(t('workbench.select_action'));
      return;
    }
    
    const originalCaseId = currentTask?.original_inferred_case_id || currentTask?.extracted_data?.inferred_case?.id;
    const originalClientId = currentTask?.original_inferred_client_id || currentTask?.extracted_data?.inferred_client?.id;
    const hasOverride = (formData.case_id && formData.case_id !== originalCaseId) || 
                        (formData.client_id && formData.client_id !== originalClientId);
    
    if (hasOverride) {
      updateTaskMutation.mutate({
        id: taskId,
        data: { manual_override: true }
      });
    }
    
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
          {t('workbench.task_not_found')}
        </p>
        <Link to={createPageUrl('MailRoom')}>
          <Button variant="link" className="mt-4">
            {t('workbench.back_to_mailroom')}
          </Button>
        </Link>
      </div>
    );
  }

  // Show execution summary after completing actions
  if (showSummary && executionResults) {
    return (
      <div className="h-[calc(100vh-8rem)] flex flex-col">
        <div className="flex items-center gap-4 mb-4 flex-shrink-0">
          <div className="flex-1">
            <h1 className="text-xl font-bold text-slate-800 dark:text-slate-200">
              {t('workbench.execution_complete')}
            </h1>
          </div>
        </div>
        <div className="flex-1 flex items-start justify-center pt-8">
          <div className="w-full max-w-2xl">
            <ExecutionSummary 
              results={executionResults} 
              onClose={() => {
                setShowSummary(false);
                setExecutionResults(null);
              }}
            />
          </div>
        </div>
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
              {t('workbench.title')}
            </h1>
          </div>
          <p className="text-slate-500 dark:text-slate-400 mt-1 truncate text-sm">
            {currentTask.title}
          </p>
        </div>
      </div>

      {/* Split View - Stack on mobile, side-by-side on desktop */}
      <div className="flex-1 min-h-0">
        {isMobile ? (
          // Mobile: Stack layout
          <div className="h-full flex flex-col gap-4 overflow-auto">
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
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
                processingActionIndex={processingActionIndex}
              />
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 min-h-[400px]">
              <MailContent mail={currentMail} />
            </div>
          </div>
        ) : (
          // Desktop: Resizable split view
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
                      processingActionIndex={processingActionIndex}
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
                      processingActionIndex={processingActionIndex}
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
        )}
      </div>
    </div>
  );
}