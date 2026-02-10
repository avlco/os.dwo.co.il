import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { createPageUrl } from '../utils';
import { useDateTimeSettings } from '../components/DateTimeSettingsProvider';
import EmptyState from '../components/ui/EmptyState';
import {
  CheckCircle,
  XCircle,
  Clock,
  Mail,
  User,
  ArrowRight,
  Edit,
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";

export default function ApprovalQueue() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const { formatDateTime } = useDateTimeSettings();
  const [filterStatus, setFilterStatus] = useState('all');

  // Fetch ApprovalBatches - כל האצוות, ללא סינון ראשוני
  const { data: allBatches = [], isLoading: batchesLoading } = useQuery({
    queryKey: ['approval-batches'],
    queryFn: async () => {
      return await base44.entities.ApprovalBatch.list('-created_date', 500);
    },
  });

  // סינון לפי filterStatus רק לתצוגה (לא בשליפה)
  const batches = useMemo(() => {
    const statusMap = {
      pending: ['pending', 'editing'],
      completed: ['executed'],
      cancelled: ['cancelled', 'failed'],
      all: null
    };

    const allowedStatuses = statusMap[filterStatus];
    if (!allowedStatuses) return allBatches;

    return allBatches.filter(b => allowedStatuses.includes(b.status));
  }, [allBatches, filterStatus]);

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

  // Count stats - always from allBatches (unfiltered)
  const pendingBatches = allBatches.filter(b => ['pending', 'editing'].includes(b.status)).length;
  const executedBatches = allBatches.filter(b => b.status === 'executed').length;
  const failedBatches = allBatches.filter(b => ['cancelled', 'failed'].includes(b.status)).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-200">{t('approval_queue.title')}</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            {t('approval_queue.pending_requests', { count: pendingBatches })}
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => navigate(createPageUrl('MailRoom'))}
          className="gap-2"
        >
          <ArrowRight className="w-4 h-4" />
          {t('approval_queue.back_to_mailroom')}
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-4 items-center">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-48 bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
            <SelectItem value="all" className="dark:text-slate-200">{t('common.all')}</SelectItem>
            <SelectItem value="pending" className="dark:text-slate-200">{t('approval_queue.pending_tab')}</SelectItem>
            <SelectItem value="completed" className="dark:text-slate-200">{t('approval_queue.executed_tab')}</SelectItem>
            <SelectItem value="cancelled" className="dark:text-slate-200">{t('approval_queue.failed_tab')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card
          className={`cursor-pointer transition-all ${filterStatus === 'pending' ? 'ring-2 ring-yellow-500 shadow-md' : 'hover:shadow-sm'}`}
          onClick={() => setFilterStatus(filterStatus === 'pending' ? 'all' : 'pending')}
        >
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-sm ${filterStatus === 'pending' ? 'text-yellow-700 dark:text-yellow-300 font-medium' : 'text-slate-600 dark:text-slate-400'}`}>
                  {t('approval_queue.pending_count')}
                </p>
                <p className={`text-2xl font-bold ${filterStatus === 'pending' ? 'text-yellow-700 dark:text-yellow-300' : 'dark:text-slate-200'}`}>
                  {pendingBatches}
                </p>
              </div>
              <Clock className={`w-8 h-8 ${filterStatus === 'pending' ? 'text-yellow-600' : 'text-yellow-600/50'}`} />
            </div>
          </CardContent>
        </Card>
        <Card
          className={`cursor-pointer transition-all ${filterStatus === 'completed' ? 'ring-2 ring-green-500 shadow-md' : 'hover:shadow-sm'}`}
          onClick={() => setFilterStatus(filterStatus === 'completed' ? 'all' : 'completed')}
        >
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-sm ${filterStatus === 'completed' ? 'text-green-700 dark:text-green-300 font-medium' : 'text-slate-600 dark:text-slate-400'}`}>
                  {t('approval_queue.executed_count')}
                </p>
                <p className={`text-2xl font-bold ${filterStatus === 'completed' ? 'text-green-700 dark:text-green-300' : 'text-green-600'}`}>
                  {executedBatches}
                </p>
              </div>
              <CheckCircle className={`w-8 h-8 ${filterStatus === 'completed' ? 'text-green-600' : 'text-green-600/50'}`} />
            </div>
          </CardContent>
        </Card>
        <Card
          className={`cursor-pointer transition-all ${filterStatus === 'cancelled' ? 'ring-2 ring-red-500 shadow-md' : 'hover:shadow-sm'}`}
          onClick={() => setFilterStatus(filterStatus === 'cancelled' ? 'all' : 'cancelled')}
        >
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-sm ${filterStatus === 'cancelled' ? 'text-red-700 dark:text-red-300 font-medium' : 'text-slate-600 dark:text-slate-400'}`}>
                  {t('approval_queue.failed_count')}
                </p>
                <p className={`text-2xl font-bold ${filterStatus === 'cancelled' ? 'text-red-700 dark:text-red-300' : 'text-red-600'}`}>
                  {failedBatches}
                </p>
              </div>
              <XCircle className={`w-8 h-8 ${filterStatus === 'cancelled' ? 'text-red-600' : 'text-red-600/50'}`} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Batches List */}
      {batches.length === 0 && !batchesLoading ? (
        <EmptyState
          icon={CheckCircle}
          title={t('approval_queue.no_batches')}
          description={t('approval_queue.all_processed')}
        />
      ) : (
        <div className="space-y-3">
          {batches.map(batch => {
            const isExpired = batch.expires_at && new Date(batch.expires_at) < new Date();
            const enabledActions = (batch.actions_current || []).filter(a => a.enabled).length;
            const totalActions = (batch.actions_current || []).length;

            return (
              <Card key={batch.id} className="hover:shadow-md transition-shadow dark:bg-slate-800 dark:border-slate-700">
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        {getBatchStatusBadge(batch.status)}
                        {isExpired && ['pending', 'editing'].includes(batch.status) && (
                          <Badge className="bg-orange-100 text-orange-700">
                            <Clock className="w-3 h-3 mr-1" />
                            {t('approval_queue.expired')}
                          </Badge>
                        )}
                        <span className="text-sm text-slate-500">
                          {enabledActions}/{totalActions} {t('approval_queue.actions_count')}
                        </span>
                      </div>

                      <h3 className="font-medium text-slate-800 dark:text-slate-200 truncate">
                        {batch.automation_rule_name || '-'}
                      </h3>

                      <div className="flex items-center gap-4 text-sm text-slate-600 dark:text-slate-400">
                        <span className="flex items-center gap-1 truncate">
                          <Mail className="w-4 h-4 flex-shrink-0" />
                          <span className="truncate">{batch.mail_subject?.substring(0, 50) || '-'}</span>
                        </span>
                        <span className="flex items-center gap-1">
                          <User className="w-4 h-4" />
                          {batch.mail_from?.split('@')[0] || '-'}
                        </span>
                      </div>

                      <p className="text-xs text-slate-500">
                        {t('approval_queue.created_at')} {formatDateTime(batch.created_date)}
                        {batch.approved_at && ` | ${t('common.approved', 'Approved')}: ${formatDateTime(batch.approved_at)}`}
                      </p>
                    </div>

                    <div className="flex gap-2">
                      {['pending', 'editing'].includes(batch.status) &&
                        (currentUser?.role === 'admin' || currentUser?.email?.toLowerCase() === batch.approver_email?.toLowerCase()) && (
                          (currentUser?.email && batch.approver_email && currentUser.email.toLowerCase() === batch.approver_email.toLowerCase()) ||
                          (currentUser?.id && batch.user_id && String(currentUser.id) === String(batch.user_id))
                        ) && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => navigate(createPageUrl('ApprovalBatchEdit') + `?batchId=${batch.id}`)}
                            className="gap-1"
                          >
                            <Edit className="w-4 h-4" />
                            {t('approval_queue.edit')}
                          </Button>
                        </>
                      )}
                      {['executed', 'failed', 'cancelled'].includes(batch.status) && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => navigate(createPageUrl('ApprovalBatchEdit') + `?batchId=${batch.id}`)}
                        >
                          {t('common.details', 'Details')}
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
    </div>
  );
}
