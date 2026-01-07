import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import PageHeader from '../components/ui/PageHeader';
import StatusBadge from '../components/ui/StatusBadge';
import {
  Mail,
  Inbox,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Eye,
  ArrowRight,
  Filter,
  Search
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

export default function MailRoom() {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');

  const { data: mails = [], isLoading: mailsLoading } = useQuery({
    queryKey: ['mails'],
    queryFn: () => base44.entities.Mail.list('-received_at', 500),
  });

  const { data: tasks = [], isLoading: tasksLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => base44.entities.Task.list('-created_date', 500),
  });

  // Stats
  const totalTasks = tasks.length;
  const urgentTasks = tasks.filter(t => t.priority === 'high' || t.priority === 'critical').length;
  const pendingTasks = tasks.filter(t => t.status === 'pending' || t.status === 'awaiting_approval').length;
  const completedTasks = tasks.filter(t => t.status === 'completed').length;

  const unprocessedMails = mails.filter(m => m.processing_status === 'pending' || m.processing_status === 'triaged').length;

  // Filter tasks
  const filteredTasks = tasks.filter(t => {
    const matchesSearch = t.title?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === 'all' || t.status === filterStatus;
    const matchesPriority = filterPriority === 'all' || t.priority === filterPriority;
    return matchesSearch && matchesStatus && matchesPriority;
  });

  // Filter mails (raw mailbox)
  const filteredMails = mails.filter(m => {
    return m.subject?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.sender_email?.toLowerCase().includes(searchTerm.toLowerCase());
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="חדר דואר"
        subtitle="ניהול מיילים נכנסים ומשימות"
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">סה״כ משימות</p>
                <p className="text-2xl font-bold text-slate-800 mt-1">{totalTasks}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">דחופות</p>
                <p className="text-2xl font-bold text-rose-600 mt-1">{urgentTasks}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-rose-100 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-rose-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">ממתינות</p>
                <p className="text-2xl font-bold text-amber-600 mt-1">{pendingTasks}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center">
                <Clock className="w-6 h-6 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">הושלמו</p>
                <p className="text-2xl font-bold text-green-600 mt-1">{completedTasks}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">מיילים לא מטופלים</p>
                <p className="text-2xl font-bold text-purple-600 mt-1">{unprocessedMails}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center">
                <Inbox className="w-6 h-6 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="tasks" className="space-y-6">
        <TabsList className="bg-white border">
          <TabsTrigger value="tasks">דשבורד משימות</TabsTrigger>
          <TabsTrigger value="mailbox">תיבת דואר גולמית</TabsTrigger>
        </TabsList>

        <TabsContent value="tasks" className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-4 items-center">
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="חיפוש משימות..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pr-10 bg-white"
              />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-40 bg-white">
                <SelectValue placeholder="סטטוס" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">כל הסטטוסים</SelectItem>
                <SelectItem value="pending">ממתין</SelectItem>
                <SelectItem value="awaiting_approval">ממתין לאישור</SelectItem>
                <SelectItem value="in_progress">בביצוע</SelectItem>
                <SelectItem value="completed">הושלם</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterPriority} onValueChange={setFilterPriority}>
              <SelectTrigger className="w-40 bg-white">
                <SelectValue placeholder="עדיפות" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">כל העדיפויות</SelectItem>
                <SelectItem value="low">נמוך</SelectItem>
                <SelectItem value="medium">בינוני</SelectItem>
                <SelectItem value="high">גבוה</SelectItem>
                <SelectItem value="critical">קריטי</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Tasks Table */}
          <Card>
            <CardContent className="p-0">
              <div className="divide-y divide-slate-100">
                {filteredTasks.length === 0 ? (
                  <p className="text-center text-slate-400 py-12">אין משימות</p>
                ) : (
                  filteredTasks.map((task) => (
                    <Link
                      key={task.id}
                      to={createPageUrl(`Workbench?taskId=${task.id}`)}
                      className="flex items-center gap-4 p-4 hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <p className="font-medium text-slate-800">{task.title}</p>
                          <StatusBadge status={task.priority} />
                          <StatusBadge status={task.status} />
                        </div>
                        {task.description && (
                          <p className="text-sm text-slate-500 line-clamp-1">{task.description}</p>
                        )}
                        {task.due_date && (
                          <p className="text-xs text-slate-400 mt-1">
                            מועד: {format(new Date(task.due_date), 'dd/MM/yyyy')}
                          </p>
                        )}
                      </div>
                      <ArrowRight className="w-5 h-5 text-slate-400 flex-shrink-0" />
                    </Link>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="mailbox" className="space-y-4">
          {/* Search */}
          <div className="relative max-w-md">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="חיפוש מיילים..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pr-10 bg-white"
            />
          </div>

          {/* Mails Table */}
          <Card>
            <CardContent className="p-0">
              <div className="divide-y divide-slate-100">
                {filteredMails.length === 0 ? (
                  <p className="text-center text-slate-400 py-12">אין מיילים</p>
                ) : (
                  filteredMails.map((mail) => (
                    <Link
                      key={mail.id}
                      to={createPageUrl(`MailView?mailId=${mail.id}`)}
                      className="flex items-start gap-4 p-4 hover:bg-slate-50 transition-colors"
                    >
                      <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
                        <Mail className="w-5 h-5 text-slate-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <p className="font-medium text-slate-800 line-clamp-1">{mail.subject}</p>
                          {mail.priority && <StatusBadge status={mail.priority} />}
                          {mail.category && (
                            <Badge variant="outline" className="text-xs">
                              {mail.category}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-slate-500">{mail.sender_name || mail.sender_email}</p>
                        <p className="text-xs text-slate-400 mt-1">
                          {format(new Date(mail.received_at), 'dd MMM yyyy, HH:mm', { locale: he })}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={mail.processing_status} />
                        <ArrowRight className="w-5 h-5 text-slate-400" />
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}