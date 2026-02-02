import React, { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Upload, 
  Download, 
  FileText, 
  FileJson,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  Info
} from 'lucide-react';

export default function ImportExportDialog({ 
  open, 
  onOpenChange, 
  entityType, // 'clients' | 'cases' | 'automations'
  onExport,
  onImport,
  existingData = [],
  isLoading = false
}) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('export');
  const [importFile, setImportFile] = useState(null);
  const [importData, setImportData] = useState(null);
  const [importPreview, setImportPreview] = useState(null);
  const [importError, setImportError] = useState(null);
  const [selectedItems, setSelectedItems] = useState({});
  const fileInputRef = useRef(null);

  const isJson = entityType === 'automations';
  const fileExtension = isJson ? 'json' : 'csv';
  const mimeType = isJson ? 'application/json' : 'text/csv';

  const entityLabels = {
    clients: t('import_export.clients'),
    cases: t('import_export.cases'),
    automations: t('import_export.automations')
  };

  const resetImport = () => {
    setImportFile(null);
    setImportData(null);
    setImportPreview(null);
    setImportError(null);
    setSelectedItems({});
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportFile(file);
    setImportError(null);

    try {
      const text = await file.text();
      let parsed;

      if (isJson) {
        parsed = JSON.parse(text);
        if (!Array.isArray(parsed)) {
          parsed = [parsed];
        }
      } else {
        parsed = parseCSV(text);
      }

      // Analyze for duplicates
      const preview = analyzeImport(parsed, existingData, entityType);
      setImportData(parsed);
      setImportPreview(preview);
      
      // Auto-select all new items
      const initialSelection = {};
      preview.forEach((item, idx) => {
        initialSelection[idx] = item.action !== 'skip';
      });
      setSelectedItems(initialSelection);

    } catch (err) {
      setImportError(`שגיאה בקריאת הקובץ: ${err.message}`);
    }
  };

  const parseCSV = (text) => {
    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    const data = [];

    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      if (values.length === headers.length) {
        const obj = {};
        headers.forEach((header, idx) => {
          let value = values[idx];
          // Try to parse JSON for complex fields
          if (value.startsWith('[') || value.startsWith('{')) {
            try {
              value = JSON.parse(value);
            } catch {}
          }
          obj[header] = value;
        });
        data.push(obj);
      }
    }
    return data;
  };

  const parseCSVLine = (line) => {
    const values = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    return values;
  };

  const analyzeImport = (newData, existing, type) => {
    return newData.map(item => {
      let existingMatch = null;
      let action = 'create';
      let conflicts = [];

      if (type === 'clients') {
        existingMatch = existing.find(e => 
          e.email === item.email || 
          e.client_number === item.client_number
        );
      } else if (type === 'cases') {
        existingMatch = existing.find(e => e.case_number === item.case_number);
      } else if (type === 'automations') {
        existingMatch = existing.find(e => e.name === item.name);
      }

      if (existingMatch) {
        action = 'update';
        // Find conflicts
        Object.keys(item).forEach(key => {
          if (existingMatch[key] !== undefined && 
              existingMatch[key] !== item[key] &&
              key !== 'id' && key !== 'created_date' && key !== 'updated_date' && key !== 'created_by') {
            conflicts.push({
              field: key,
              oldValue: existingMatch[key],
              newValue: item[key]
            });
          }
        });
      }

      return {
        data: item,
        existingMatch,
        action,
        conflicts,
        identifier: type === 'clients' ? (item.email || item.client_number) :
                    type === 'cases' ? item.case_number :
                    item.name
      };
    });
  };

  const handleExport = () => {
    onExport();
  };

  const handleDownloadTemplate = () => {
    let content, filename;

    if (entityType === 'clients') {
      content = 'name,type,email,phone,address,country,client_number,registration_number,tax_id,payment_terms,hourly_rate,billing_currency,is_active,notes\n';
      content += '"חברה לדוגמה בע"מ","company","example@company.com","+972-3-1234567","רחוב הדוגמה 1, תל אביב","IL","CL-001","51-1234567","123456789","net_30","800","ILS","true","הערות לדוגמה"';
      filename = 'clients_template.csv';
    } else if (entityType === 'cases') {
      content = 'case_number,title,case_type,status,client_id,application_number,filing_date,territory,priority_level,renewal_date,expiry_date,notes,inventors,external_identifiers\n';
      content += '"P-2024-001","המצאה לדוגמה","patent","draft","","IL123456","2024-01-15","IL","medium","2025-01-15","2044-01-15","הערות","[{""name"":""ישראל ישראלי"",""email"":""inventor@example.com"",""country"":""IL""}]","[{""type"":""Official_No"",""value"":""123456"",""notes"":""""}]"';
      filename = 'cases_template.csv';
    } else {
      const template = [{
        name: "חוק לדוגמה",
        is_active: false,
        require_approval: true,
        approver_email: "lawyer@example.com",
        catch_config: {
          senders: ["office@ilpto.gov.il"],
          subject_contains: "הודעה על קיבול",
          body_contains: ""
        },
        map_config: [
          { source: "subject", anchor_text: "תיק מס':", target_field: "case_no" }
        ],
        action_bundle: {
          send_email: { enabled: false, recipients: [], subject_template: "", body_template: "" },
          save_file: { enabled: false, path_template: "" },
          calendar_event: { enabled: false, title_template: "", timing_direction: "after", timing_offset: 7, timing_unit: "days", attendees: [], create_meet_link: false },
          create_alert: { enabled: false, alert_type: "reminder", message_template: "", timing_direction: "after", timing_offset: 7, timing_unit: "days", recipients: [] },
          billing: { enabled: false, hours: 0.25, hourly_rate: 0, description_template: "" }
        }
      }];
      content = JSON.stringify(template, null, 2);
      filename = 'automations_template.json';
    }

    downloadFile(content, filename, mimeType);
  };

  const downloadFile = (content, filename, type) => {
    const blob = new Blob([content], { type: `${type};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportConfirm = async () => {
    const itemsToImport = importPreview
      .filter((_, idx) => selectedItems[idx])
      .map(item => ({
        ...item,
        action: item.action // 'create' or 'update'
      }));

    if (itemsToImport.length === 0) {
      setImportError('לא נבחרו פריטים לייבוא');
      return;
    }

    await onImport(itemsToImport);
    resetImport();
    onOpenChange(false);
  };

  const toggleSelectAll = (checked) => {
    const newSelection = {};
    importPreview?.forEach((_, idx) => {
      newSelection[idx] = checked;
    });
    setSelectedItems(newSelection);
  };

  const selectedCount = Object.values(selectedItems).filter(Boolean).length;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) resetImport(); onOpenChange(o); }}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col dark:bg-slate-800 dark:border-slate-700">
        <DialogHeader>
          <DialogTitle className="dark:text-slate-200">
            {t('import_export.title')} {entityLabels[entityType]}
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid grid-cols-2">
            <TabsTrigger value="export" className="gap-2">
              <Download className="w-4 h-4" />
              {t('import_export.export_tab')}
            </TabsTrigger>
            <TabsTrigger value="import" className="gap-2">
              <Upload className="w-4 h-4" />
              {t('import_export.import_tab')}
            </TabsTrigger>
          </TabsList>

          {/* Export Tab */}
          <TabsContent value="export" className="flex-1 space-y-4 p-4">
            <Alert>
              <Info className="w-4 h-4" />
              <AlertDescription>
                {t('import_export.export_description', { entity: entityLabels[entityType], count: existingData.length })}
              </AlertDescription>
            </Alert>

            <div className="flex gap-3">
              <Button onClick={handleExport} disabled={isLoading || existingData.length === 0} className="gap-2">
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                {t('import_export.export_button', { entity: entityLabels[entityType] })}
              </Button>
              <Button variant="outline" onClick={handleDownloadTemplate} className="gap-2">
                <FileText className="w-4 h-4" />
                {t('common.download_template')}
              </Button>
            </div>
          </TabsContent>

          {/* Import Tab */}
          <TabsContent value="import" className="flex-1 flex flex-col overflow-hidden space-y-4 p-4">
            {!importPreview ? (
              <>
                <Alert>
                  <Info className="w-4 h-4" />
                  <AlertDescription>
                    העלה קובץ {fileExtension.toUpperCase()} לייבוא. המערכת תזהה כפילויות ותאפשר לך לבחור כיצד לטפל בהן.
                  </AlertDescription>
                </Alert>

                <div 
                  className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg p-8 text-center cursor-pointer hover:border-blue-500 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={`.${fileExtension}`}
                    className="hidden"
                    onChange={handleFileSelect}
                  />
                  {isJson ? <FileJson className="w-12 h-12 mx-auto mb-4 text-slate-400" /> : <FileText className="w-12 h-12 mx-auto mb-4 text-slate-400" />}
                  <p className="text-slate-600 dark:text-slate-400 mb-2">
                    {t('common.click_to_select_file')}
                  </p>
                  <p className="text-sm text-slate-500">
                    {t('common.format_json').replace('JSON', fileExtension.toUpperCase())}
                  </p>
                </div>

                {importError && (
                  <Alert variant="destructive">
                    <AlertTriangle className="w-4 h-4" />
                    <AlertDescription>{importError}</AlertDescription>
                  </Alert>
                )}

                <Button variant="outline" onClick={handleDownloadTemplate} className="gap-2">
                  <FileText className="w-4 h-4" />
                  {t('common.download_template')}
                </Button>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Checkbox 
                      checked={selectedCount === importPreview.length}
                      onCheckedChange={toggleSelectAll}
                    />
                    <Label>{t('import_export.select_all', 'Select All')} ({selectedCount}/{importPreview.length})</Label>
                  </div>
                  <Button variant="ghost" size="sm" onClick={resetImport}>
                    {t('import_export.choose_other_file', 'Choose Another File')}
                  </Button>
                </div>

                <ScrollArea className="flex-1 border rounded-lg dark:border-slate-700">
                  <div className="divide-y dark:divide-slate-700">
                    {importPreview.map((item, idx) => (
                      <ImportPreviewItem
                        key={idx}
                        item={item}
                        selected={selectedItems[idx]}
                        onSelect={(checked) => setSelectedItems(prev => ({ ...prev, [idx]: checked }))}
                        entityType={entityType}
                      />
                    ))}
                  </div>
                </ScrollArea>

                {importError && (
                  <Alert variant="destructive">
                    <AlertTriangle className="w-4 h-4" />
                    <AlertDescription>{importError}</AlertDescription>
                  </Alert>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>

        {activeTab === 'import' && importPreview && (
          <DialogFooter className="border-t dark:border-slate-700 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button 
              onClick={handleImportConfirm} 
              disabled={isLoading || selectedCount === 0}
              className="gap-2"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {t('import_export.import_button', { count: selectedCount }, `Import ${selectedCount} items`)}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ImportPreviewItem({ item, selected, onSelect, entityType }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  const getActionBadge = () => {
    if (item.action === 'create') {
      return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">{t('common.new_record')}</Badge>;
    }
    if (item.action === 'update') {
      return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">{t('common.update')}</Badge>;
    }
    return <Badge className="bg-slate-100 text-slate-600">{t('import_export.skip', 'Skip')}</Badge>;
  };

  return (
    <div className="p-3 hover:bg-slate-50 dark:hover:bg-slate-700/50">
      <div className="flex items-start gap-3">
        <Checkbox checked={selected} onCheckedChange={onSelect} className="mt-1" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium dark:text-slate-200 truncate">
              {item.identifier}
            </span>
            {getActionBadge()}
          </div>
          
          {item.action === 'update' && item.conflicts.length > 0 && (
            <div className="mt-2">
              <button 
                className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? t('import_export.hide_changes', 'Hide') : t('import_export.show_changes', 'Show')} {item.conflicts.length} {t('import_export.changes', 'changes')}
              </button>
              
              {expanded && (
                <div className="mt-2 space-y-1 text-sm">
                  {item.conflicts.map((conflict, idx) => (
                    <div key={idx} className="flex items-center gap-2 p-2 bg-amber-50 dark:bg-amber-900/20 rounded">
                      <span className="font-medium">{conflict.field}:</span>
                      <span className="text-slate-500 line-through">{String(conflict.oldValue)?.substring(0, 30)}</span>
                      <span>→</span>
                      <span className="text-green-600 dark:text-green-400">{String(conflict.newValue)?.substring(0, 30)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}