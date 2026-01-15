import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { format } from 'date-fns';
import StatusBadge from '../components/ui/StatusBadge';
import {
  ArrowRight,
  Mail,
  Paperclip,
  FileText,
  User,
  Calendar
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export default function MailView() {
  const queryClient = useQueryClient();
  const urlParams = new URLSearchParams(window.location.search);
  const mailId = urlParams.get('id');

  const { data: mail, isLoading } = useQuery({
    queryKey: ['mail', mailId],
    queryFn: () => base44.entities.Mail.filter({ id: mailId }),
    enabled: !!mailId,
  });

  const createTaskMutation = useMutation({
    mutationFn: (mailData) => base44.entities.Task.create({
      mail_id: mailData.id,
      title: `טיפול במייל: ${mailData.subject}`,
      description: `מייל מ-${mailData.sender_name || mailData.sender_email}`,
      task_type: 'custom',
      status: 'pending',
      priority: mailData.priority || 'medium',
      case_id: mailData.related_case_id,
      client_id: mailData.related_client_id,
    }),
    onSuccess: (newTask) => {
      // Update mail status
      base44.entities.Mail.update(mailId, { processing_status: 'processed', task_id: newTask.id });
      queryClient.invalidateQueries(['mail', mailId]);
      queryClient.invalidateQueries(['tasks']);
      // Navigate to workbench
      window.location.href = createPageUrl(`Workbench?taskId=${newTask.id}`);
    },
  });

  const currentMail = mail?.[0];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!currentMail) {
    return (
      <div className="text-center py-16">
        <p className="text-slate-500">מייל לא נמצא</p>
        <Link to={createPageUrl('MailRoom')}>
          <Button variant="link" className="mt-4">חזרה לחדר דואר</Button>
        </Link>
      </div>
    );
  }

  const handleCreateTask = () => {
    createTaskMutation.mutate(currentMail);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to={createPageUrl('MailRoom')}>
          <Button variant="ghost" size="icon" className="rounded-xl">
            <ArrowRight className="w-5 h-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-800">צפייה במייל</h1>
        </div>
        {currentMail.processing_status !== 'processed' && (
          <Button 
            onClick={handleCreateTask}
            className="bg-slate-800 hover:bg-slate-700 gap-2"
            disabled={createTaskMutation.isPending}
          >
            <FileText className="w-4 h-4" />
            הפוך למשימה
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar */}
        <div className="lg:col-span-1 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <h3 className="font-semibold text-slate-800">פרטים</h3>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-xs text-slate-500 mb-1">סטטוס עיבוד</p>
                <StatusBadge status={currentMail.processing_status} />
              </div>
              {currentMail.priority && (
                <div>
                  <p className="text-xs text-slate-500 mb-1">עדיפות</p>
                  <StatusBadge status={currentMail.priority} />
                </div>
              )}
              {currentMail.category && (
                <div>
                  <p className="text-xs text-slate-500 mb-1">קטגוריה</p>
                  <Badge variant="outline">{currentMail.category}</Badge>
                </div>
              )}
              <div>
                <p className="text-xs text-slate-500 mb-1">תאריך קבלה</p>
                <div className="flex items-center gap-2 text-sm text-slate-700">
                  <Calendar className="w-3 h-3" />
                  {format(new Date(currentMail.received_at), 'dd/MM/yyyy HH:mm')}
                </div>
              </div>
            </CardContent>
          </Card>

          {currentMail.inferred_case_id && (
            <Card>
              <CardHeader className="pb-3">
                <h3 className="font-semibold text-slate-800">הצעת AI</h3>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-slate-600">
                  תיק מוצע: {currentMail.inferred_case_id}
                </p>
                {currentMail.inferred_confidence && (
                  <p className="text-xs text-slate-500 mt-1">
                    רמת ביטחון: {(currentMail.inferred_confidence * 100).toFixed(0)}%
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Main Content */}
        <div className="lg:col-span-3">
          <Card>
            <CardHeader className="border-b">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <Mail className="w-5 h-5 text-blue-600" />
                </div>
                <div className="flex-1">
                  <h2 className="text-lg font-semibold text-slate-800">{currentMail.subject}</h2>
                  <div className="flex items-center gap-2 mt-2">
                    <User className="w-4 h-4 text-slate-400" />
                    <span className="text-sm text-slate-600">
                      {currentMail.sender_name || currentMail.sender_email}
                    </span>
                  </div>
                  {currentMail.recipients?.length > 0 && (
                    <div className="flex items-start gap-2 mt-1">
                      <span className="text-xs text-slate-500">אל:</span>
                      <div className="flex flex-wrap gap-1">
                        {currentMail.recipients.map((r, idx) => (
                          <span key={idx} className="text-xs text-slate-600">
                            {r.email}{idx < currentMail.recipients.length - 1 ? ',' : ''}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </CardHeader>

            {currentMail.attachments?.length > 0 && (
              <div className="p-6 border-b bg-slate-50">
                <div className="flex items-center gap-2 mb-3">
                  <Paperclip className="w-4 h-4 text-slate-500" />
                  <span className="text-sm font-medium text-slate-700">
                    {currentMail.attachments.length} קבצים מצורפים
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {currentMail.attachments.map((att, idx) => (
                    <a
                      key={idx}
                      href={att.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 p-3 bg-white rounded-lg border border-slate-200 hover:border-blue-300 transition-colors"
                    >
                      <Paperclip className="w-4 h-4 text-slate-400" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{att.filename}</p>
                        <p className="text-xs text-slate-500">{(att.size / 1024).toFixed(1)} KB</p>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}

            <CardContent className="pt-6">
              <div 
                className="prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ 
                  __html: currentMail.body_html || `<pre style="white-space: pre-wrap; font-family: inherit;">${currentMail.body_plain}</pre>` 
                }}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}