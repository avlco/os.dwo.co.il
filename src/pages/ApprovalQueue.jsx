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
  ArrowRight
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

export default function ApprovalQueue() {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'he';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [filterStatus, setFilterStatus] = useState('pending');
  const [selectedApproval, setSelectedApproval] = useState(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');

  // Fetch approval activities
  const { data: approvals = [], isLoading } = useQuery({
    queryKey: ['approvals', filterStatus],
    queryFn: async () => {
      const query = base44.entities.Activity.list('-created_date', 500);
      const activities = await query;
      
      // Filter for approval activities
      return activities.filter(a => 
        a.activity_type === 'approval_request' &&
        (filterStatus === 'all' || a.status === filterStatus)
      );
    },
  });

  // Fetch related data
  const { data: cases = [] } = useQuery({
    queryKey: ['cases'],
    queryFn: () => base44.entities.Case.list('-created_date', 500),
  });

  const { data: clients = [] } = useQuery({
    queryKey: ['clients'],
    queryFn: () => base44.entities.Client.list('-created_date', 500),
  });

  const { data: mails = [] } = useQuery({
    queryKey: ['mails'],
    queryFn: () => base44.entities.Mail.list('-created_date', 500),
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-200">תור אישורים</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            {approvals.filter(a => a.status === 'pending').length} בקשות ממתינות
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
            <SelectItem value="cancelled" className="dark:text-slate-200">נדחו</SelectItem>
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
                  {approvals.filter(a => a.status === 'pending').length}
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
                <p className="text-sm text-slate-600 dark:text-slate-400">אושרו</p>
                <p className="text-2xl font-bold text-green-600">
                  {approvals.filter(a => a.status === 'completed').length}
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
                <p className="text-sm text-slate-600 dark:text-slate-400">נדחו</p>
                <p className="text-2xl font-bold text-red-600">
                  {approvals.filter(a => a.status === 'cancelled').length}
                </p>
              </div>
              <XCircle className="w-8 h-8 text-red-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      {approvals.length === 0 && !isLoading ? (
        <EmptyState
          icon={CheckCircle}
          title="אין בקשות אישור"
          description="כל הבקשות טופלו"
        />
      ) : (
        <DataTable
          columns={columns}
          data={approvals}
          isLoading={isLoading}
          emptyMessage="אין תוצאות"
        />
      )}

      {/* Details/Rejection Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl dark:bg-slate-800 dark:border-slate-700">
          <DialogHeader>
            <DialogTitle className="dark:text-slate-200">
              {selectedApproval?.status === 'pending' ? 'דחיית בקשה' : 'פרטי בקשת אישור'}
            </DialogTitle>
          </DialogHeader>
          
          {selectedApproval && (
            <div className="space-y-4 mt-4">
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
