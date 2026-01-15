import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import StatusBadge from '../components/ui/StatusBadge';
import {
  ArrowRight,
  Mail,
  Paperclip,
  FileText,
  User,
  Calendar,
  Download,
  Loader2
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/components/ui/use-toast";

export default function MailView() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const urlParams = new URLSearchParams(window.location.search);
  const mailId = urlParams.get('id');

  const { data: mail, isLoading } = useQuery({
    queryKey: ['mail', mailId],
    queryFn: async () => {
      const result = await base44.entities.Mail.filter({ id: mailId });
      return Array.isArray(result) ? result : [result];
    },
    enabled: !!mailId,
  });

  const createTaskMutation = useMutation({
    mutationFn: (mailData) => base44.entities.Task.create({
      mail_id: mailData.id,
      title: `טיפול במייל: ${mailData.subject}`,
      description: `מייל מ-${mailData.sender_name || mailData.sender_email}`,
      task_type: 'mail_processing',
      status: 'pending',
      priority: mailData.priority || 'medium',
      case_id: mailData.related_case_id,
      client_id: mailData.related_client_id,
    }),
    onSuccess: async (newTask) => {
      await base44.entities.Mail.update(mailId, { 
        processing_status: 'processed', 
        task_id: newTask.id 
      });
      
      queryClient.invalidateQueries(['mail', mailId]);
      queryClient.invalidateQueries(['tasks']);
      
      window.location.href = createPageUrl(`Workbench?taskId=${newTask.id}`);
    },
  });

  const currentMail = mail?.[0];

  // ✅ פונקציה להורדת קובץ מצורף
  const handleDownloadAttachment = async (attachment) => {
    try {
      toast({ description: "מוריד קובץ..." });

      const response = await base44.functions.invoke('downloadGmailAttachment', {
        messageId: attachment.messageId,
        attachmentId: attachment.attachmentId,
        filename: attachment.filename
      });

      if (response.error) {
        throw new Error(response.error.message || 'Download failed');
      }

      if (!response.data || !response.data.data) {
        throw new Error('No data received from server');
      }

      // המרת Base64 ל-Blob
      const base64Data = response.data.data.replace(/-/g, '+').replace(/_/g, '/');
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const blob = new Blob([bytes], { type: attachment.mimeType });
      const url = window.URL.createObjectURL(blob);
      
      // יצירת קישור להורדה
      const a = document.createElement('a');
      a.href = url;
      a.download = attachment.filename;
      document.body.appendChild(a);
      a.click();
      
      // ניקוי
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast({ description: "הקובץ הורד בהצלחה!" });

    } catch (error) {
      console.error('[MailView] Download failed:', error);
      toast({
        variant: "destructive",
        title: "שגיאה בהורדה",
        description: error.message || "לא ניתן להוריד את הקובץ"
      });
    }
  };

  // פורמט גודל קובץ
  const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  // מצב טעינה
  if (isLoading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  // מייל לא נמצא
  if (!currentMail) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Mail className="w-16 h-16 text-slate-300 mb-4" />
        <p className="text-lg text-slate-500 mb-2">מייל לא נמצא</p>
        <Link to={createPageUrl('MailRoom')}>
          <Button variant="link">חזרה לחדר דואר</Button>
        </Link>
      </div>
    );
  }

  const handleCreateTask = () => {
    createTaskMutation.mutate(currentMail);
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to={createPageUrl('MailRoom')}>
          <Button variant="ghost" size="icon" className="rounded-xl">
            <ArrowRight className="w-5 h-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
            צפייה במייל
          </h1>
        </div>
        {currentMail.processing_status !== 'processed' && (
          <Button 
            onClick={handleCreateTask}
            className="bg-blue-600 hover:bg-blue-700 gap-2"
            disabled={createTaskMutation.isPending}
          >
            {createTaskMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <FileText className="w-4 h-4" />
            )}
            הפוך למשימה
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar - פרטים */}
        <div className="lg:col-span-1 space-y-4">
          <Card className="dark:bg-slate-800">
            <CardHeader className="pb-3">
              <h3 className="font-semibold text-slate-800 dark:text-slate-100">
                פרטים
              </h3>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                  סטטוס עיבוד
                </p>
                <StatusBadge status={currentMail.processing_status} />
              </div>
              
              {currentMail.priority && (
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                    עדיפות
                  </p>
                  <StatusBadge status={currentMail.priority} />
                </div>
              )}
              
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                  תאריך קבלה
                </p>
                <div className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                  <Calendar className="w-3 h-3" />
                  {format(new Date(currentMail.received_at), 'dd/MM/yyyy HH:mm', { locale: he })}
                </div>
              </div>

              {currentMail.source && (
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                    מקור
                  </p>
                  <Badge variant="outline" className="capitalize">
                    {currentMail.source}
                  </Badge>
                </div>
              )}
            </CardContent>
          </Card>

          {/* AI Suggestions */}
          {currentMail.inferred_case_id && (
            <Card className="dark:bg-slate-800">
              <CardHeader className="pb-3">
                <h3 className="font-semibold text-slate-800 dark:text-slate-100">
                  הצעת AI
                </h3>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-slate-600 dark:text-slate-400">
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

        {/* Main Content - תוכן המייל */}
        <div className="lg:col-span-3">
          <Card className="dark:bg-slate-800">
            {/* Mail Header */}
            <CardHeader className="border-b dark:border-slate-700">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900 flex items-center justify-center flex-shrink-0">
                  <Mail className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 break-words">
                    {currentMail.subject}
                  </h2>
                  <div className="flex items-center gap-2 mt-2">
                    <User className="w-4 h-4 text-slate-400" />
                    <span className="text-sm text-slate-600 dark:text-slate-400">
                      {currentMail.sender_name || currentMail.sender_email}
                    </span>
                    {currentMail.sender_name && (
                      <span className="text-xs text-slate-400">
                        {'<'}{currentMail.sender_email}{'>'}
                      </span>
                    )}
                  </div>
                  {currentMail.recipients?.length > 0 && (
                    <div className="flex items-start gap-2 mt-1">
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        אל:
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {currentMail.recipients.map((r, idx) => (
                          <span key={idx} className="text-xs text-slate-600 dark:text-slate-400">
                            {r.email}{idx < currentMail.recipients.length - 1 ? ',' : ''}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </CardHeader>

            {/* ✅ Attachments Section - מתוקן */}
            {currentMail.attachments && currentMail.attachments.length > 0 && (
              <div className="p-6 border-b dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
                <div className="flex items-center gap-2 mb-3">
                  <Paperclip className="w-4 h-4 text-slate-500" />
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    {currentMail.attachments.length} קבצים מצורפים
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {currentMail.attachments.map((att, idx) => {
                    const canDownload = att.messageId && att.attachmentId;

                    return (
                      <div
                        key={idx}
                        className="flex items-center gap-3 p-3 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-700 transition-colors"
                      >
                        <Paperclip className="w-4 h-4 text-slate-400 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                            {att.filename}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {formatBytes(att.size)}
                          </p>
                        </div>
                        {canDownload ? (
                          <Button 
                            variant="ghost" 
                            size="icon"
                            className="flex-shrink-0"
                            title="הורדת קובץ"
                            onClick={() => handleDownloadAttachment(att)}
                          >
                            <Download className="w-4 h-4" />
                          </Button>
                        ) : (
                          <span className="text-xs text-slate-400 px-2">לא זמין</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Mail Body */}
            <CardContent className="pt-6">
              <ScrollArea className="h-[600px]">
                {currentMail.body_html ? (
                  <div 
                    className="prose prose-sm max-w-none dark:prose-invert prose-headings:font-semibold prose-a:text-blue-600 dark:prose-a:text-blue-400"
                    dangerouslySetInnerHTML={{ __html: currentMail.body_html }}
                  />
                ) : (
                  <pre className="whitespace-pre-wrap font-sans text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                    {currentMail.body_plain || currentMail.content_snippet || 'אין תוכן'}
                  </pre>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
