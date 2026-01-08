import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import StatusBadge from '../components/ui/StatusBadge';
import MailRulesPanel from '../components/mailroom/MailRulesPanel';
import {
  Mail,
  Inbox,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  Search,
  Play,
  CheckSquare,
  Square,
  Settings
} from 'lucide-react';
import { Card, CardContent } from "@/components/ui/card";
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
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'he';
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');
  const [processingMail, setProcessingMail] = useState(null);
  const [selectedMails, setSelectedMails] = useState([]);
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [showRules, setShowRules] = useState(false);

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

  // Handle process mail with rules
  const handleProcessMail = async (mailId) => {
    setProcessingMail(mailId);
    try {
      const result = await base44.functions.invoke('processIncomingMail', { mail_id: mailId });
      if (result.data?.task_id) {
        window.location.href = createPageUrl(`Workbench?taskId=${result.data.task_id}`);
      } else {
        alert(t('mail_room.no_rule_found'));
      }
    } catch (e) {
      console.error('Error processing mail:', e);
      alert(t('mail_room.error_processing'));
    } finally {
      setProcessingMail(null);
    }
  };

  // Handle bulk process
  const handleBulkProcess = async () => {
    if (selectedMails.length === 0) return;
    
    setBulkProcessing(true);
    
    for (const mailId of selectedMails) {
      try {
        await base44.functions.invoke('processIncomingMail', { mail_id: mailId });
      } catch (e) {
        console.error('Error processing mail:', mailId, e);
      }
    }
    
    setBulkProcessing(false);
    setSelectedMails([]);
    
    window.location.reload();
  };

  const toggleMailSelection = (mailId) => {
    setSelectedMails(prev => 
      prev.includes(mailId) 
        ? prev.filter(id => id !== mailId)
        : [...prev, mailId]
    );
  };

  const toggleAllMails = () => {
    const unprocessedMailIds = filteredMails
      .filter(m => m.processing_status === 'pending' || !m.processing_status)
      .map(m => m.id);
    
    if (selectedMails.length === unprocessedMailIds.length) {
      setSelectedMails([]);
    } else {
      setSelectedMails(unprocessedMailIds);
    }
  };

  const ArrowIcon = isRTL ? ArrowLeft : ArrowRight;

  // Show Rules Panel when showRules is true
  if (showRules) {
    return <MailRulesPanel onClose={() => setShowRules(false)} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-200 tracking-tight">
            {t('mail_room.title')}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            {t('mail_room.subtitle')}
          </p>
        </div>
        <Button 
          variant="outline" 
          onClick={() => setShowRules(true)}
          className="gap-2 dark:border-slate-600 dark:hover:bg-slate-700"
        >
          <Settings className="w-4 h-4" />
          {t('mail_room.rule_settings')}
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card className="dark:bg-slate-800 dark:border-slate-700">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500 dark:text-slate-400">{t('mail_room.total_tasks')}</p>
                <p className="text-2xl font-bold text-slate-800 dark:text-slate-200 mt-1">{totalTasks}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="dark:bg-slate-800 dark:border-slate-700">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500 dark:text-slate-400">{t('mail_room.urgent')}</p>
                <p className="text-2xl font-bold text-rose-600 dark:text-rose-400 mt-1">{urgentTasks}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-rose-600 dark:text-rose-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="dark:bg-slate-800 dark:border-slate-700">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500 dark:text-slate-400">{t('mail_room.pending')}</p>
                <p className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">{pendingTasks}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <Clock className="w-6 h-6 text-amber-600 dark:text-amber-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="dark:bg-slate-800 dark:border-slate-700">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500 dark:text-slate-400">{t('mail_room.completed')}</p>
                <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">{completedTasks}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-green-600 dark:text-green-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="dark:bg-slate-800 dark:border-slate-700">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500 dark:text-slate-400">{t('mail_room.unprocessed')}</p>
                <p className="text-2xl font-bold text-purple-600 dark:text-purple-400 mt-1">{unprocessedMails}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                <Inbox className="w-6 h-6 text-purple-600 dark:text-purple-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="tasks" className="space-y-6">
        <TabsList className="bg-white dark:bg-slate-800 border dark:border-slate-700">
          <TabsTrigger value="tasks" className="dark:text-slate-300 dark:data-[state=active]:bg-slate-700">
            {t('mail_room.tasks_tab')}
          </TabsTrigger>
          <TabsTrigger value="mailbox" className="dark:text-slate-300 dark:data-[state=active]:bg-slate-700">
            {t('mail_room.mailbox_tab')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tasks" className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-4 items-center">
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className={`absolute ${isRTL ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400`} />
              <Input
                placeholder={t('mail_room.search_tasks')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={`${isRTL ? 'pr-10' : 'pl-10'} bg-white dark:bg-slate-800 dark:border-slate-700`}
              />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-40 bg-white dark:bg-slate-800 dark:border-slate-700">
                <SelectValue placeholder={t('mail_room.status_filter')} />
              </SelectTrigger>
              <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
                <SelectItem value="all" className="dark:text-slate-200">{t('mail_room.all_statuses')}</SelectItem>
                <SelectItem value="pending" className="dark:text-slate-200">{t('mail_room.status_pending')}</SelectItem>
                <SelectItem value="awaiting_approval" className="dark:text-slate-200">{t('mail_room.status_awaiting')}</SelectItem>
                <SelectItem value="in_progress" className="dark:text-slate-200">{t('mail_room.status_in_progress')}</SelectItem>
                <SelectItem value="completed" className="dark:text-slate-200">{t('mail_room.status_completed')}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterPriority} onValueChange={setFilterPriority}>
              <SelectTrigger className="w-40 bg-white dark:bg-slate-800 dark:border-slate-700">
                <SelectValue placeholder={t('mail_room.priority_filter')} />
              </SelectTrigger>
              <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
                <SelectItem value="all" className="dark:text-slate-200">{t('mail_room.all_priorities')}</SelectItem>
                <SelectItem value="low" className="dark:text-slate-200">{t('mail_room.priority_low')}</SelectItem>
                <SelectItem value="medium" className="dark:text-slate-200">{t('mail_room.priority_medium')}</SelectItem>
                <SelectItem value="high" className="dark:text-slate-200">{t('mail_room.priority_high')}</SelectItem>
                <SelectItem value="critical" className="dark:text-slate-200">{t('mail_room.priority_critical')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Tasks Table */}
          <Card className="dark:bg-slate-800 dark:border-slate-700">
            <CardContent className="p-0">
              <div className="divide-y divide-slate-100 dark:divide-slate-700">
                {filteredTasks.length === 0 ? (
                  <p className="text-center text-slate-400 dark:text-slate-500 py-12">
                    {t('mail_room.no_tasks')}
                  </p>
                ) : (
                  filteredTasks.map((task) => (
                    <Link
                      key={task.id}
                      to={createPageUrl(`Workbench?taskId=${task.id}`)}
                      className="flex items-center gap-4 p-4 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <p className="font-medium text-slate-800 dark:text-slate-200">{task.title}</p>
                          <StatusBadge status={task.priority} />
                          <StatusBadge status={task.status} />
                        </div>
                        {task.description && (
                          <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-1">{task.description}</p>
                        )}
                        {task.due_date && (
                          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                            {t('mail_room.due_label')} {format(new Date(task.due_date), 'dd/MM/yyyy')}
                          </p>
                        )}
                      </div>
                      <ArrowIcon className="w-5 h-5 text-slate-400 flex-shrink-0" />
                    </Link>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="mailbox" className="space-y-4">
          {/* Search and Bulk Actions */}
          <div className="flex flex-wrap gap-4 items-center justify-between">
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className={`absolute ${isRTL ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400`} />
              <Input
                placeholder={t('mail_room.search_emails')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={`${isRTL ? 'pr-10' : 'pl-10'} bg-white dark:bg-slate-800 dark:border-slate-700`}
              />
            </div>
            {selectedMails.length > 0 && (
              <Button
                onClick={handleBulkProcess}
                disabled={bulkProcessing}
                className="bg-blue-600 hover:bg-blue-700 gap-2"
              >
                <Play className="w-4 h-4" />
                {t('mail_room.process_selected', { count: selectedMails.length })}
              </Button>
            )}
          </div>

          {/* Mails Table */}
          <Card className="dark:bg-slate-800 dark:border-slate-700">
            <CardContent className="p-0">
              {/* Select All Header */}
              {filteredMails.some(m => m.processing_status === 'pending' || !m.processing_status) && (
                <div className="flex items-center gap-3 p-3 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                  <button 
                    onClick={toggleAllMails}
                    className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded"
                  >
                    {selectedMails.length === filteredMails.filter(m => m.processing_status === 'pending' || !m.processing_status).length ? (
                      <CheckSquare className="w-5 h-5 text-blue-600" />
                    ) : (
                      <Square className="w-5 h-5 text-slate-400" />
                    )}
                  </button>
                  <span className="text-sm text-slate-500 dark:text-slate-400">
                    {t('mail_room.select_all')}
                  </span>
                </div>
              )}
              <div className="divide-y divide-slate-100 dark:divide-slate-700">
                {filteredMails.length === 0 ? (
                  <p className="text-center text-slate-400 dark:text-slate-500 py-12">
                    {t('mail_room.no_emails')}
                  </p>
                ) : (
                  filteredMails.map((mail) => (
                    <div
                      key={mail.id}
                      className="flex items-start gap-4 p-4 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                    >
                      {/* Checkbox for unprocessed mails */}
                      {(mail.processing_status === 'pending' || !mail.processing_status) && (
                        <button 
                          onClick={() => toggleMailSelection(mail.id)}
                          className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded flex-shrink-0 mt-1"
                        >
                          {selectedMails.includes(mail.id) ? (
                            <CheckSquare className="w-5 h-5 text-blue-600" />
                          ) : (
                            <Square className="w-5 h-5 text-slate-400" />
                          )}
                        </button>
                      )}
                      <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
                        <Mail className="w-5 h-5 text-slate-500 dark:text-slate-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <p className="font-medium text-slate-800 dark:text-slate-200 line-clamp-1">{mail.subject}</p>
                          {mail.priority && <StatusBadge status={mail.priority} />}
                          {mail.category && (
                            <Badge variant="outline" className="text-xs dark:border-slate-600">
                              {mail.category}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-slate-500 dark:text-slate-400">{mail.sender_name || mail.sender_email}</p>
                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                          {format(new Date(mail.received_at), 'dd MMM yyyy, HH:mm', { locale: isRTL ? he : undefined })}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={mail.processing_status} />
                        {(mail.processing_status === 'pending' || !mail.processing_status) && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleProcessMail(mail.id)}
                            disabled={processingMail === mail.id}
                            className="gap-1 dark:border-slate-600 dark:hover:bg-slate-700"
                          >
                            <Play className="w-3 h-3" />
                            {t('mail_room.process')}
                          </Button>
                        )}
                        <Link to={createPageUrl(`MailView?mailId=${mail.id}`)}>
                          <Button variant="ghost" size="icon" className="dark:hover:bg-slate-700">
                            <ArrowIcon className="w-5 h-5 text-slate-400" />
                          </Button>
                        </Link>
                      </div>
                    </div>
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