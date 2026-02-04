import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { useTranslation } from 'react-i18next';
import '../components/i18nConfig';
import { addDays, isAfter, isBefore, startOfMonth, endOfMonth } from 'date-fns';
import { useDateTimeSettings } from '../components/DateTimeSettingsProvider';
import StatsCard from '../components/ui/StatsCard';
import StatusBadge from '../components/ui/StatusBadge';
import {
  Briefcase,
  Calendar,
  AlertTriangle,
  Receipt,
  Clock,
  ArrowLeft,
  ArrowRight,
  FileText,
  Mail,
  TrendingUp
} from 'lucide-react';
import PieChart from '../components/charts/PieChart';
import BarChart from '../components/charts/BarChart';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export default function Dashboard() {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'he';
  const { formatDate, formatCalendar } = useDateTimeSettings();
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

  const { data: mails = [] } = useQuery({
    queryKey: ['mails'],
    queryFn: () => base44.entities.Mail.list('-received_at', 100),
  });

  const unprocessedMails = mails.filter(m => m.processing_status === 'pending' || m.processing_status === 'triaged').length;

  const activeCases = cases.filter(c => !['abandoned', 'expired'].includes(c.status)).length;
  
  const upcomingDeadlines = deadlines.filter(d => {
    const dueDate = new Date(d.due_date);
    return d.status !== 'completed' && isAfter(dueDate, today) && isBefore(dueDate, in30Days);
  });

  const overdueDeadlines = deadlines.filter(d => {
    const dueDate = new Date(d.due_date);
    return d.status !== 'completed' && isBefore(dueDate, today);
  });

  const overdueTasks = tasks.filter(task => {
    if (task.status === 'completed' || task.status === 'cancelled') return false;
    if (!task.due_date) return false;
    return isBefore(new Date(task.due_date), today);
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

  const ArrowIcon = isRTL ? ArrowLeft : ArrowRight;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-200">{t('dashboard.title')}</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">{t('dashboard.subtitle')}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-5">
        <StatsCard
          title={t('dashboard.active_cases')}
          value={isLoading ? '-' : activeCases}
          icon={Briefcase}
          color="blue"
        />
        <StatsCard
          title={t('dashboard.deadlines_30_days')}
          value={isLoading ? '-' : upcomingDeadlines.length}
          icon={Calendar}
          color="amber"
        />
        <StatsCard
          title={t('dashboard.overdue_tasks')}
          value={isLoading ? '-' : overdueTasks.length}
          icon={AlertTriangle}
          color="red"
        />
        <StatsCard
          title={t('dashboard.unprocessed_mails')}
          value={isLoading ? '-' : unprocessedMails}
          icon={Mail}
          color="purple"
        />
        <StatsCard
          title={t('dashboard.monthly_revenue')}
          value={isLoading ? '-' : `₪${monthlyRevenue.toLocaleString()}`}
          icon={Receipt}
          color="green"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-slate-200 dark:border-slate-700 dark:bg-slate-800 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-blue-500" />
              {t('dashboard.cases_by_status')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {casesLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <PieChart
                data={[
                  { name: t('dashboard.status_filed'), value: cases.filter(c => c.status === 'filed').length },
                  { name: t('dashboard.status_under_examination'), value: cases.filter(c => c.status === 'under_examination').length },
                  { name: t('dashboard.status_registered'), value: cases.filter(c => c.status === 'registered').length },
                  { name: t('dashboard.status_pending'), value: cases.filter(c => c.status === 'pending').length },
                  { name: t('dashboard.status_other'), value: cases.filter(c => !['filed', 'under_examination', 'registered', 'pending'].includes(c.status)).length },
                ].filter(d => d.value > 0)}
                height={250}
              />
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-200 dark:border-slate-700 dark:bg-slate-800 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
              <FileText className="w-5 h-5 text-amber-500" />
              {t('dashboard.tasks_by_priority')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {tasksLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <BarChart
                data={[
                  { name: t('dashboard.priority_low'), value: tasks.filter(task => task.priority === 'low').length },
                  { name: t('dashboard.priority_medium'), value: tasks.filter(task => task.priority === 'medium').length },
                  { name: t('dashboard.priority_high'), value: tasks.filter(task => task.priority === 'high').length },
                  { name: t('dashboard.priority_critical'), value: tasks.filter(task => task.priority === 'critical').length },
                ]}
                dataKey="value"
                xKey="name"
                color="#f59e0b"
                height={250}
              />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-slate-200 dark:border-slate-700 dark:bg-slate-800 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-4">
            <CardTitle className="text-lg font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-amber-500" />
              {t('dashboard.upcoming_deadlines')}
            </CardTitle>
            <Link to={createPageUrl('Docketing')}>
              <Button variant="ghost" size="sm" className="text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 gap-1">
                {t('dashboard.show_all')}
                <ArrowIcon className="w-4 h-4" />
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
              <p className="text-center text-slate-400 dark:text-slate-500 py-8">{t('dashboard.no_upcoming_deadlines')}</p>
            ) : (
              <div className="space-y-3">
                {upcomingDeadlines.slice(0, 5).map((deadline) => (
                  <div 
                    key={deadline.id}
                    className="flex items-center gap-4 p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                  >
                    <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex flex-col items-center justify-center">
                      <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                        {formatCalendar(deadline.due_date, 'MMM')}
                      </span>
                      <span className="text-lg font-bold text-amber-700 dark:text-amber-300">
                        {formatCalendar(deadline.due_date, 'd')}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-800 dark:text-slate-200 truncate">{deadline.description}</p>
                      <p className="text-sm text-slate-500 dark:text-slate-400">{t('dashboard.case_label')} {getCaseNumber(deadline.case_id)}</p>
                    </div>
                    <StatusBadge status={deadline.is_critical ? 'critical' : deadline.status} />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-200 dark:border-slate-700 dark:bg-slate-800 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-4">
            <CardTitle className="text-lg font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-rose-500" />
              {t('dashboard.overdue_items')}
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
                <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-3">
                  <Clock className="w-6 h-6 text-green-600 dark:text-green-400" />
                </div>
                <p className="text-slate-500 dark:text-slate-400">{t('dashboard.no_overdue_items')}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {overdueDeadlines.slice(0, 3).map((deadline) => (
                  <div 
                    key={deadline.id}
                    className="flex items-center gap-4 p-4 bg-rose-50 dark:bg-rose-900/20 rounded-xl border border-rose-100 dark:border-rose-800"
                  >
                    <Calendar className="w-5 h-5 text-rose-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-800 dark:text-slate-200 truncate">{deadline.description}</p>
                      <p className="text-sm text-rose-600 dark:text-rose-400">
                        {t('dashboard.due_label')} {formatDate(deadline.due_date)}
                      </p>
                    </div>
                    <StatusBadge status="overdue" />
                  </div>
                ))}
                {overdueTasks.slice(0, 3).map((task) => (
                  <div 
                    key={task.id}
                    className="flex items-center gap-4 p-4 bg-rose-50 dark:bg-rose-900/20 rounded-xl border border-rose-100 dark:border-rose-800"
                  >
                    <FileText className="w-5 h-5 text-rose-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-800 dark:text-slate-200 truncate">{task.title}</p>
                      <p className="text-sm text-rose-600 dark:text-rose-400">
                        {t('dashboard.due_label')} {formatDate(task.due_date)}
                      </p>
                    </div>
                    <StatusBadge status="overdue" />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-200 dark:border-slate-700 dark:bg-slate-800 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-4">
            <CardTitle className="text-lg font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
              <Briefcase className="w-5 h-5 text-blue-500" />
              {t('dashboard.recent_cases')}
            </CardTitle>
            <Link to={createPageUrl('Cases')}>
              <Button variant="ghost" size="sm" className="text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 gap-1">
                {t('dashboard.show_all')}
                <ArrowIcon className="w-4 h-4" />
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
              <p className="text-center text-slate-400 dark:text-slate-500 py-8">{t('dashboard.no_cases')}</p>
            ) : (
              <div className="space-y-3">
                {cases.slice(0, 5).map((caseItem) => (
                  <Link 
                    key={caseItem.id}
                    to={createPageUrl(`CaseView?id=${caseItem.id}`)}
                    className="flex items-center gap-4 p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-slate-800 dark:text-slate-200">{caseItem.case_number}</p>
                        <StatusBadge status={caseItem.status} />
                      </div>
                      <p className="text-sm text-slate-500 dark:text-slate-400 truncate">{caseItem.title}</p>
                    </div>
                    <span className="text-xs text-slate-400 dark:text-slate-500 flex-shrink-0">
                      {getClientName(caseItem.client_id)}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-200 dark:border-slate-700 dark:bg-slate-800 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-4">
            <CardTitle className="text-lg font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
              <Receipt className="w-5 h-5 text-emerald-500" />
              {t('dashboard.recent_invoices')}
            </CardTitle>
            <Link to={createPageUrl('Financials')}>
              <Button variant="ghost" size="sm" className="text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 gap-1">
                {t('dashboard.show_all')}
                <ArrowIcon className="w-4 h-4" />
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
              <p className="text-center text-slate-400 dark:text-slate-500 py-8">{t('dashboard.no_invoices')}</p>
            ) : (
              <div className="space-y-3">
                {invoices.slice(0, 5).map((invoice) => (
                  <div 
                    key={invoice.id}
                    className="flex items-center gap-4 p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-slate-800 dark:text-slate-200">{invoice.invoice_number}</p>
                        <StatusBadge status={invoice.status} />
                      </div>
                      <p className="text-sm text-slate-500 dark:text-slate-400">{getClientName(invoice.client_id)}</p>
                    </div>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
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