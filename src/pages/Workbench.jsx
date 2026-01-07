import React, { useState } from 'react';
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
  CheckCircle2,
  Save,
  Archive
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";

export default function Workbench() {
  const queryClient = useQueryClient();
  const urlParams = new URLSearchParams(window.location.search);
  const taskId = urlParams.get('taskId');

  const [formData, setFormData] = useState({
    case_id: '',
    client_id: '',
    extracted_data: {},
    checklist: [],
    notes: '',
  });

  const { data: task, isLoading: taskLoading } = useQuery({
    queryKey: ['task', taskId],
    queryFn: () => base44.entities.Task.filter({ id: taskId }),
    enabled: !!taskId,
  });

  const { data: mail } = useQuery({
    queryKey: ['mail', task?.[0]?.mail_id],
    queryFn: () => base44.entities.Mail.filter({ id: task[0].mail_id }),
    enabled: !!task?.[0]?.mail_id,
  });

  const { data: cases = [] } = useQuery({
    queryKey: ['cases'],
    queryFn: () => base44.entities.Case.list('-created_date', 500),
  });

  const { data: clients = [] } = useQuery({
    queryKey: ['clients'],
    queryFn: () => base44.entities.Client.list('-created_date', 500),
  });

  const updateTaskMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Task.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['task', taskId]);
    },
  });

  const completeTaskMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Task.update(id, { 
      ...data, 
      status: 'completed',
      completed_at: new Date().toISOString()
    }),
    onSuccess: () => {
      queryClient.invalidateQueries(['task', taskId]);
      queryClient.invalidateQueries(['tasks']);
      // Navigate back to mail room
      window.location.href = createPageUrl('MailRoom');
    },
  });

  React.useEffect(() => {
    if (task?.[0]) {
      const t = task[0];
      setFormData({
        case_id: t.case_id || '',
        client_id: t.client_id || '',
        extracted_data: t.extracted_data || {},
        checklist: t.checklist || [],
        notes: t.notes || '',
      });
    }
  }, [task]);

  const currentTask = task?.[0];
  const currentMail = mail?.[0];

  if (taskLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!currentTask) {
    return (
      <div className="text-center py-16">
        <p className="text-slate-500">משימה לא נמצאה</p>
        <Link to={createPageUrl('MailRoom')}>
          <Button variant="link" className="mt-4">חזרה לחדר דואר</Button>
        </Link>
      </div>
    );
  }

  const toggleChecklistItem = (itemId) => {
    const newChecklist = formData.checklist.map(item =>
      item.id === itemId ? { ...item, completed: !item.completed } : item
    );
    setFormData({ ...formData, checklist: newChecklist });
  };

  const handleSave = () => {
    updateTaskMutation.mutate({ id: taskId, data: formData });
  };

  const handleApproveAndExecute = () => {
    completeTaskMutation.mutate({ id: taskId, data: formData });
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
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-800">שולחן עבודה</h1>
            <StatusBadge status={currentTask.status} />
            <StatusBadge status={currentTask.priority} />
          </div>
          <p className="text-slate-500 mt-1">{currentTask.title}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left - Action Card */}
        <div className="lg:col-span-1 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">פרטי המשימה</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>תיק מקושר</Label>
                <Select 
                  value={formData.case_id} 
                  onValueChange={(v) => setFormData({ ...formData, case_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="בחר תיק" />
                  </SelectTrigger>
                  <SelectContent>
                    {cases.map(c => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.case_number} - {c.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>לקוח מקושר</Label>
                <Select 
                  value={formData.client_id} 
                  onValueChange={(v) => setFormData({ ...formData, client_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="בחר לקוח" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {formData.extracted_data?.deadline && (
                <div className="space-y-2">
                  <Label>מועד שחולץ</Label>
                  <Input
                    type="date"
                    value={formData.extracted_data.deadline}
                    onChange={(e) => setFormData({
                      ...formData,
                      extracted_data: { ...formData.extracted_data, deadline: e.target.value }
                    })}
                  />
                </div>
              )}

              {formData.extracted_data?.amount && (
                <div className="space-y-2">
                  <Label>סכום</Label>
                  <Input
                    type="number"
                    value={formData.extracted_data.amount}
                    onChange={(e) => setFormData({
                      ...formData,
                      extracted_data: { ...formData.extracted_data, amount: parseFloat(e.target.value) }
                    })}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Checklist */}
          {formData.checklist.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">פעולות נדרשות</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {formData.checklist.map((item) => (
                    <div key={item.id} className="flex items-center gap-3">
                      <Checkbox
                        checked={item.completed}
                        onCheckedChange={() => toggleChecklistItem(item.id)}
                      />
                      <span className={`text-sm ${item.completed ? 'line-through text-slate-500' : 'text-slate-800'}`}>
                        {item.title}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Notes */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">הערות</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={4}
                placeholder="הוסף הערות..."
              />
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex flex-col gap-3">
            <Button onClick={handleSave} variant="outline" className="w-full gap-2">
              <Save className="w-4 h-4" />
              שמור
            </Button>
            <Button 
              onClick={handleApproveAndExecute} 
              className="w-full bg-green-600 hover:bg-green-700 gap-2"
              disabled={completeTaskMutation.isPending}
            >
              <CheckCircle2 className="w-4 h-4" />
              אשר ובצע
            </Button>
            <Button 
              variant="ghost" 
              className="w-full gap-2"
              onClick={() => window.location.href = createPageUrl('MailRoom')}
            >
              <Archive className="w-4 h-4" />
              דלג
            </Button>
          </div>
        </div>

        {/* Right - Mail Content */}
        <div className="lg:col-span-2">
          {currentMail ? (
            <Card>
              <CardHeader className="border-b">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
                    <Mail className="w-5 h-5 text-blue-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-slate-800">{currentMail.subject}</h3>
                    <p className="text-sm text-slate-500 mt-1">
                      מאת: {currentMail.sender_name || currentMail.sender_email}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      {format(new Date(currentMail.received_at), 'dd/MM/yyyy HH:mm')}
                    </p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-6">
                {currentMail.attachments?.length > 0 && (
                  <div className="mb-6 p-4 bg-slate-50 rounded-xl">
                    <div className="flex items-center gap-2 mb-3">
                      <Paperclip className="w-4 h-4 text-slate-500" />
                      <span className="text-sm font-medium text-slate-700">
                        {currentMail.attachments.length} קבצים מצורפים
                      </span>
                    </div>
                    <div className="space-y-2">
                      {currentMail.attachments.map((att, idx) => (
                        <a
                          key={idx}
                          href={att.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800"
                        >
                          {att.filename} ({(att.size / 1024).toFixed(1)} KB)
                        </a>
                      ))}
                    </div>
                  </div>
                )}
                <div 
                  className="prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: currentMail.body_html || currentMail.body_plain }}
                />
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-slate-400">אין מייל מקושר למשימה זו</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}