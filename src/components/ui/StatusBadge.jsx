import React from 'react';
import { Badge } from "@/components/ui/badge";
import { format } from 'date-fns';

const statusConfig = {
  // Case statuses
  draft: { label: 'טיוטה', className: 'bg-slate-100 text-slate-700 border-slate-200' },
  filed: { label: 'הוגש', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  pending: { label: 'ממתין', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  under_examination: { label: 'בבחינה', className: 'bg-purple-50 text-purple-700 border-purple-200' },
  allowed: { label: 'אושר', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  registered: { label: 'רשום', className: 'bg-green-50 text-green-700 border-green-200' },
  abandoned: { label: 'ננטש', className: 'bg-rose-50 text-rose-700 border-rose-200' },
  expired: { label: 'פג תוקף', className: 'bg-red-50 text-red-700 border-red-200' },
  opposed: { label: 'בהתנגדות', className: 'bg-orange-50 text-orange-700 border-orange-200' },
  litigated: { label: 'בליטיגציה', className: 'bg-red-50 text-red-700 border-red-200' },
  
  // Task statuses
  in_progress: { label: 'בביצוע', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  completed: { label: 'הושלם', className: 'bg-green-50 text-green-700 border-green-200' },
  cancelled: { label: 'בוטל', className: 'bg-slate-100 text-slate-600 border-slate-200' },
  awaiting_approval: { label: 'ממתין לאישור', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  
  // Deadline statuses
  upcoming: { label: 'קרוב', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  overdue: { label: 'באיחור', className: 'bg-red-50 text-red-700 border-red-200' },
  waived: { label: 'בוטל', className: 'bg-slate-100 text-slate-600 border-slate-200' },
  
  // Invoice statuses
  sent: { label: 'נשלח', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  viewed: { label: 'נצפה', className: 'bg-purple-50 text-purple-700 border-purple-200' },
  partially_paid: { label: 'שולם חלקית', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  paid: { label: 'שולם', className: 'bg-green-50 text-green-700 border-green-200' },
  
  // Mail processing statuses
  processing: { label: 'מעבד', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  triaged: { label: 'מסווג', className: 'bg-purple-50 text-purple-700 border-purple-200' },
  processed: { label: 'טופל', className: 'bg-green-50 text-green-700 border-green-200' },
  archived: { label: 'בארכיון', className: 'bg-slate-100 text-slate-600 border-slate-200' },
  error: { label: 'שגיאה', className: 'bg-red-50 text-red-700 border-red-200' },
  
  // Priority
  low: { label: 'נמוך', className: 'bg-slate-100 text-slate-600 border-slate-200' },
  medium: { label: 'בינוני', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  high: { label: 'גבוה', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  critical: { label: 'קריטי', className: 'bg-red-50 text-red-700 border-red-200' },
};

export default function StatusBadge({ status }) {
  const config = statusConfig[status] || { label: status, className: 'bg-slate-100 text-slate-700' };
  
  return (
    <Badge variant="outline" className={`font-medium ${config.className}`}>
      {config.label}
    </Badge>
  );
}