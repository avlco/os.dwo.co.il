import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { format } from 'date-fns';
import {
  ArrowRight,
  CheckCircle,
  XCircle,
  Clock,
  Mail,
  Briefcase,
  User,
  AlertTriangle,
  Save,
  Play,
  Loader2,
  FileText,
  Calendar,
  DollarSign,
  Bell,
  HardDrive,
  Send
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";

const ACTION_ICONS = {
  send_email: Send,
  create_task: FileText,
  billing: DollarSign,
  calendar_event: Calendar,
  save_file: HardDrive,
  create_alert: Bell,
  create_deadline: Clock
};

const ACTION_LABELS = {
  send_email: 'שליחת מייל',
  create_task: 'יצירת משימה',
  billing: 'חיוב שעות',
  calendar_event: 'אירוע ביומן',
  save_file: 'שמירת קבצים',
  create_alert: 'יצירת התרעה',
  create_deadline: 'יצירת מועד'
};

export default function ApprovalBatchEdit() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const params = new URLSearchParams(window.location.search);
  const batchId = params.get('batchId');

  const [actions, setActions] = useState([]);
  const [hasChanges, setHasChanges] = useState(false);

  // Fetch batch
  const { data: batchData, isLoading, error } = useQuery({
    queryKey: ['approval-batch', batchId],
    queryFn: async () => {
      const raw = await base44.functions.invoke('handleApprovalBatch', {
    method: 'get',
    batch_id: batchId
});
const response = raw.data || raw;
if (!response.success) throw new Error(response.message);
return response.batch;
    },
    enabled: !!batchId
  });

  // Initialize actions when batch loads
    useEffect(() => {
    if (batchData?.actions_current) {
      const normalized = JSON.parse(JSON.stringify(batchData.actions_current)).map(a => ({
        ...a,
        enabled: a.enabled !== null && a.enabled !== undefined ? a.enabled : true
      }));
      setActions(normalized);
      setHasChanges(false);
    }
  }, [batchData]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      const raw = await base44.functions.invoke('handleApprovalBatch', {
    method: 'update_actions',
    batch_id: batchId,
    actions_current: actions
});
const response = raw.data || raw;
if (!response.success) throw new Error(response.message || JSON.stringify(response.errors));
return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['approval-batch', batchId]);
      setHasChanges(false);
      toast({ title: 'נשמר בהצלחה', description: 'השינויים נשמרו' });
    },
    onError: (error) => {
      toast({ 
        variant: 'destructive', 
        title: 'שגיאה בשמירה', 
        description: error.message 
      });
    }
  });

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: async () => {
      // Save first if there are changes
      if (hasChanges) {
        const saveRaw = await base44.functions.invoke('handleApprovalBatch', {
          method: 'update_actions',
          batch_id: batchId,
          actions_current: actions
        });
      }
      
      const approveRaw = await base44.functions.invoke('handleApprovalBatch', {
        method: 'approve',
        batch_id: batchId
      });
      const response = approveRaw.data || approveRaw;
      return response;
    },
    onSuccess: (response) => {
      queryClient.invalidateQueries(['approval-batch', batchId]);
      queryClient.invalidateQueries(['approvals']);
      
      if (response.success) {
        toast({ 
          title: 'אושר בהצלחה!', 
          description: `${response.execution_summary?.success || 0} פעולות בוצעו` 
        });
        navigate(createPageUrl('ApprovalQueue'));
      } else {
        toast({ 
          variant: 'destructive',
          title: 'האישור הושלם עם שגיאות', 
          description: `${response.execution_summary?.failed || 0} פעולות נכשלו` 
        });
      }
    },
    onError: (error) => {
      toast({ 
        variant: 'destructive', 
        title: 'שגיאה באישור', 
        description: error.message 
      });
    }
  });

  // Cancel mutation
  const cancelMutation = useMutation({
    mutationFn: async () => {
      const raw = await base44.functions.invoke('handleApprovalBatch', {
    method: 'cancel',
    batch_id: batchId,
    reason: 'בוטל על ידי המשתמש'
});
const response = raw.data || raw;
if (!response.success) throw new Error(response.message);
return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['approval-batch', batchId]);
      queryClient.invalidateQueries(['approvals']);
      toast({ title: 'בוטל', description: 'הבאטש בוטל' });
      navigate(createPageUrl('ApprovalQueue'));
    },
    onError: (error) => {
      toast({ 
        variant: 'destructive', 
        title: 'שגיאה בביטול', 
        description: error.message 
      });
    }
  });

  // Update action handler
  function updateAction(index, updates) {
    setActions(prev => {
      const newActions = [...prev];
      newActions[index] = { ...newActions[index], ...updates };
      return newActions;
    });
    setHasChanges(true);
  }

  // Update action config handler
  function updateActionConfig(index, configUpdates) {
    setActions(prev => {
      const newActions = [...prev];
      newActions[index] = {
        ...newActions[index],
        config: { ...newActions[index].config, ...configUpdates }
      };
      return newActions;
    });
    setHasChanges(true);
  }

  // Handle approve
  function handleApprove() {
    const enabledCount = actions.filter(a => a.enabled).length;
    if (enabledCount === 0) {
      toast({ 
        variant: 'destructive', 
        title: 'אין פעולות מופעלות', 
        description: 'יש לבחור לפחות פעולה אחת לביצוע' 
      });
      return;
    }
    
    if (!confirm(`האם לאשר ולבצע ${enabledCount} פעולות?`)) return;
    approveMutation.mutate();
  }

  // Handle cancel
  function handleCancel() {
    if (!confirm('האם לבטל את כל הפעולות?')) return;
    cancelMutation.mutate();
  }

  // Status badge
  function getStatusBadge(status) {
    const variants = {
      pending: { color: 'bg-yellow-100 text-yellow-700', label: 'ממתין' },
      editing: { color: 'bg-blue-100 text-blue-700', label: 'בעריכה' },
      approved: { color: 'bg-green-100 text-green-700', label: 'אושר' },
      executing: { color: 'bg-purple-100 text-purple-700', label: 'מבצע' },
      executed: { color: 'bg-green-100 text-green-700', label: 'בוצע' },
      cancelled: { color: 'bg-gray-100 text-gray-700', label: 'בוטל' },
      failed: { color: 'bg-red-100 text-red-700', label: 'נכשל' }
    };
    const v = variants[status] || variants.pending;
    return <Badge className={v.color}>{v.label}</Badge>;
  }

  // Loading/Error states
  if (!batchId) {
    return (
      <div className="p-6 text-center">
        <p className="text-slate-600">לא סופק מזהה באטש</p>
        <Button onClick={() => navigate(createPageUrl('ApprovalQueue'))} className="mt-4">
          חזרה לתור האישורים
        </Button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-slate-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-center">
        <XCircle className="w-12 h-12 mx-auto text-red-500 mb-4" />
        <p className="text-red-600">{error.message}</p>
        <Button onClick={() => navigate(createPageUrl('ApprovalQueue'))} className="mt-4">
          חזרה לתור האישורים
        </Button>
      </div>
    );
  }

  const batch = batchData;
  const isEditable = ['pending', 'editing'].includes(batch?.status);
  const isExpired = batch?.expires_at && new Date(batch.expires_at) < new Date();

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-200">
            עריכת אישור
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            {batch?.automation_rule_name}
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => navigate(createPageUrl('ApprovalQueue'))}
          className="gap-2"
        >
          <ArrowRight className="w-4 h-4" />
          חזרה
        </Button>
      </div>

      {/* Batch Info Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">פרטי הבאטש</CardTitle>
            {getStatusBadge(batch?.status)}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-slate-500" />
              <span className="text-slate-600 dark:text-slate-400">נושא:</span>
              <span className="font-medium dark:text-slate-200">{batch?.mail_subject || '-'}</span>
            </div>
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-slate-500" />
              <span className="text-slate-600 dark:text-slate-400">מאת:</span>
              <span className="font-medium dark:text-slate-200">{batch?.mail_from || '-'}</span>
            </div>
            {batch?.case_name && (
              <div className="flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-slate-500" />
                <span className="text-slate-600 dark:text-slate-400">תיק:</span>
                <span className="font-medium dark:text-slate-200">{batch.case_name}</span>
              </div>
            )}
            {batch?.client_name && (
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-slate-500" />
                <span className="text-slate-600 dark:text-slate-400">לקוח:</span>
                <span className="font-medium dark:text-slate-200">{batch.client_name}</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-500" />
              <span className="text-slate-600 dark:text-slate-400">תוקף:</span>
              <span className={`font-medium ${isExpired ? 'text-red-600' : 'dark:text-slate-200'}`}>
                {batch?.expires_at ? format(new Date(batch.expires_at), 'dd/MM/yyyy HH:mm') : '-'}
                {isExpired && ' (פג תוקף)'}
              </span>
            </div>
          </div>

          {isExpired && isEditable && (
            <div className="bg-amber-50 dark:bg-amber-900/20 p-3 rounded-lg flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              <span className="text-amber-700 dark:text-amber-400 text-sm">
                קישור האישור המהיר פג תוקף. ניתן לאשר מכאן.
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">
          פעולות ({actions.filter(a => a.enabled).length}/{actions.length} פעילות)
        </h2>

        {actions.map((action, index) => {
          const Icon = ACTION_ICONS[action.action_type] || FileText;
          const label = ACTION_LABELS[action.action_type] || action.action_type;
          
          return (
            <Card key={index} className={`${!action.enabled ? 'opacity-60' : ''}`}>
              <CardContent className="pt-4">
                <div className="flex items-start gap-4">
                  {/* Enable/Disable Toggle */}
                  <div className="pt-1">
                    <Switch
                      checked={action.enabled}
                      onCheckedChange={(checked) => updateAction(index, { enabled: checked })}
                      disabled={!isEditable}
                    />
                  </div>

                  {/* Icon */}
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    action.enabled ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-400'
                  }`}>
                    <Icon className="w-5 h-5" />
                  </div>

                  {/* Content */}
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-800 dark:text-slate-200">{label}</span>
                    </div>

                    {/* Action-specific editors */}
                    {action.enabled && isEditable && (
                      <ActionEditor
                        action={action}
                        onChange={(updates) => updateActionConfig(index, updates)}
                      />
                    )}

                    {/* Read-only view for non-editable */}
                    {(!isEditable || !action.enabled) && action.config && (
                      <pre className="text-xs bg-slate-50 dark:bg-slate-800 p-2 rounded overflow-auto max-h-32">
                        {JSON.stringify(action.config, null, 2)}
                      </pre>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Execution Summary (if already executed) */}
      {batch?.execution_summary && (
        <Card className="border-green-200 bg-green-50 dark:bg-green-900/20">
          <CardHeader>
            <CardTitle className="text-lg text-green-700 dark:text-green-400">
              סיכום ביצוע
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold text-slate-800 dark:text-slate-200">
                  {batch.execution_summary.total}
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-400">סה"כ</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-green-600">
                  {batch.execution_summary.success}
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-400">הצלחות</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-red-600">
                  {batch.execution_summary.failed}
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-400">נכשלו</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-500">
                  {batch.execution_summary.skipped}
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-400">דולגו</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Actions Buttons */}
      {isEditable && (
        <div className="flex gap-4 justify-end sticky bottom-4 bg-white dark:bg-slate-900 p-4 rounded-lg shadow-lg border">
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={cancelMutation.isPending}
            className="text-red-600 border-red-200 hover:bg-red-50"
          >
            <XCircle className="w-4 h-4 mr-2" />
            ביטול
          </Button>
          
          {hasChanges && (
            <Button
              variant="outline"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              שמור שינויים
            </Button>
          )}
          
          <Button
            onClick={handleApprove}
            disabled={approveMutation.isPending || actions.filter(a => a.enabled).length === 0}
            className="bg-green-600 hover:bg-green-700"
          >
            {approveMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Play className="w-4 h-4 mr-2" />
            )}
            אשר ובצע ({actions.filter(a => a.enabled).length})
          </Button>
        </div>
      )}
    </div>
  );
}

// Action-specific editor component
function ActionEditor({ action, onChange }) {
  const config = action.config || {};

  switch (action.action_type) {
    case 'send_email':
      return (
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-slate-500">נמען (לא ניתן לשינוי)</Label>
            <Input value={config.to || ''} disabled className="bg-slate-50" />
          </div>
          <div>
            <Label className="text-xs text-slate-500">נושא</Label>
            <Input
              value={config.subject || ''}
              onChange={(e) => onChange({ subject: e.target.value })}
              maxLength={300}
            />
          </div>
          <div>
            <Label className="text-xs text-slate-500">תוכן</Label>
            <Textarea
              value={config.body || ''}
              onChange={(e) => onChange({ body: e.target.value })}
              rows={4}
            />
          </div>
        </div>
      );

    case 'billing':
      return (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-slate-500">שעות</Label>
              <Select
                value={String(config.hours || 0.25)}
                onValueChange={(v) => onChange({ hours: parseFloat(v) })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24].map(h => (
                    <SelectItem key={h} value={String(h)}>{h} שעות</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-slate-500">תעריף שעתי</Label>
              <Input
                type="number"
                value={config.rate || config.hourly_rate || 800}
                onChange={(e) => onChange({ rate: parseFloat(e.target.value) })}
              />
            </div>
          </div>
          <div>
            <Label className="text-xs text-slate-500">תיאור</Label>
            <Input
              value={config.description || ''}
              onChange={(e) => onChange({ description: e.target.value })}
            />
          </div>
        </div>
      );

    case 'create_task':
      return (
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-slate-500">כותרת</Label>
            <Input
              value={config.title || ''}
              onChange={(e) => onChange({ title: e.target.value })}
            />
          </div>
          <div>
            <Label className="text-xs text-slate-500">תיאור</Label>
            <Textarea
              value={config.description || ''}
              onChange={(e) => onChange({ description: e.target.value })}
              rows={2}
            />
          </div>
          <div>
            <Label className="text-xs text-slate-500">תאריך יעד</Label>
            <Input
              type="date"
              value={config.due_date || ''}
              onChange={(e) => onChange({ due_date: e.target.value })}
            />
          </div>
        </div>
      );

    case 'calendar_event':
      return (
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-slate-500">כותרת</Label>
            <Input
              value={config.title || config.title_template || ''}
              onChange={(e) => onChange({ title: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-slate-500">תאריך</Label>
              <Input
                type="date"
                value={config.start_date || ''}
                onChange={(e) => onChange({ start_date: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs text-slate-500">משך (דקות)</Label>
              <Input
                type="number"
                value={config.duration_minutes || 60}
                onChange={(e) => onChange({ duration_minutes: parseInt(e.target.value) })}
              />
            </div>
          </div>
        </div>
      );

    case 'save_file':
      return (
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-slate-500">נתיב ב-Dropbox (לא ניתן לשינוי)</Label>
            <Input value={config.path || config.dropbox_folder_path || ''} disabled className="bg-slate-50" />
          </div>
        </div>
      );

    default:
      return (
        <pre className="text-xs bg-slate-50 dark:bg-slate-800 p-2 rounded overflow-auto max-h-32">
          {JSON.stringify(config, null, 2)}
        </pre>
      );
  }
}