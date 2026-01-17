import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '../api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart, Activity, TrendingUp, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';

export default function AutomationMetrics() {
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['automationLogs'],
    queryFn: () => base44.entities.AutomationLog.list('-executed_at', 100),
  });

  const { data: rules = [] } = useQuery({
    queryKey: ['automationRules'],
    queryFn: () => base44.entities.AutomationRule.list(),
  });

  // חישוב סטטיסטיקות כלליות
  const totalExecutions = logs.length;
  const successfulExecutions = logs.filter(l => l.execution_status === 'completed').length;
  const failedExecutions = logs.filter(l => l.execution_status === 'failed').length;
  const successRate = totalExecutions > 0 ? ((successfulExecutions / totalExecutions) * 100).toFixed(1) : 0;
  
  const avgExecutionTime = logs.length > 0
    ? (logs.reduce((sum, log) => sum + (log.execution_time_ms || 0), 0) / logs.length).toFixed(0)
    : 0;

  // Top rules by execution count
  const ruleExecutionCounts = logs.reduce((acc, log) => {
    acc[log.rule_name] = (acc[log.rule_name] || 0) + 1;
    return acc;
  }, {});
  
  const topRules = Object.entries(ruleExecutionCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  if (isLoading) return <div>טוען...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">📊 מטריקות אוטומציות</h1>
        <p className="text-slate-500 mt-1">מעקב אחר ביצועי חוקי האוטומציה</p>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">סה"כ ביצועים</CardTitle>
            <Activity className="w-4 h-4 text-slate-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalExecutions}</div>
            <p className="text-xs text-slate-500 mt-1">חוקים שהופעלו</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">אחוז הצלחה</CardTitle>
            <TrendingUp className="w-4 h-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{successRate}%</div>
            <p className="text-xs text-slate-500 mt-1">{successfulExecutions} מתוך {totalExecutions}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">כישלונות</CardTitle>
            <AlertCircle className="w-4 h-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{failedExecutions}</div>
            <p className="text-xs text-slate-500 mt-1">דורש תשומת לב</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">זמן ממוצע</CardTitle>
            <BarChart className="w-4 h-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{avgExecutionTime}ms</div>
            <p className="text-xs text-slate-500 mt-1">לביצוע חוק</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts & Tables */}
      <Tabs defaultValue="logs" className="w-full">
        <TabsList>
          <TabsTrigger value="logs">לוג ביצועים</TabsTrigger>
          <TabsTrigger value="rules">ביצועים לפי חוק</TabsTrigger>
          <TabsTrigger value="top">חוקים פופולריים</TabsTrigger>
        </TabsList>

        <TabsContent value="logs">
          <Card>
            <CardHeader>
              <CardTitle>100 ביצועים אחרונים</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {logs.slice(0, 20).map(log => (
                  <div key={log.id} className="flex items-center justify-between p-3 border rounded">
                    <div className="flex-1">
                      <p className="font-medium">{log.rule_name}</p>
                      <p className="text-sm text-slate-500">{log.mail_subject}</p>
                      <p className="text-xs text-slate-400">
                        {format(new Date(log.executed_at), 'dd/MM/yyyy HH:mm', { locale: he })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={
                        log.execution_status === 'completed' ? 'success' :
                        log.execution_status === 'failed' ? 'destructive' : 'secondary'
                      }>
                        {log.execution_status}
                      </Badge>
                      <span className="text-xs text-slate-500">{log.execution_time_ms}ms</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rules">
          <Card>
            <CardHeader>
              <CardTitle>ביצועים לפי חוק</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {rules.map(rule => {
                  const stats = rule.metadata?.stats || {};
                  return (
                    <div key={rule.id} className="flex items-center justify-between p-3 border rounded">
                      <div>
                        <p className="font-medium">{rule.name}</p>
                        <p className="text-sm text-slate-500">
                          {stats.total_executions || 0} ביצועים
                        </p>
                      </div>
                      <div className="text-left">
                        <div className="text-lg font-bold text-green-600">
                          {stats.success_rate ? stats.success_rate.toFixed(1) : 0}%
                        </div>
                        <p className="text-xs text-slate-500">
                          {stats.successful_executions || 0}/{stats.total_executions || 0} הצלחות
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="top">
          <Card>
            <CardHeader>
              <CardTitle>Top 5 חוקים פעילים</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {topRules.map(([ruleName, count], index) => (
                  <div key={ruleName} className="flex items-center gap-3">
                    <div className="text-2xl font-bold text-slate-300">#{index + 1}</div>
                    <div className="flex-1">
                      <p className="font-medium">{ruleName}</p>
                    </div>
                    <Badge>{count} ביצועים</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
