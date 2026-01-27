import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { format } from 'date-fns';
import PageHeader from '../components/ui/PageHeader';
import DataTable from '../components/ui/DataTable';
import EmptyState from '../components/ui/EmptyState';
import {
  CheckCircle,
  XCircle,
  Clock,
  Mail,
  Briefcase,
  User,
  AlertCircle,
  MessageSquare,
  ArrowRight,
  Edit,
  Play,
  Package,
  AlertTriangle
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function ApprovalQueue() {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'he';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [filterStatus, setFilterStatus] = useState('pending');
  const [selectedApproval, setSelectedApproval] = useState(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [activeTab, setActiveTab] = useState('batches');

  // Fetch ApprovalBatches (new system)
  const { data: batches = [], isLoading: batchesLoading } = useQuery({
    queryKey: ['approval-batches', filterStatus],
    queryFn: async () => {
      const allBatches = await base44.entities.ApprovalBatch.list('-created_date', 500);
      
      // Map status filter
      const statusMap = {
        pending: ['pending', 'editing'],
        completed: ['executed'],
        cancelled: ['cancelled', 'failed'],
        all: null
      };
      
      const allowedStatuses = statusMap[filterStatus];
      if (!allowedStatuses) return allBatches;
      
      return allBatches.filter(b => allowedStatuses.includes(b.status));
    },
  });

  // Fetch legacy approval activities (for backwards compatibility)
  const { data: legacyApprovals = [], isLoading: legacyLoading } = useQuery({
    queryKey: ['legacy-approvals', filterStatus],
    queryFn: async () => {
      const activities = await base44.entities.Activity.list('-created_date', 500);
      
      // Filter for approval activities
      return activities.filter(a => 
        a.activity_type === 'approval_request' &&
        (filterStatus === 'all' || a.status === filterStatus)
      );
    },
  });

  const isLoading = batchesLoading || legacyLoading;

  // Fetch related data (only for legacy approvals)
  const { data: cases = [] } = useQuery({
    queryKey: ['cases'],
    queryFn: () => base44.entities.Case.list('-created_date', 500),
    enabled: legacyApprovals.length > 0
  });

  const { data: clients = [] } = useQuery({
    queryKey: ['clients'],
    queryFn: () => base44.entities.Client.list('-created_date', 500),
    enabled: legacyApprovals.length > 0
  });

  const { data: mails = [] } = useQuery({
    queryKey: ['mails'],
    queryFn: () => base44.entities.Mail.list('-created_date', 500),
    enabled: legacyApprovals.length > 0
  });

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: async (activityId) => {
      const response = await fetch(`${base44.config.functionsUrl}/handleApprovalWorkflow`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${base44.config.token}`,
        },
        body: JSON.stringify({
          action: 'approve',
          activityId,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to approve');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['approvals']);
      setIsDialogOpen(false);
      setSelectedApproval(null);
    },
  });

  // Reject mutation
  const rejectMutation = useMutation({
    mutationFn: async ({ activityId, reason }) => {
      const response = await fetch(`${base44.config.functionsUrl}/handleApprovalWorkflow`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${base44.config.token}`,
        },
        body: JSON.stringify({
          action: 'reject',
          activityId,
          reason,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to reject');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['approvals']);
      setIsDialogOpen(false);
      setSelectedApproval(null);
      setRejectionReason('');
    },
  });

  const handleApprove = (approval) => {
    if (confirm('האם אתה בטוח שברצונך לאשר פעולה זו?')) {
      approveMutation.mutate(approval.id);
    }
  };

  const handleReject = (approval) => {
    setSelectedApproval(approval);
    setIsDialogOpen(true);
  };

  const submitRejection = () => {
    if (!rejectionReason.trim()) {
      alert('נא להזין סיבת דחייה');
      return;
    }
    rejectMutation.mutate({
      activityId: selectedApproval.id,
      reason: rejectionReason,
    });
  };

  const openDetailsDialog = (approval) => {
    setSelectedApproval(approval);
    setIsDialogOpen(true);
  };

  const getCaseName = (caseId) => {
    const caseItem = cases.find(c => c.id === caseId);
    return caseItem?.case_number || '-';
  };

  const getClientName = (clientId) => {
    const client = clients.find(c => c.id === clientId);
    return client?.name || '-';
  };

  const getMailSubject = (mailId) => {
    const mail = mails.find(m => m.id === mailId);
    return mail?.subject || '-';
  };

  const getActionTypeLabel = (type) => {
    const labels = {
      send_email: 'שליחת מייל',
      create_task: 'יצירת משימה',
      create_deadline: 'יצירת מועד',
      billing: 'חיוב שעות',
      calendar_event: 'אירוע ביומן',
    };
    return labels[type] || type;
  };

  const getStatusBadge = (status) => {
    const variants = {
      pending: { color: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300', label: 'ממתין' },
      completed: { color: 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300', label: 'אושר' },
      cancelled: { color: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300', label: 'נדחה' },
    };
    const variant = variants[status] || variants.pending;
    return <Badge className={variant.color}>{variant.label}</Badge>;
  };

  const isExpired = (approval) => {
    const expiresAt = approval.metadata?.expires_at;
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  };

  const columns = [
    {
      header: 'סטטוס',
      render: (row) => (
        <div className="flex items-center gap-2">
          {getStatusBadge(row.status)}
          {isExpired(row) && row.status === 'pending' && (
            <Badge className="bg-gray-100 text-gray-600">
              <Clock className="w-3 h-3 mr-1" />
              פג תוקף
            </Badge>
          )}
        </div>
      ),
    },
    {
      header: 'סוג פעולה',
      render: (row) => (
        <div className="flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-blue-600" />
          <span className="font-medium dark:text-slate-200">
            {getActionTypeLabel(row.metadata?.action_type)}
          </span>
        </div>
      ),
    },
    {
      header: 'תיק',
      render: (row) => (
        <div className="flex items-center gap-2 text-sm">
          <Briefcase className="w-4 h-4 text-slate-500" />
          <span className="dark:text-slate-300">{getCaseName(row.case_id)}</span>
        </div>
      ),
    },
    {
      header: 'לקוח',
      render: (row) => (
        <span className="text-sm dark:text-slate-300">
          {getClientName(row.metadata?.client_id)}
        </span>
      ),
    },
    {
      header: 'מייל מקורי',
      render: (row) => (
        <div className="flex items-center gap-2 text-sm">
          <Mail className="w-4 h-4 text-slate-500" />
          <span className="dark:text-slate-400 truncate max-w-xs">
            {row.metadata?.mail_subject || getMailSubject(row.metadata?.mail_id)}
          </span>
        </div>
      ),
    },
    {
      header: 'מבוקש על ידי',
      render: (row) => (
        <div className="flex items-center gap-2 text-sm">
          <User className="w-4 h-4 text-slate-500" />
          <span className="dark:text-slate-400">
            {row.metadata?.requested_by?.split('@')[0] || 'מערכת'}
          </span>
        </div>
      ),
    },
    {
      header: 'תאריך',
      render: (row) => (
        <span className="text-sm dark:text-slate-400">
          {format(new Date(row.created_date), 'dd/MM/yyyy HH:mm')}
        </span>
      ),
    },
    {
      header: 'פעולות',
      render: (row) => (
        <div className="flex items-center gap-2">
          {row.status === 'pending' && !isExpired(row) && (
            <>
              <Button
                size="sm"
                variant="ghost"
                className="text-green-600 hover:text-green-700 hover:bg-green-50"
                onClick={() => handleApprove(row)}
                disabled={approveMutation.isPending}
              >
                <CheckCircle className="w-4 h-4 mr-1" />
                אשר
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                onClick={() => handleReject(row)}
                disabled={rejectMutation.isPending}
              >
                <XCircle className="w-4 h-4 mr-1" />
                דחה
              </Button>
            </>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => openDetailsDialog(row)}
          >
            פרטים
          </Button>
        </div>
      ),
    },
  ];

  // Batch status badge
  const getBatchStatusBadge = (status) => {
    const variants = {
      pending: { color: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300', label: 'ממתין' },
      editing: { color: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300', label: 'בעריכה' },
      approved: { color: 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300', label: 'אושר' },
      executing: { color: 'bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300', label: 'מבצע' },
      executed: { color: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300', label: 'בוצע' },
      cancelled: { color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300', label: 'בוטל' },
      failed: { color: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300', label: 'נכשל' },
    };
    const v = variants[status] || variants.pending;
    return <Badge className={v.color}>{v.label}</Badge>;
  };

  // Count stats
  const pendingBatches = batches.filter(b => ['pending', 'editing'].includes(b.status)).length;
  const executedBatches = batches.filter(b => b.status === 'executed').length;
  const failedBatches = batches.filter(b => ['cancelled', 'failed'].includes(b.status)).length;
  const pendingLegacy = legacyApprovals.filter(a => a.status === 'pending').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-200">תור אישורים</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            {pendingBatches + pendingLegacy} בקשות ממתינות
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => navigate(createPageUrl('MailRoom'))}
          className="gap-2"
        >
          <ArrowRight className="w-4 h-4" />
          חזרה לחדר דואר
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-4 items-center">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-48 bg-white dark:bg-slate-800 dark:border-slate-700">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
            <SelectItem value="pending" className="dark:text-slate-200">ממתינים</SelectItem>
            <SelectItem value="completed" className="dark:text-slate-200">אושרו</SelectItem>
            <SelectItem value="cancelled" className="dark:text-slate-200">נדחו/נכשלו</SelectItem>
            <SelectItem value="all" className="dark:text-slate-200">הכל</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600 dark:text-slate-400">ממתינים</p>
                <p className="text-2xl font-bold dark:text-slate-200">
                  {pendingBatches}
                  {pendingLegacy > 0 && <span className="text-sm text-slate-400 mr-1">(+{pendingLegacy} ישנים)</span>}
                </p>
              </div>
              <Clock className="w-8 h-8 text-yellow-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600 dark:text-slate-400">בוצעו</p>
                <p className="text-2xl font-bold text-green-600">
                  {executedBatches}
                </p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600 dark:text-slate-400">בוטלו/נכשלו</p>
                <p className="text-2xl font-bold text-red-600">
                  {failedBatches}
                </p>
              </div>
              <XCircle className="w-8 h-8 text-red-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs: Batches vs Legacy */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="batches" className="gap-2">
            <Package className="w-4 h-4" />
            חבילות אישור ({batches.length})
          </TabsTrigger>
          {legacyApprovals.length > 0 && (
            <TabsTrigger value="legacy" className="gap-2">
              <AlertTriangle className="w-4 h-4" />
              אישורים ישנים ({legacyApprovals.length})
            </TabsTrigger>
          )}
        </TabsList>

        {/* Batches Tab */}
        <TabsContent value="batches" className="mt-4">
          {batches.length === 0 && !batchesLoading ? (
            <EmptyState
              icon={CheckCircle}
              title="אין חבילות אישור"
              description="כל החבילות טופלו"
            />
          ) : (
            <div className="space-y-3">
              {batches.map(batch => {
                const isExpired = batch.expires_at && new Date(batch.expires_at) < new Date();
                const enabledActions = (batch.actions_current || []).filter(a => a.enabled).length;
                const totalActions = (batch.actions_current || []).length;
                
                return (
                  <Card key={batch.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="pt-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-2">
                            {getBatchStatusBadge(batch.status)}
                            {isExpired && ['pending', 'editing'].includes(batch.status) && (
                              <Badge className="bg-orange-100 text-orange-700">
                                <Clock className="w-3 h-3 mr-1" />
                                פג תוקף
                              </Badge>
                            )}
                            <span className="text-sm text-slate-500">
                              {enabledActions}/{totalActions} פעולות
                            </span>
                          </div>
                          
                          <h3 className="font-medium text-slate-800 dark:text-slate-200">
                            {batch.automation_rule_name}
                          </h3>
                          
                          <div className="flex items-center gap-4 text-sm text-slate-600 dark:text-slate-400">
                            <span className="flex items-center gap-1">
                              <Mail className="w-4 h-4" />
                              {batch.mail_subject?.substring(0, 50) || '-'}
                            </span>
                            <span className="flex items-center gap-1">
                              <User className="w-4 h-4" />
                              {batch.mail_from?.split('@')[0] || '-'}
                            </span>
                          </div>
                          
                          <p className="text-xs text-slate-500">
                            נוצר: {format(new Date(batch.created_date), 'dd/MM/yyyy HH:mm')}
                            {batch.approved_at && ` | אושר: ${format(new Date(batch.approved_at), 'dd/MM/yyyy HH:mm')}`}
                          </p>
                        </div>
                        
                        <div className="flex gap-2">
                          {['pending', 'editing'].includes(batch.status) && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => navigate(createPageUrl('ApprovalBatchEdit') + `?batchId=${batch.id}`)}
                                className="gap-1"
                              >
                                <Edit className="w-4 h-4" />
                                עריכה
                              </Button>
                            </>
                          )}
                          {['executed', 'failed'].includes(batch.status) && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => navigate(createPageUrl('ApprovalBatchEdit') + `?batchId=${batch.id}`)}
                            >
                              פרטים
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Legacy Tab */}
        <TabsContent value="legacy" className="mt-4">
          {legacyApprovals.length === 0 ? (
            <EmptyState
              icon={CheckCircle}
              title="אין אישורים ישנים"
              description="כל האישורים הישנים טופלו"
            />
          ) : (
            <>
              <div className="bg-amber-50 dark:bg-amber-900/20 p-3 rounded-lg mb-4 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
                <span className="text-amber-700 dark:text-amber-400 text-sm">
                  אלו אישורים מהמערכת הישנה. אישורים חדשים נוצרים כחבילות.
                </span>
              </div>
              <DataTable
                columns={columns}
                data={legacyApprovals}
                isLoading={legacyLoading}
                emptyMessage="אין תוצאות"
              />
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* Details/Rejection Dialog (for legacy approvals) */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl dark:bg-slate-800 dark:border-slate-700">
          <DialogHeader>
            <DialogTitle className="dark:text-slate-200">
              {selectedApproval?.status === 'pending' ? 'דחיית בקשה (מערכת ישנה)' : 'פרטי בקשת אישור'}
            </DialogTitle>
          </DialogHeader>
          
          {selectedApproval && (
            <div className="space-y-4 mt-4">
              <div className="bg-amber-50 dark:bg-amber-900/20 p-3 rounded-lg flex items-center gap-2 mb-4">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
                <span className="text-amber-700 dark:text-amber-400 text-sm">
                  זוהי בקשה מהמערכת הישנה. בקשות חדשות מנוהלות כחבילות אישור.
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm text-slate-600 dark:text-slate-400">סוג פעולה</Label>
                  <p className="font-medium dark:text-slate-200">
                    {getActionTypeLabel(selectedApproval.metadata?.action_type)}
                  </p>
                </div>
                <div>
                  <Label className="text-sm text-slate-600 dark:text-slate-400">סטטוס</Label>
                  <div className="mt-1">{getStatusBadge(selectedApproval.status)}</div>
                </div>
                <div>
                  <Label className="text-sm text-slate-600 dark:text-slate-400">תיק</Label>
                  <p className="dark:text-slate-200">{getCaseName(selectedApproval.case_id)}</p>
                </div>
                <div>
                  <Label className="text-sm text-slate-600 dark:text-slate-400">לקוח</Label>
                  <p className="dark:text-slate-200">
                    {getClientName(selectedApproval.metadata?.client_id)}
                  </p>
                </div>
              </div>

              <div>
                <Label className="text-sm text-slate-600 dark:text-slate-400">מייל מקורי</Label>
                <p className="dark:text-slate-200">{selectedApproval.metadata?.mail_subject}</p>
                <p className="text-sm text-slate-500">
                  מאת: {selectedApproval.metadata?.mail_from}
                </p>
              </div>

              <div>
                <Label className="text-sm text-slate-600 dark:text-slate-400">פרטי הפעולה</Label>
                <pre className="mt-2 p-3 bg-slate-50 dark:bg-slate-900 rounded text-xs overflow-auto max-h-40 dark:text-slate-300">
                  {JSON.stringify(selectedApproval.metadata?.action_config, null, 2)}
                </pre>
              </div>

              {selectedApproval.status === 'pending' && (
                <div>
                  <Label className="dark:text-slate-300">סיבת דחייה</Label>
                  <Textarea
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    rows={3}
                    placeholder="הזן סיבת דחייה..."
                    className="mt-2 dark:bg-slate-900 dark:border-slate-600"
                  />
                </div>
              )}

              {selectedApproval.status === 'cancelled' && (
                <div>
                  <Label className="text-sm text-slate-600 dark:text-slate-400">סיבת דחייה</Label>
                  <p className="dark:text-slate-200">
                    {selectedApproval.metadata?.rejection_reason || 'לא צוין'}
                  </p>
                </div>
              )}

              {selectedApproval.status !== 'pending' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm text-slate-600 dark:text-slate-400">
                      {selectedApproval.status === 'completed' ? 'אושר על ידי' : 'נדחה על ידי'}
                    </Label>
                    <p className="dark:text-slate-200">
                      {selectedApproval.metadata?.approved_by || '-'}
                    </p>
                  </div>
                  <div>
                    <Label className="text-sm text-slate-600 dark:text-slate-400">תאריך</Label>
                    <p className="dark:text-slate-200">
                      {selectedApproval.metadata?.approved_at 
                        ? format(new Date(selectedApproval.metadata.approved_at), 'dd/MM/yyyy HH:mm')
                        : '-'
                      }
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {selectedApproval?.status === 'pending' && (
            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setIsDialogOpen(false);
                  setRejectionReason('');
                }}
              >
                ביטול
              </Button>
              <Button
                variant="destructive"
                onClick={submitRejection}
                disabled={rejectMutation.isPending || !rejectionReason.trim()}
              >
                <XCircle className="w-4 h-4 mr-2" />
                דחה בקשה
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}