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
  Loader2,
  AlertCircle
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

  const { data: mail, isLoading, error } = useQuery({
    queryKey: ['mail', mailId],
    queryFn: async () => {
      console.log('[MailView] 🔍 Fetching mail with ID:', mailId);
      
      try {
        // נסיון 1: filter
        const result = await base44.entities.Mail.filter({ id: mailId });
        console.log('[MailView] Filter result:', result);
        
        if (result && result.length > 0) {
          console.log('[MailView] ✅ Found mail via filter');
          return result;
        }
        
        // נסיון 2: list עם סינון ידני
        console.log('[MailView] ⚠️ Filter returned empty, trying list...');
        const allMails = await base44.entities.Mail.list('-received_at', 100);
        const mailsArray = Array.isArray(allMails) ? allMails : (allMails.data || []);
        const foundMail = mailsArray.find(m => m.id === mailId);
        
        if (foundMail) {
          console.log('[MailView] ✅ Found mail via list');
          return [foundMail];
        }
        
        console.error('[MailView] ❌ Mail not found in database');
        return [];
      } catch (error) {
        console.error('[MailView] ❌ Error fetching mail:', error);
        throw error;
      }
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

  React.useEffect(() => {
    console.log('[MailView] === Debug Info ===');
    console.log('mailId from URL:', mailId);
    console.log('mail data:', mail);
    console.log('currentMail:', currentMail);
    console.log('isLoading:', isLoading);
    console.log('error:', error);
  }, [mailId, mail, currentMail, isLoading, error]);

  const handleDownloadAttachment = async (attachment) => {
    try {
      toast({ description: "מוריד קובץ..." });

      console.log('[MailView] Calling downloadGmailAttachment with:', {
        messageId: attachment.messageId,
        attachmentId: attachment.attachmentId,
        filename: attachment.filename
      });

      const response = await base44.functions.invoke('downloadGmailAttachment', {
        messageId: attachment.messageId,
        attachmentId: attachment.attachmentId,
      });

      if (response.error) {
        throw new Error(response.error.message || 'Failed to download attachment');
      }

      if (!response.data?.fileContent) {
        throw new Error('No file content in response');
      }

      const base64Data = response.data.fileContent;
      const byteCharacters = atob(base64Data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: attachment.mimeType });

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = attachment.filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({ description: "הקובץ הורד בהצלחה" });
    } catch (error) {
      console.error('[MailView] Download failed:', error);
      toast({ 
        variant: "destructive", 
        title: "שגיאה בהורדת קובץ", 
        description: error.message 
      });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!mailId) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <AlertCircle className="w-16 h-16 text-red-300 mb-4" />
        <p className="text-lg text-slate-500 mb-2">חסר מזהה מייל ב-URL</p>
        <Link to={createPageUrl('MailRoom')}>
          <Button variant="link">חזרה לחדר דואר</Button>
        </Link>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <AlertCircle className="w-16 h-16 text-red-300 mb-4" />
        <p className="text-lg text-slate-500 mb-2">שגיאה בטעינת המייל</p>
        <p className="text-sm text-slate-400 mb-4">{error.message}</p>
        <div className="flex gap-2">
          <Button onClick={() => window.location.reload()} variant="outline">
            נסה שוב
          </Button>
          <Link to={createPageUrl('MailRoom')}>
            <Button variant="link">חזרה לחדר דואר</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (!currentMail) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Mail className="w-16 h-16 text-slate-300 mb-4" />
        <p className="text-lg text-slate-500 mb-2">מייל לא נמצא</p>
        <p className="text-sm text-slate-400 mb-4">Mail ID: {mailId}</p>
        <div className="flex gap-2">
          <Button onClick={() => {
            console.log('[MailView] Manual debug:');
            console.log('mailId:', mailId);
            console.log('mail:', mail);
            console.log('currentMail:', currentMail);
            toast({ description: "בדוק את הקונסול (F12) לפרטים" });
          }} variant="outline">
            🔍 Debug Info
          </Button>
          <Link to={createPageUrl('MailRoom')}>
            <Button variant="link">חזרה לחדר דואר</Button>
          </Link>
        </div>
      </div>
    );
  }

  const handleCreateTask = () => {
    createTaskMutation.mutate(currentMail);
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <Link to={createPageUrl('MailRoom')}>
          <Button variant="ghost" size="sm">
            <ArrowRight className="w-4 h-4 ml-2" />
            חזרה לחדר דואר
          </Button>
        </Link>
        
        <div className="flex items-center gap-2">
          <Badge className="bg-blue-100 text-blue-800">
            {currentMail.processing_status === 'pending' ? 'ממתין' : 
             currentMail.processing_status === 'processed' ? 'מעובד' : 
             'בארכיון'}
          </Badge>
        </div>
      </div>

      <Card>
        <CardHeader className="border-b">
          <div className="space-y-4">
            <h1 className="text-2xl font-bold">{currentMail.subject || '(ללא נושא)'}</h1>
            
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-slate-400" />
                <span className="font-medium">שולח:</span>
                <span>{currentMail.sender_email}</span>
              </div>
              
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-slate-400" />
                <span className="font-medium">תאריך:</span>
                <span>
                  {format(new Date(currentMail.received_at), 'dd/MM/yyyy HH:mm', { locale: he })}
                </span>
              </div>
              
              {currentMail.recipients && currentMail.recipients.length > 0 && (
                <div className="flex items-center gap-2 col-span-2">
                  <Mail className="w-4 h-4 text-slate-400" />
                  <span className="font-medium">נמענים:</span>
                  <span>{currentMail.recipients.join(', ')}</span>
                </div>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-6">
          <ScrollArea className="h-[500px] w-full pr-4">
            {currentMail.body_html ? (
              <div 
                className="prose max-w-none"
                dangerouslySetInnerHTML={{ __html: currentMail.body_html }}
              />
            ) : (
              <pre className="whitespace-pre-wrap font-sans text-sm">
                {currentMail.body_plain || '(אין תוכן)'}
              </pre>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      {currentMail.attachments && currentMail.attachments.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Paperclip className="w-5 h-5" />
              <h2 className="text-lg font-semibold">
                קבצים מצורפים ({currentMail.attachments.length})
              </h2>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {currentMail.attachments.map((attachment, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-slate-50"
                >
                  <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-slate-400" />
                    <div>
                      <p className="font-medium">{attachment.filename}</p>
                      <p className="text-sm text-slate-500">
                        {(attachment.size / 1024).toFixed(1)} KB
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDownloadAttachment(attachment)}
                  >
                    <Download className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {currentMail.processing_status === 'pending' && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold mb-1">המייל טרם עובד</h3>
                <p className="text-sm text-slate-600">
                  ניתן ליצור משימה חדשה לטיפול במייל זה
                </p>
              </div>
              <Button
                onClick={handleCreateTask}
                disabled={createTaskMutation.isPending}
              >
                {createTaskMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                    יוצר משימה...
                  </>
                ) : (
                  'צור משימה'
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
