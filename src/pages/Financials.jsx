import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useTranslation } from 'react-i18next';
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
  Trash2,
  MoreHorizontal,
  FileText
} from 'lucide-react';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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

export default function Financials() {
  const { t } = useTranslation();
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
    date_worked: format(today, "yyyy-MM-dd'T'HH:mm"),
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
        date_worked: format(today, "yyyy-MM-dd'T'HH:mm"),
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

  const pendingInvoices = invoices.filter(i => ['sent', 'viewed', 'partially_paid'].includes(i.status));
  const totalPending = pendingInvoices.reduce((sum, i) => sum + ((i.total || 0) - (i.paid_amount || 0)), 0);

  const totalHours = timeEntries.reduce((sum, t) => sum + (t.hours || 0), 0);
  const unbilledAmount = timeEntries
    .filter(t => t.is_billable && !t.billed)
    .reduce((sum, t) => sum + ((t.hours || 0) * (t.rate || 0)), 0);

  const invoiceColumns = [
    {
      id: 'invoice_number',
      header: t('financials.invoice_number'),
      accessorKey: 'invoice_number',
      cell: ({ row }) => (
        <span className="font-medium text-slate-800 dark:text-slate-200">
          {row.original.invoice_number}
        </span>
      ),
    },
    {
      id: 'client',
      header: t('financials.client'),
      accessorKey: 'client_id',
      cell: ({ row }) => (
        <span className="dark:text-slate-300">
          {getClientName(row.original.client_id)}
        </span>
      ),
    },
    {
      id: 'issued_date',
      header: t('financials.date'),
      accessorKey: 'issued_date',
      cell: ({ row }) => (
        <span className="dark:text-slate-300">
          {row.original.issued_date ? format(new Date(row.original.issued_date), 'dd/MM/yyyy') : '-'}
        </span>
      ),
    },
    {
      id: 'total',
      header: t('financials.amount'),
      accessorKey: 'total',
      cell: ({ row }) => {
        const r = row.original;
        return (
          <span className="font-semibold dark:text-slate-200">
            {r.currency === 'USD' ? '$' : r.currency === 'EUR' ? '€' : '₪'}
            {(r.total || 0).toLocaleString()}
          </span>
        );
      },
    },
    {
      id: 'status',
      header: t('financials.status'),
      accessorKey: 'status',
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        const r = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 dark:hover:bg-slate-700">
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="dark:bg-slate-800 dark:border-slate-700">
              {r.status !== 'paid' && r.status !== 'cancelled' && (
                <DropdownMenuItem 
                  onClick={() => updateInvoiceStatusMutation.mutate({ id: r.id, status: 'paid' })}
                  className="flex items-center gap-2 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  <CreditCard className="w-4 h-4" />
                  {t('financials.mark_as_paid')}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem 
                onClick={() => deleteInvoiceMutation.mutate(r.id)}
                className="flex items-center gap-2 text-rose-600 dark:text-rose-400 dark:hover:bg-slate-700"
              >
                <Trash2 className="w-4 h-4" />
                {t('financials.delete')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('financials.title')}
        subtitle={t('financials.subtitle')}
      />

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatsCard
          title={t('financials.monthly_revenue')}
          value={`₪${monthlyRevenue.toLocaleString()}`}
          icon={TrendingUp}
          color="green"
        />
        <StatsCard
          title={t('financials.pending_payment')}
          value={`₪${totalPending.toLocaleString()}`}
          icon={Clock}
          color="amber"
        />
        <StatsCard
          title={t('financials.unbilled_hours')}
          value={`₪${unbilledAmount.toLocaleString()}`}
          icon={Receipt}
          color="purple"
        />
        <StatsCard
          title={t('financials.total_hours')}
          value={totalHours.toFixed(1)}
          icon={FileText}
          color="blue"
        />
      </div>

      <Tabs defaultValue="invoices" className="space-y-6">
        <TabsList className="bg-white dark:bg-slate-800 border dark:border-slate-700">
          <TabsTrigger value="invoices" className="dark:text-slate-300 dark:data-[state=active]:bg-slate-700">{t('financials.invoices_tab')}</TabsTrigger>
          <TabsTrigger value="time" className="dark:text-slate-300 dark:data-[state=active]:bg-slate-700">{t('financials.time_entries_tab')}</TabsTrigger>
        </TabsList>

        <TabsContent value="invoices" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setIsInvoiceDialogOpen(true)} className="bg-slate-800 gap-2 dark:bg-slate-700">
              <Plus className="w-4 h-4" />
              {t('financials.new_invoice')}
            </Button>
          </div>

          {invoices.length === 0 && !invoicesLoading ? (
            <EmptyState
              icon={Receipt}
              title={t('financials.no_invoices')}
              description={t('financials.create_first_invoice')}
              actionLabel={t('financials.new_invoice')}
              onAction={() => setIsInvoiceDialogOpen(true)}
            />
          ) : (
            <DataTable
              columns={invoiceColumns}
              data={invoices}
              isLoading={invoicesLoading}
              emptyMessage={t('financials.no_invoice_results')}
            />
          )}
        </TabsContent>

        <TabsContent value="time" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setIsTimeEntryDialogOpen(true)} className="bg-slate-800 gap-2 dark:bg-slate-700">
              <Plus className="w-4 h-4" />
              {t('financials.new_time_entry')}
            </Button>
          </div>

          {timeEntries.length === 0 && !timeEntriesLoading ? (
            <EmptyState
              icon={Clock}
              title={t('financials.no_time_entries')}
              description={t('financials.start_logging_time')}
              actionLabel={t('financials.new_time_entry')}
              onAction={() => setIsTimeEntryDialogOpen(true)}
            />
          ) : (
            <Card className="dark:bg-slate-800 dark:border-slate-700">
              <CardContent className="p-0">
                <div className="divide-y divide-slate-100 dark:divide-slate-700">
                  {timeEntries.map(entry => {
                    // ⭐ שלוף את המידע על Case ו-Client
                    const caseItem = cases.find(c => c.id === entry.case_id);
                    const client = clients.find(c => c.id === (entry.client_id || caseItem?.client_id));
                    
                    return (
                      <div key={entry.id} className="flex items-center gap-4 p-4">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-slate-800 dark:text-slate-200">
                            {entry.description || 'ללא תיאור'}
                          </p>
                          <div className="flex gap-3 text-sm text-slate-500 dark:text-slate-400 mt-1">
                            {/* ⭐ הצג שם לקוח */}
                            {client && (
                              <>
                                <span className="font-medium text-slate-700 dark:text-slate-300">
                                  {client.name}
                                </span>
                                <span>•</span>
                              </>
                            )}
                            <span>{getCaseNumber(entry.case_id)}</span>
                            <span>•</span>
                            <span>
                              {entry.date_worked
                                ? format(new Date(entry.date_worked), 'dd/MM/yyyy HH:mm')
                                : '-'}
                            </span>
                          </div>
                        </div>
                        <div className="text-left">
                          <p className="font-semibold dark:text-slate-200">
                            {entry.hours} {t('financials.hours_label')}
                          </p>
                          {entry.is_billable && (
                            <p className="text-sm text-emerald-600 dark:text-emerald-400">
                              ₪{((entry.hours || 0) * (entry.rate || 0)).toLocaleString()}
                            </p>
                          )}
                        </div>
                        {entry.billed ? (
                          <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-1 rounded">
                            {t('financials.billed')}
                          </span>
                        ) : entry.is_billable ? (
                          <span className="text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2 py-1 rounded">
                            {t('financials.to_be_billed')}
                          </span>
                        ) : (
                          <span className="text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 px-2 py-1 rounded">
                            {t('financials.not_billable')}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Invoice Dialog */}
      <Dialog open={isInvoiceDialogOpen} onOpenChange={setIsInvoiceDialogOpen}>
        <DialogContent className="max-w-lg dark:bg-slate-800 dark:border-slate-700">
          <DialogHeader>
            <DialogTitle className="dark:text-slate-200">{t('financials.invoice_dialog_title')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); createInvoiceMutation.mutate(invoiceForm); }} className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="dark:text-slate-300">{t('financials.invoice_number_field')}</Label>
                <Input
                  value={invoiceForm.invoice_number}
                  onChange={(e) => setInvoiceForm({ ...invoiceForm, invoice_number: e.target.value })}
                  required
                  className="dark:bg-slate-900 dark:border-slate-600"
                />
              </div>
              <div className="space-y-2">
                <Label className="dark:text-slate-300">{t('financials.client_field')}</Label>
                <Select value={invoiceForm.client_id} onValueChange={(v) => setInvoiceForm({ ...invoiceForm, client_id: v })}>
                  <SelectTrigger className="dark:bg-slate-900 dark:border-slate-600">
                    <SelectValue placeholder={t('financials.select_client')} />
                  </SelectTrigger>
                  <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
                    {clients.map(c => (
                      <SelectItem key={c.id} value={c.id} className="dark:text-slate-200">{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="dark:text-slate-300">{t('financials.issued_date')}</Label>
                <Input
                  type="date"
                  value={invoiceForm.issued_date}
                  onChange={(e) => setInvoiceForm({ ...invoiceForm, issued_date: e.target.value })}
                  className="dark:bg-slate-900 dark:border-slate-600"
                />
              </div>
              <div className="space-y-2">
                <Label className="dark:text-slate-300">{t('financials.due_date')}</Label>
                <Input
                  type="date"
                  value={invoiceForm.due_date}
                  onChange={(e) => setInvoiceForm({ ...invoiceForm, due_date: e.target.value })}
                  className="dark:bg-slate-900 dark:border-slate-600"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="dark:text-slate-300">{t('financials.currency')}</Label>
                <Select value={invoiceForm.currency} onValueChange={(v) => setInvoiceForm({ ...invoiceForm, currency: v })}>
                  <SelectTrigger className="dark:bg-slate-900 dark:border-slate-600">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
                    <SelectItem value="ILS" className="dark:text-slate-200">{t('financials.currency_ils')}</SelectItem>
                    <SelectItem value="USD" className="dark:text-slate-200">{t('financials.currency_usd')}</SelectItem>
                    <SelectItem value="EUR" className="dark:text-slate-200">{t('financials.currency_eur')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="dark:text-slate-300">{t('financials.subtotal')}</Label>
                <Input
                  type="number"
                  value={invoiceForm.subtotal}
                  onChange={(e) => setInvoiceForm({ ...invoiceForm, subtotal: parseFloat(e.target.value) || 0 })}
                  className="dark:bg-slate-900 dark:border-slate-600"
                />
              </div>
              <div className="space-y-2">
                <Label className="dark:text-slate-300">{t('financials.tax_rate')}</Label>
                <Input
                  type="number"
                  value={invoiceForm.tax_rate}
                  onChange={(e) => setInvoiceForm({ ...invoiceForm, tax_rate: parseFloat(e.target.value) || 0 })}
                  className="dark:bg-slate-900 dark:border-slate-600"
                />
              </div>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-xl">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500 dark:text-slate-400">{t('financials.subtotal_label')}</span>
                <span className="dark:text-slate-200">₪{invoiceForm.subtotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm mt-2">
                <span className="text-slate-500 dark:text-slate-400">{t('financials.tax_label', { rate: invoiceForm.tax_rate })}</span>
                <span className="dark:text-slate-200">₪{((invoiceForm.subtotal * invoiceForm.tax_rate) / 100).toLocaleString()}</span>
              </div>
              <div className="flex justify-between font-bold mt-2 pt-2 border-t dark:border-slate-700">
                <span className="dark:text-slate-200">{t('financials.total_label')}</span>
                <span className="dark:text-slate-200">₪{(invoiceForm.subtotal + (invoiceForm.subtotal * invoiceForm.tax_rate) / 100).toLocaleString()}</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="dark:text-slate-300">{t('financials.notes')}</Label>
              <Textarea
                value={invoiceForm.notes}
                onChange={(e) => setInvoiceForm({ ...invoiceForm, notes: e.target.value })}
                rows={2}
                className="dark:bg-slate-900 dark:border-slate-600"
              />
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setIsInvoiceDialogOpen(false)} className="dark:border-slate-600">{t('financials.cancel')}</Button>
              <Button type="submit" className="bg-slate-800 dark:bg-slate-700">{t('financials.create')}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Time Entry Dialog */}
      <Dialog open={isTimeEntryDialogOpen} onOpenChange={setIsTimeEntryDialogOpen}>
        <DialogContent className="max-w-lg dark:bg-slate-800 dark:border-slate-700">
          <DialogHeader>
            <DialogTitle className="dark:text-slate-200">{t('financials.time_entry_dialog_title')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); createTimeEntryMutation.mutate(timeEntryForm); }} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label className="dark:text-slate-300">{t('financials.case_field')}</Label>
              <Select value={timeEntryForm.case_id} onValueChange={(v) => setTimeEntryForm({ ...timeEntryForm, case_id: v })}>
                <SelectTrigger className="dark:bg-slate-900 dark:border-slate-600">
                  <SelectValue placeholder={t('financials.select_case')} />
                </SelectTrigger>
                <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
                  {cases.map(c => (
                    <SelectItem key={c.id} value={c.id} className="dark:text-slate-200">{c.case_number}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="dark:text-slate-300">{t('financials.activity_description')}</Label>
              <Textarea
                value={timeEntryForm.description}
                onChange={(e) => setTimeEntryForm({ ...timeEntryForm, description: e.target.value })}
                required
                className="dark:bg-slate-900 dark:border-slate-600"
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="dark:text-slate-300">{t('financials.hours_field')}</Label>
                <Input
                  type="number"
                  step="0.25"
                  value={timeEntryForm.hours}
                  onChange={(e) => setTimeEntryForm({ ...timeEntryForm, hours: e.target.value })}
                  required
                  className="dark:bg-slate-900 dark:border-slate-600"
                />
              </div>
              <div className="space-y-2">
                <Label className="dark:text-slate-300">{t('financials.rate_field')}</Label>
                <Input
                  type="number"
                  value={timeEntryForm.rate}
                  onChange={(e) => setTimeEntryForm({ ...timeEntryForm, rate: parseFloat(e.target.value) })}
                  className="dark:bg-slate-900 dark:border-slate-600"
                />
              </div>
              <div className="space-y-2">
                <Label className="dark:text-slate-300">{t('financials.date_field')}</Label>
                <Input
                  type="datetime-local"
                  value={timeEntryForm.date_worked}
                  onChange={(e) => setTimeEntryForm({ ...timeEntryForm, date_worked: e.target.value })}
                  className="dark:bg-slate-900 dark:border-slate-600"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setIsTimeEntryDialogOpen(false)} className="dark:border-slate-600">{t('financials.cancel')}</Button>
              <Button type="submit" className="bg-slate-800 dark:bg-slate-700">{t('financials.log')}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
