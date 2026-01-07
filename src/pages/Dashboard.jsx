import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { format, addDays, isAfter, isBefore, startOfMonth, endOfMonth } from 'date-fns';
import { he } from 'date-fns/locale';
import StatsCard from '../components/ui/StatsCard';
import StatusBadge from '../components/ui/StatusBadge';
import {
  Briefcase,
  Calendar,
  AlertTriangle,
  Receipt,
  Clock,
  ArrowLeft,
  FileText
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export default function Dashboard() {
  const today = new Date();
  const in30Days = addDays(today, 30);

  const { data: cases = [], isLoading: casesLoading } = useQuery({
    queryKey: ['cases'],
    queryFn: () => base44.entities.Case.list('-created_date', 100),
  });

  const { data: deadlines = [], isLoading: deadlinesLoading } = useQuery({
    queryKey: ['deadlines'],
    queryFn: () => base44.entities.Deadline.list('-due_date', 100),
  });

  const { data: tasks = [], isLoading: tasksLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => base44.entities.Task.list('-created_date', 100),
  });

  const { data: invoices = [], isLoading: invoicesLoading } = useQuery({
    queryKey: ['invoices'],
    queryFn: () => base44.entities.Invoice.list('-created_date', 100),
  });

  const { data: clients = [] } = useQuery({
    queryKey: ['clients'],
    queryFn: () => base44.entities.Client.list('-created_date', 100),
  });

  // Calculate stats
  const activeCases = cases.filter(c => !['abandoned', 'expired'].includes(c.status)).length;
  
  const upcomingDeadlines = deadlines.filter(d => {
    const dueDate = new Date(d.due_date);
    return d.status !== 'completed' && isAfter(dueDate, today) && isBefore(dueDate, in30Days);
  });

  const overdueDeadlines = deadlines.filter(d => {
    const dueDate = new Date(d.due_date);
    return d.status !== 'completed' && isBefore(dueDate, today);
  });

  const overdueTasks = tasks.filter(t => {
    if (t.status === 'completed' || t.status === 'cancelled') return false;
    if (!t.due_date) return false;
    return isBefore(new Date(t.due_date), today);
  });

  const monthStart = startOfMonth(today);
  const monthEnd = endOfMonth(today);
  const monthlyRevenue = invoices
    .filter(i => {
      const issuedDate = new Date(i.issued_date);
      return isAfter(issuedDate, monthStart) && isBefore(issuedDate, monthEnd);
    })
    .reduce((sum, i) => sum + (i.total || 0), 0);

  const isLoading = casesLoading || deadlinesLoading || tasksLoading || invoicesLoading;

  const getClientName = (clientId) => {
    const client = clients.find(c => c.id === clientId);
    return client?.name || '-';
  };

  const getCaseNumber = (caseId) => {
    const caseItem = cases.find(c => c.id === caseId);
    return caseItem?.case_number || '-';
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">לוח בקרה</h1>
        <p className="text-slate-500 mt-1">סקירה כללית של מערכת ניהול הקניין הרוחני</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatsCard
          title="תיקים פעילים"
          value={isLoading ? '-' : activeCases}
          icon={Briefcase}
          color="blue"
        />
        <StatsCard
          title="מועדים ב-30 יום"
          value={isLoading ? '-' : upcomingDeadlines.length}
          icon={Calendar}
          color="amber"
        />
        <StatsCard
          title="משימות באיחור"
          value={isLoading ? '-' : overdueTasks.length}
          icon={AlertTriangle}
          color="red"
        />
        <StatsCard
          title="הכנסות החודש"
          value={isLoading ? '-' : `₪${monthlyRevenue.toLocaleString()}`}
          icon={Receipt}
          color="green"
        />
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upcoming Deadlines */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-4">
            <CardTitle className="text-lg font-semibold text-slate-800 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-amber-500" />
              מועדים קרובים
            </CardTitle>
            <Link to={createPageUrl('Docketing')}>
              <Button variant="ghost" size="sm" className="text-slate-500 hover:text-slate-800 gap-1">
                הצג הכל
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {deadlinesLoading ? (
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : upcomingDeadlines.length === 0 ? (
              <p className="text-center text-slate-400 py-8">אין מועדים קרובים</p>
            ) : (
              <div className="space-y-3">
                {upcomingDeadlines.slice(0, 5).map((deadline) => (
                  <div 
                    key={deadline.id}
                    className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors"
                  >
                    <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-amber-100 flex flex-col items-center justify-center">
                      <span className="text-xs font-medium text-amber-600">
                        {format(new Date(deadline.due_date), 'MMM', { locale: he })}
                      </span>
                      <span className="text-lg font-bold text-amber-700">
                        {format(new Date(deadline.due_date), 'd')}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-800 truncate">{deadline.description}</p>
                      <p className="text-sm text-slate-500">תיק: {getCaseNumber(deadline.case_id)}</p>
                    </div>
                    <StatusBadge status={deadline.is_critical ? 'critical' : deadline.status} />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Overdue Items */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-4">
            <CardTitle className="text-lg font-semibold text-slate-800 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-rose-500" />
              פריטים באיחור
            </CardTitle>
          </CardHeader>
          <CardContent>
            {tasksLoading ? (
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : overdueTasks.length === 0 && overdueDeadlines.length === 0 ? (
              <div className="text-center py-8">
                <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
                  <Clock className="w-6 h-6 text-green-600" />
                </div>
                <p className="text-slate-500">אין פריטים באיחור</p>
              </div>
            ) : (
              <div className="space-y-3">
                {overdueDeadlines.slice(0, 3).map((deadline) => (
                  <div 
                    key={deadline.id}
                    className="flex items-center gap-4 p-4 bg-rose-50 rounded-xl border border-rose-100"
                  >
                    <Calendar className="w-5 h-5 text-rose-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-800 truncate">{deadline.description}</p>
                      <p className="text-sm text-rose-600">
                        מועד: {format(new Date(deadline.due_date), 'dd/MM/yyyy')}
                      </p>
                    </div>
                    <StatusBadge status="overdue" />
                  </div>
                ))}
                {overdueTasks.slice(0, 3).map((task) => (
                  <div 
                    key={task.id}
                    className="flex items-center gap-4 p-4 bg-rose-50 rounded-xl border border-rose-100"
                  >
                    <FileText className="w-5 h-5 text-rose-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-800 truncate">{task.title}</p>
                      <p className="text-sm text-rose-600">
                        מועד: {format(new Date(task.due_date), 'dd/MM/yyyy')}
                      </p>
                    </div>
                    <StatusBadge status="overdue" />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Cases */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-4">
            <CardTitle className="text-lg font-semibold text-slate-800 flex items-center gap-2">
              <Briefcase className="w-5 h-5 text-blue-500" />
              תיקים אחרונים
            </CardTitle>
            <Link to={createPageUrl('Cases')}>
              <Button variant="ghost" size="sm" className="text-slate-500 hover:text-slate-800 gap-1">
                הצג הכל
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {casesLoading ? (
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : cases.length === 0 ? (
              <p className="text-center text-slate-400 py-8">אין תיקים</p>
            ) : (
              <div className="space-y-3">
                {cases.slice(0, 5).map((caseItem) => (
                  <Link 
                    key={caseItem.id}
                    to={createPageUrl(`CaseView?id=${caseItem.id}`)}
                    className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-slate-800">{caseItem.case_number}</p>
                        <StatusBadge status={caseItem.status} />
                      </div>
                      <p className="text-sm text-slate-500 truncate">{caseItem.title}</p>
                    </div>
                    <span className="text-xs text-slate-400 flex-shrink-0">
                      {getClientName(caseItem.client_id)}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Invoices */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-4">
            <CardTitle className="text-lg font-semibold text-slate-800 flex items-center gap-2">
              <Receipt className="w-5 h-5 text-emerald-500" />
              חשבוניות אחרונות
            </CardTitle>
            <Link to={createPageUrl('Financials')}>
              <Button variant="ghost" size="sm" className="text-slate-500 hover:text-slate-800 gap-1">
                הצג הכל
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {invoicesLoading ? (
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : invoices.length === 0 ? (
              <p className="text-center text-slate-400 py-8">אין חשבוניות</p>
            ) : (
              <div className="space-y-3">
                {invoices.slice(0, 5).map((invoice) => (
                  <div 
                    key={invoice.id}
                    className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-slate-800">{invoice.invoice_number}</p>
                        <StatusBadge status={invoice.status} />
                      </div>
                      <p className="text-sm text-slate-500">{getClientName(invoice.client_id)}</p>
                    </div>
                    <span className="font-semibold text-slate-800">
                      ₪{(invoice.total || 0).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}