import React from 'react';
import { Badge } from "@/components/ui/badge";
import { useTranslation } from 'react-i18next';

export default function StatusBadge({ status }) {
  const { t } = useTranslation();
  
  const statusConfig = {
    // Case statuses
    draft: { labelKey: 'status_labels.draft', className: 'bg-slate-100 text-slate-700 border-slate-200' },
    filed: { labelKey: 'status_labels.filed', className: 'bg-blue-50 text-blue-700 border-blue-200' },
    pending: { labelKey: 'status_labels.pending', className: 'bg-amber-50 text-amber-700 border-amber-200' },
    under_examination: { labelKey: 'status_labels.under_examination', className: 'bg-purple-50 text-purple-700 border-purple-200' },
    allowed: { labelKey: 'status_labels.allowed', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    registered: { labelKey: 'status_labels.registered', className: 'bg-green-50 text-green-700 border-green-200' },
    abandoned: { labelKey: 'status_labels.abandoned', className: 'bg-rose-50 text-rose-700 border-rose-200' },
    expired: { labelKey: 'status_labels.expired', className: 'bg-red-50 text-red-700 border-red-200' },
    opposed: { labelKey: 'status_labels.opposed', className: 'bg-orange-50 text-orange-700 border-orange-200' },
    litigated: { labelKey: 'status_labels.litigated', className: 'bg-red-50 text-red-700 border-red-200' },
    
    // Task statuses
    in_progress: { labelKey: 'status_labels.in_progress', className: 'bg-blue-50 text-blue-700 border-blue-200' },
    completed: { labelKey: 'status_labels.completed', className: 'bg-green-50 text-green-700 border-green-200' },
    cancelled: { labelKey: 'status_labels.cancelled', className: 'bg-slate-100 text-slate-600 border-slate-200' },
    awaiting_approval: { labelKey: 'status_labels.awaiting_approval', className: 'bg-amber-50 text-amber-700 border-amber-200' },
    
    // Deadline statuses
    upcoming: { labelKey: 'status_labels.upcoming', className: 'bg-amber-50 text-amber-700 border-amber-200' },
    overdue: { labelKey: 'common.overdue', className: 'bg-red-50 text-red-700 border-red-200' },
    waived: { labelKey: 'status_labels.waived', className: 'bg-slate-100 text-slate-600 border-slate-200' },
    
    // Invoice statuses
    sent: { labelKey: 'status_labels.sent', className: 'bg-blue-50 text-blue-700 border-blue-200' },
    viewed: { labelKey: 'status_labels.viewed', className: 'bg-purple-50 text-purple-700 border-purple-200' },
    partially_paid: { labelKey: 'status_labels.partially_paid', className: 'bg-amber-50 text-amber-700 border-amber-200' },
    paid: { labelKey: 'status_labels.paid', className: 'bg-green-50 text-green-700 border-green-200' },
    
    // Mail processing statuses
    processing: { labelKey: 'status_labels.processing', className: 'bg-blue-50 text-blue-700 border-blue-200' },
    triaged: { labelKey: 'status_labels.triaged', className: 'bg-purple-50 text-purple-700 border-purple-200' },
    processed: { labelKey: 'status_labels.processed', className: 'bg-green-50 text-green-700 border-green-200' },
    archived: { labelKey: 'status_labels.archived', className: 'bg-slate-100 text-slate-600 border-slate-200' },
    error: { labelKey: 'status_labels.error', className: 'bg-red-50 text-red-700 border-red-200' },
    
    // Priority
    low: { labelKey: 'priority_labels.low', className: 'bg-slate-100 text-slate-600 border-slate-200' },
    medium: { labelKey: 'priority_labels.medium', className: 'bg-blue-50 text-blue-700 border-blue-200' },
    high: { labelKey: 'priority_labels.high', className: 'bg-amber-50 text-amber-700 border-amber-200' },
    critical: { labelKey: 'priority_labels.critical', className: 'bg-red-50 text-red-700 border-red-200' },
    urgent: { labelKey: 'priority_labels.urgent', className: 'bg-red-50 text-red-700 border-red-200' },
  };
  
  const config = statusConfig[status] || { labelKey: null, className: 'bg-slate-100 text-slate-700' };
  const label = config.labelKey ? t(config.labelKey) : status;
  
  return (
    <Badge variant="outline" className={`font-medium ${config.className}`}>
      {label}
    </Badge>
  );
}