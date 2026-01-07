import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { format, startOfMonth, endOfMonth, isAfter, isBefore } from 'date-fns';
import PageHeader from '../components/ui/PageHeader';
import DataTable from '../components/ui/DataTable';
import StatusBadge from '../components/ui/StatusBadge';
import StatsCard from '../components/ui/StatsCard';
import EmptyState from '../components/ui/EmptyState';
import {
  Receipt,
  Clock,
  TrendingUp,
  CreditCard,
  Plus,
  Eye,
  Trash2,
  MoreHorizontal,
  FileText,
  DollarSign
} from 'lucide-react';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const invoiceStatuses = [
  { value: 'draft', label: 'טיוטה' },
  { value: 'sent', label: 'נשלח' },
  { value: 'viewed', label: 'נצפה' },
  { value: 'partially_paid', label: 'שולם חלקית' },
  { value: 'paid', label: 'שולם' },
  { value: 'overdue', label: 'באיחור' },
  { value: 'cancelled', label: 'בוטל' },
];

const currencies = [
  { value: 'ILS', label: '₪ שקל' },
  { value: 'USD', label: '$ דולר' },
  { value: 'EUR', label: '€ יורו' },
];

export default function Financials() {
  const queryClient = useQueryClient();
  const today = new Date();
  const monthStart = startOfMonth(today);
  const monthEnd = endOfMonth(today);

  const [isInvoiceDialogOpen, setIsInvoiceDialogOpen] = useState(false);
  const [isTimeEntryDialogOpen, setIsTimeEntryDialogOpen] = useState(false);
  const [invoiceForm, setInvoiceForm] = useState({
    invoice_number: '',
    client_id: '',
    issued_date: format(today, 'yyyy-MM-dd'),
    due_date: '',
    currency: 'ILS',
    subtotal: 0,
    tax_rate: 17,
    status: 'draft',
    notes: '',
  });
  const [timeEntryForm, setTimeEntryForm] = useState({
    case_id: '',
    description: '',
    hours: '',
    rate: 500,
    date_worked: format(today, 'yyyy-MM-dd'),
    is_billable: true,
  });

  const { data: invoices = [], isLoading: invoicesLoading } = useQuery({
    queryKey: ['invoices'],
    queryFn: () => base44.entities.Invoice.list('-created_date', 500),
  });

  const { data: timeEntries = [], isLoading: timeEntriesLoading } = useQuery({
    queryKey: ['timeEntries'],
    queryFn: () => base44.entities.TimeEntry.list('-date_worked', 500),
  });

  const { data: clients = [] } = useQuery({
    queryKey: ['clients'],
    queryFn: () => base44.entities.Client.list('-created_date', 500),
  });

  const { data: cases = [] } = useQuery({
    queryKey: ['cases'],
    queryFn: () => base44.entities.Case.list('-created_date', 500),
  });

  const createInvoiceMutation = useMutation({
    mutationFn: (data) => {
      const taxAmount = (data.subtotal * data.tax_rate) / 100;
      return base44.entities.Invoice.create({
        ...data,
        tax_amount: taxAmount,
        total: data.subtotal + taxAmount,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['invoices']);
      setIsInvoiceDialogOpen(false);
      setInvoiceForm({
        invoice_number: '',
        client_id: '',
        issued_date: format(today, 'yyyy-MM-dd'),
        due_date: '',
        currency: 'ILS',
        subtotal: 0,
        tax_rate: 17,
        status: 'draft',
        notes: '',
      });
    },
  });

  const createTimeEntryMutation = useMutation({
    mutationFn: (data) => base44.entities.TimeEntry.create({ ...data, hours: parseFloat(data.hours) }),
    onSuccess: () => {
      queryClient.invalidateQueries(['timeEntries']);
      setIsTimeEntryDialogOpen(false);
      setTimeEntryForm({
        case_id: '',
        description: '',
        hours: '',
        rate: 500,
        date_worked: format(today, 'yyyy-MM-dd'),
        is_billable: true,
      });
    },
  });

  const updateInvoiceStatusMutation = useMutation({
    mutationFn: ({ id, status }) => base44.entities.Invoice.update(id, { 
      status, 
      paid_date: status === 'paid' ? format(today, 'yyyy-MM-dd') : null 
    }),
    onSuccess: () => {
      queryClient.invalidateQueries(['invoices']);
    },
  });

  const deleteInvoiceMutation = useMutation({
    mutationFn: (id) => base44.entities.Invoice.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['invoices']);
    },
  });

  const getClientName = (clientId) => {
    const client = clients.find(c => c.id === clientId);
    return client?.name || '-';
  };

  const getCaseNumber = (caseId) => {
    const caseItem = cases.find(c => c.id === caseId);
    return caseItem?.case_number || '-';
  };

  // Stats
  const monthlyRevenue = invoices
    .filter(i => {
      if (!i.issued_date) return false;
      const date = new Date(i.issued_date);
      return isAfter(date, monthStart) && isBefore(date, monthEnd);
    })
    .reduce((sum, i) => sum + (i.total || 0), 0);

  const paidInvoices = invoices.filter(i => i.status === 'paid');
  const totalPaid = paidInvoices.reduce((sum, i) => sum + (i.total || 0), 0);

  const pendingInvoices = invoices.filter(i => ['sent', 'viewed', 'partially_paid'].includes(i.status));
  const totalPending = pendingInvoices.reduce((sum, i) => sum + ((i.total || 0) - (i.paid_amount || 0)), 0);

  const totalHours = timeEntries.reduce((sum, t) => sum + (t.hours || 0), 0);
  const unbilledAmount = timeEntries
    .filter(t => t.is_billable && !t.billed)
    .reduce((sum, t) => sum + ((t.hours || 0) * (t.rate || 0)), 0);

  const invoiceColumns = [
    {
      header: 'מספר',
      accessor: 'invoice_number',
      render: (row) => <span className="font-medium text-slate-800">{row.invoice_number}</span>,
    },
    {
      header: 'לקוח',
      accessor: 'client_id',
      render: (row) => getClientName(row.client_id),
    },
    {
      header: 'תאריך',
      accessor: 'issued_date',
      render: (row) => row.issued_date ? format(new Date(row.issued_date), 'dd/MM/yyyy') : '-',
    },
    {
      header: 'סכום',
      accessor: 'total',
      render: (row) => (
        <span className="font-semibold">
          {row.currency === 'USD' ? '$' : row.currency === 'EUR' ? '€' : '₪'}
          {(row.total || 0).toLocaleString()}
        </span>
      ),
    },
    {
      header: 'סטטוס',
      accessor: 'status',
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      header: '',
      render: (row) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreHorizontal className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {row.status !== 'paid' && row.status !== 'cancelled' && (
              <DropdownMenuItem 
                onClick={() => updateInvoiceStatusMutation.mutate({ id: row.id, status: 'paid' })}
                className="flex items-center gap-2"
              >
                <CreditCard className="w-4 h-4" />
                סמן כשולם
              </DropdownMenuItem>
            )}
            <DropdownMenuItem 
              onClick={() => deleteInvoiceMutation.mutate(row.id)}
              className="flex items-center gap-2 text-rose-600"
            >
              <Trash2 className="w-4 h-4" />
              מחיקה
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="כספים"
        subtitle="ניהול חשבוניות ורישום שעות"
      />

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatsCard
          title="הכנסות החודש"
          value={`₪${monthlyRevenue.toLocaleString()}`}
          icon={TrendingUp}
          color="green"
        />
        <StatsCard
          title="ממתין לתשלום"
          value={`₪${totalPending.toLocaleString()}`}
          icon={Clock}
          color="amber"
        />
        <StatsCard
          title="שעות שטרם חויבו"
          value={`₪${unbilledAmount.toLocaleString()}`}
          icon={Receipt}
          color="purple"
        />
        <StatsCard
          title="סה״כ שעות"
          value={totalHours.toFixed(1)}
          icon={FileText}
          color="blue"
        />
      </div>

      <Tabs defaultValue="invoices" className="space-y-6">
        <TabsList className="bg-white border">
          <TabsTrigger value="invoices">חשבוניות</TabsTrigger>
          <TabsTrigger value="time">רישום שעות</TabsTrigger>
        </TabsList>

        <TabsContent value="invoices" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setIsInvoiceDialogOpen(true)} className="bg-slate-800 gap-2">
              <Plus className="w-4 h-4" />
              חשבונית חדשה
            </Button>
          </div>

          {invoices.length === 0 && !invoicesLoading ? (
            <EmptyState
              icon={Receipt}
              title="אין חשבוניות"
              description="צור את החשבונית הראשונה"
              actionLabel="חשבונית חדשה"
              onAction={() => setIsInvoiceDialogOpen(true)}
            />
          ) : (
            <DataTable
              columns={invoiceColumns}
              data={invoices}
              isLoading={invoicesLoading}
              emptyMessage="לא נמצאו חשבוניות"
            />
          )}
        </TabsContent>

        <TabsContent value="time" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setIsTimeEntryDialogOpen(true)} className="bg-slate-800 gap-2">
              <Plus className="w-4 h-4" />
              רישום שעות
            </Button>
          </div>

          {timeEntries.length === 0 && !timeEntriesLoading ? (
            <EmptyState
              icon={Clock}
              title="אין רישומי שעות"
              description="התחל לרשום את הזמן שהשקעת"
              actionLabel="רישום שעות"
              onAction={() => setIsTimeEntryDialogOpen(true)}
            />
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="divide-y divide-slate-100">
                  {timeEntries.map(entry => (
                    <div key={entry.id} className="flex items-center gap-4 p-4">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-800">{entry.description}</p>
                        <div className="flex gap-3 text-sm text-slate-500 mt-1">
                          <span>{getCaseNumber(entry.case_id)}</span>
                          <span>•</span>
                          <span>{format(new Date(entry.date_worked), 'dd/MM/yyyy')}</span>
                        </div>
                      </div>
                      <div className="text-left">
                        <p className="font-semibold">{entry.hours} שעות</p>
                        {entry.is_billable && (
                          <p className="text-sm text-emerald-600">
                            ₪{((entry.hours || 0) * (entry.rate || 0)).toLocaleString()}
                          </p>
                        )}
                      </div>
                      {entry.billed ? (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">חויב</span>
                      ) : entry.is_billable ? (
                        <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded">לחיוב</span>
                      ) : (
                        <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded">לא לחיוב</span>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Invoice Dialog */}
      <Dialog open={isInvoiceDialogOpen} onOpenChange={setIsInvoiceDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>חשבונית חדשה</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); createInvoiceMutation.mutate(invoiceForm); }} className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>מספר חשבונית *</Label>
                <Input
                  value={invoiceForm.invoice_number}
                  onChange={(e) => setInvoiceForm({ ...invoiceForm, invoice_number: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>לקוח *</Label>
                <Select value={invoiceForm.client_id} onValueChange={(v) => setInvoiceForm({ ...invoiceForm, client_id: v })}>
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
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>תאריך הנפקה</Label>
                <Input
                  type="date"
                  value={invoiceForm.issued_date}
                  onChange={(e) => setInvoiceForm({ ...invoiceForm, issued_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>תאריך לתשלום</Label>
                <Input
                  type="date"
                  value={invoiceForm.due_date}
                  onChange={(e) => setInvoiceForm({ ...invoiceForm, due_date: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>מטבע</Label>
                <Select value={invoiceForm.currency} onValueChange={(v) => setInvoiceForm({ ...invoiceForm, currency: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {currencies.map(c => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>סכום לפני מע״מ</Label>
                <Input
                  type="number"
                  value={invoiceForm.subtotal}
                  onChange={(e) => setInvoiceForm({ ...invoiceForm, subtotal: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-2">
                <Label>מע״מ %</Label>
                <Input
                  type="number"
                  value={invoiceForm.tax_rate}
                  onChange={(e) => setInvoiceForm({ ...invoiceForm, tax_rate: parseFloat(e.target.value) || 0 })}
                />
              </div>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">סכום לפני מע״מ:</span>
                <span>₪{invoiceForm.subtotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm mt-2">
                <span className="text-slate-500">מע״מ ({invoiceForm.tax_rate}%):</span>
                <span>₪{((invoiceForm.subtotal * invoiceForm.tax_rate) / 100).toLocaleString()}</span>
              </div>
              <div className="flex justify-between font-bold mt-2 pt-2 border-t">
                <span>סה״כ:</span>
                <span>₪{(invoiceForm.subtotal + (invoiceForm.subtotal * invoiceForm.tax_rate) / 100).toLocaleString()}</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label>הערות</Label>
              <Textarea
                value={invoiceForm.notes}
                onChange={(e) => setInvoiceForm({ ...invoiceForm, notes: e.target.value })}
                rows={2}
              />
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setIsInvoiceDialogOpen(false)}>ביטול</Button>
              <Button type="submit" className="bg-slate-800">יצירה</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Time Entry Dialog */}
      <Dialog open={isTimeEntryDialogOpen} onOpenChange={setIsTimeEntryDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>רישום שעות</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); createTimeEntryMutation.mutate(timeEntryForm); }} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>תיק *</Label>
              <Select value={timeEntryForm.case_id} onValueChange={(v) => setTimeEntryForm({ ...timeEntryForm, case_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="בחר תיק" />
                </SelectTrigger>
                <SelectContent>
                  {cases.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.case_number}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>תיאור פעילות *</Label>
              <Textarea
                value={timeEntryForm.description}
                onChange={(e) => setTimeEntryForm({ ...timeEntryForm, description: e.target.value })}
                required
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>שעות *</Label>
                <Input
                  type="number"
                  step="0.25"
                  value={timeEntryForm.hours}
                  onChange={(e) => setTimeEntryForm({ ...timeEntryForm, hours: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>תעריף</Label>
                <Input
                  type="number"
                  value={timeEntryForm.rate}
                  onChange={(e) => setTimeEntryForm({ ...timeEntryForm, rate: parseFloat(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label>תאריך</Label>
                <Input
                  type="date"
                  value={timeEntryForm.date_worked}
                  onChange={(e) => setTimeEntryForm({ ...timeEntryForm, date_worked: e.target.value })}
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setIsTimeEntryDialogOpen(false)}>ביטול</Button>
              <Button type="submit" className="bg-slate-800">רישום</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}