import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useTranslation } from 'react-i18next';
import { format, subDays, startOfDay, eachDayOfInterval } from 'date-fns';
import { he } from 'date-fns/locale';
import PageHeader from '../components/ui/PageHeader';
import {
  Mail,
  TrendingUp,
  Clock,
  Target,
  BarChart3,
  PieChart as PieChartIcon,
  AlertCircle,
  CheckCircle2,
  Loader2
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];

export default function MailAnalytics() {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'he';
  const [dateRange, setDateRange] = useState('30');
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const checkAdmin = async () => {
      try {
        const u = await base44.auth.me();
        setUser(u);
        setIsAdmin(u?.role === 'admin');
      } catch (e) {
        setIsAdmin(false);
      }
    };
    checkAdmin();
  }, []);

  const { data: mails = [], isLoading: mailsLoading } = useQuery({
    queryKey: ['mails-analytics'],
    queryFn: () => base44.entities.Mail.list('-received_at', 1000),
    staleTime: 5 * 60 * 1000,
    enabled: isAdmin,
  });

  const { data: tasks = [], isLoading: tasksLoading } = useQuery({
    queryKey: ['tasks-analytics'],
    queryFn: () => base44.entities.Task.list('-created_date', 1000),
    staleTime: 5 * 60 * 1000,
    enabled: isAdmin,
  });

  const { data: rules = [] } = useQuery({
    queryKey: ['rules-analytics'],
    queryFn: () => base44.entities.MailRule.list(),
    staleTime: 5 * 60 * 1000,
    enabled: isAdmin,
  });

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md dark:bg-slate-800 dark:border-slate-700">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="w-12 h-12 mx-auto text-amber-500 mb-4" />
            <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-200 mb-2">
              {t('mail_analytics.access_restricted')}
            </h2>
            <p className="text-slate-500 dark:text-slate-400">
              {t('mail_analytics.admin_only')}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isLoading = mailsLoading || tasksLoading;

  // Filter by date range
  const daysAgo = parseInt(dateRange);
  const startDate = startOfDay(subDays(new Date(), daysAgo));
  
  const filteredMails = mails.filter(m => new Date(m.received_at) >= startDate);
  const filteredTasks = tasks.filter(t => new Date(t.created_date) >= startDate);

  // Calculate stats
  const totalMails = filteredMails.length;
  const autoTriagedMails = filteredMails.filter(m => m.auto_triaged).length;
  const autoTriageRate = totalMails > 0 ? Math.round((autoTriagedMails / totalMails) * 100) : 0;

  const completedTasks = filteredTasks.filter(t => t.status === 'completed');
  const tasksWithOverride = filteredTasks.filter(t => t.manual_override);
  const accuracyRate = filteredTasks.length > 0 
    ? Math.round(((filteredTasks.length - tasksWithOverride.length) / filteredTasks.length) * 100) 
    : 100;

  const totalTimeSaved = filteredTasks.reduce((sum, t) => sum + (t.time_saved_minutes || 0), 0);
  const hoursSaved = Math.round(totalTimeSaved / 60 * 10) / 10;

  // Mail volume by day
  const days = eachDayOfInterval({ start: startDate, end: new Date() });
  const mailVolumeData = days.map(day => {
    const dayStr = format(day, 'yyyy-MM-dd');
    const count = filteredMails.filter(m => 
      format(new Date(m.received_at), 'yyyy-MM-dd') === dayStr
    ).length;
    return {
      date: format(day, 'dd/MM', { locale: isRTL ? he : undefined }),
      count,
    };
  });

  // Rule distribution
  const ruleDistribution = {};
  filteredTasks.forEach(task => {
    const ruleName = task.extracted_data?.rule_name || t('mail_analytics.no_rule');
    ruleDistribution[ruleName] = (ruleDistribution[ruleName] || 0) + 1;
  });
  const ruleDistributionData = Object.entries(ruleDistribution).map(([name, value]) => ({
    name,
    value,
  }));

  // Actions executed
  const actionCounts = {};
  completedTasks.forEach(task => {
    const log = task.extracted_data?.execution_log || [];
    log.forEach(entry => {
      if (entry.status === 'success') {
        actionCounts[entry.action_type] = (actionCounts[entry.action_type] || 0) + 1;
      }
    });
  });

  const getActionLabel = (type) => {
    const labels = {
      log_time: t('mail_analytics.action_log_time'),
      create_deadline: t('mail_analytics.action_create_deadline'),
      create_task: t('mail_analytics.action_create_task'),
      upload_to_dropbox: t('mail_analytics.action_upload_dropbox'),
      create_calendar_event: t('mail_analytics.action_calendar_event'),
      send_email: t('mail_analytics.action_send_email'),
      create_invoice_draft: t('mail_analytics.action_invoice_draft'),
    };
    return labels[type] || type;
  };

  const actionDistributionData = Object.entries(actionCounts).map(([name, value]) => ({
    name: getActionLabel(name),
    value,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <PageHeader
          title={t('mail_analytics.title')}
          subtitle={t('mail_analytics.subtitle')}
        />
        <Select value={dateRange} onValueChange={setDateRange}>
          <SelectTrigger className="w-40 bg-white dark:bg-slate-800 dark:border-slate-700">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
            <SelectItem value="7" className="dark:text-slate-200">{t('mail_analytics.days_7')}</SelectItem>
            <SelectItem value="30" className="dark:text-slate-200">{t('mail_analytics.days_30')}</SelectItem>
            <SelectItem value="90" className="dark:text-slate-200">{t('mail_analytics.days_90')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
        </div>
      ) : (
        <>
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="dark:bg-slate-800 dark:border-slate-700">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {t('mail_analytics.incoming_emails')}
                    </p>
                    <p className="text-3xl font-bold text-slate-800 dark:text-slate-200 mt-1">
                      {totalMails}
                    </p>
                  </div>
                  <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                    <Mail className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="dark:bg-slate-800 dark:border-slate-700">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {t('mail_analytics.auto_triage_rate')}
                    </p>
                    <p className="text-3xl font-bold text-green-600 dark:text-green-400 mt-1">
                      {autoTriageRate}%
                    </p>
                  </div>
                  <div className="w-12 h-12 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                    <TrendingUp className="w-6 h-6 text-green-600 dark:text-green-400" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="dark:bg-slate-800 dark:border-slate-700">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {t('mail_analytics.accuracy_rate')}
                    </p>
                    <p className="text-3xl font-bold text-purple-600 dark:text-purple-400 mt-1">
                      {accuracyRate}%
                    </p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                      {t('mail_analytics.manual_overrides', { count: tasksWithOverride.length })}
                    </p>
                  </div>
                  <div className="w-12 h-12 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                    <Target className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="dark:bg-slate-800 dark:border-slate-700">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {t('mail_analytics.hours_saved')}
                    </p>
                    <p className="text-3xl font-bold text-amber-600 dark:text-amber-400 mt-1">
                      {hoursSaved}
                    </p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                      {t('mail_analytics.minutes_saved', { count: totalTimeSaved })}
                    </p>
                  </div>
                  <div className="w-12 h-12 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                    <Clock className="w-6 h-6 text-amber-600 dark:text-amber-400" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Mail Volume Chart */}
            <Card className="dark:bg-slate-800 dark:border-slate-700">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 dark:text-slate-200">
                  <BarChart3 className="w-5 h-5" />
                  {t('mail_analytics.daily_volume')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={mailVolumeData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-700" />
                      <XAxis 
                        dataKey="date" 
                        tick={{ fontSize: 12 }} 
                        className="fill-slate-500 dark:fill-slate-400"
                      />
                      <YAxis 
                        tick={{ fontSize: 12 }} 
                        className="fill-slate-500 dark:fill-slate-400"
                      />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'var(--tooltip-bg, #1e293b)',
                          border: 'none',
                          borderRadius: '8px',
                          color: 'var(--tooltip-color, #f1f5f9)'
                        }}
                      />
                      <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Rule Distribution Chart */}
            <Card className="dark:bg-slate-800 dark:border-slate-700">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 dark:text-slate-200">
                  <PieChartIcon className="w-5 h-5" />
                  {t('mail_analytics.rule_distribution')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  {ruleDistributionData.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-slate-400">
                      {t('mail_analytics.no_data')}
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={ruleDistributionData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {ruleDistributionData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: 'var(--tooltip-bg, #1e293b)',
                            border: 'none',
                            borderRadius: '8px',
                            color: 'var(--tooltip-color, #f1f5f9)'
                          }}
                        />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Actions Executed Chart */}
            <Card className="dark:bg-slate-800 dark:border-slate-700 lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 dark:text-slate-200">
                  <CheckCircle2 className="w-5 h-5" />
                  {t('mail_analytics.actions_executed')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  {actionDistributionData.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-slate-400">
                      {t('mail_analytics.no_data')}
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={actionDistributionData} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-700" />
                        <XAxis type="number" tick={{ fontSize: 12 }} className="fill-slate-500 dark:fill-slate-400" />
                        <YAxis 
                          type="category" 
                          dataKey="name" 
                          tick={{ fontSize: 12 }} 
                          width={120}
                          className="fill-slate-500 dark:fill-slate-400"
                        />
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: 'var(--tooltip-bg, #1e293b)',
                            border: 'none',
                            borderRadius: '8px',
                            color: 'var(--tooltip-color, #f1f5f9)'
                          }}
                        />
                        <Bar dataKey="value" fill="#10b981" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}