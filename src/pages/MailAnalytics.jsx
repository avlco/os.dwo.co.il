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
  const { i18n } = useTranslation();
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
              {isRTL ? 'גישה מוגבלת' : 'Access Restricted'}
            </h2>
            <p className="text-slate-500 dark:text-slate-400">
              {isRTL ? 'דף זה נגיש למנהלים בלבד' : 'This page is only accessible to administrators'}
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
    const ruleName = task.extracted_data?.rule_name || (isRTL ? 'ללא חוק' : 'No Rule');
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
  const actionDistributionData = Object.entries(actionCounts).map(([name, value]) => ({
    name: getActionLabel(name, isRTL),
    value,
  }));

  function getActionLabel(type, isRTL) {
    const labels = {
      log_time: isRTL ? 'רישום שעות' : 'Log Time',
      create_deadline: isRTL ? 'יצירת מועד' : 'Create Deadline',
      create_task: isRTL ? 'יצירת משימה' : 'Create Task',
      upload_to_dropbox: isRTL ? 'העלאה ל-Dropbox' : 'Upload to Dropbox',
      create_calendar_event: isRTL ? 'אירוע יומן' : 'Calendar Event',
      send_email: isRTL ? 'שליחת מייל' : 'Send Email',
      create_invoice_draft: isRTL ? 'טיוטת חשבונית' : 'Invoice Draft',
    };
    return labels[type] || type;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <PageHeader
          title={isRTL ? 'אנליטיקת דואר' : 'Mail Analytics'}
          subtitle={isRTL ? 'סטטיסטיקות ביצועים ואוטומציה' : 'Performance and automation statistics'}
        />
        <Select value={dateRange} onValueChange={setDateRange}>
          <SelectTrigger className="w-40 bg-white dark:bg-slate-800 dark:border-slate-700">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
            <SelectItem value="7">{isRTL ? '7 ימים' : '7 days'}</SelectItem>
            <SelectItem value="30">{isRTL ? '30 ימים' : '30 days'}</SelectItem>
            <SelectItem value="90">{isRTL ? '90 ימים' : '90 days'}</SelectItem>
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
                      {isRTL ? 'מיילים נכנסים' : 'Incoming Emails'}
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
                      {isRTL ? 'שיעור סיווג אוטומטי' : 'Auto-Triage Rate'}
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
                      {isRTL ? 'מדד דיוק' : 'Accuracy Rate'}
                    </p>
                    <p className="text-3xl font-bold text-purple-600 dark:text-purple-400 mt-1">
                      {accuracyRate}%
                    </p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                      {isRTL ? `${tasksWithOverride.length} שינויים ידניים` : `${tasksWithOverride.length} manual overrides`}
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
                      {isRTL ? 'שעות שנחסכו' : 'Hours Saved'}
                    </p>
                    <p className="text-3xl font-bold text-amber-600 dark:text-amber-400 mt-1">
                      {hoursSaved}
                    </p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                      {isRTL ? `${totalTimeSaved} דקות` : `${totalTimeSaved} minutes`}
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
                  {isRTL ? 'נפח דואר יומי' : 'Daily Mail Volume'}
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
                  {isRTL ? 'התפלגות חוקים' : 'Rule Distribution'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  {ruleDistributionData.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-slate-400">
                      {isRTL ? 'אין נתונים' : 'No data'}
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
                  {isRTL ? 'פעולות שבוצעו' : 'Actions Executed'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  {actionDistributionData.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-slate-400">
                      {isRTL ? 'אין נתונים' : 'No data'}
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