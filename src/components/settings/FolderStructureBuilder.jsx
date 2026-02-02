import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ChevronUp, ChevronDown, Plus, Trash2, Save,
  FolderTree, Loader2, GripVertical, ChevronRight, ChevronDown as ChevronDownIcon
} from 'lucide-react';

// === CONSTANTS ===

const BUILDING_BLOCKS = [
  { type: 'fixed', label: 'טקסט קבוע', icon: '📝', description: 'שם תיקייה קבוע' },
  { type: 'client', label: 'לקוח', icon: '👤', description: 'שם/מספר לקוח אוטומטי' },
  { type: 'case', label: 'תיק', icon: '📁', description: 'מספר/כותרת תיק אוטומטי' },
  { type: 'document_type', label: 'סוג מסמך', icon: '📄', description: 'תיקיית משנה לפי סוג מסמך' },
  { type: 'year', label: 'שנה', icon: '📅', description: 'שנה נוכחית (2025)' },
  { type: 'month_year', label: 'שנה-חודש', icon: '🗓️', description: 'שנה-חודש (2025-01)' },
  { type: 'department', label: 'מחלקה', icon: '🏢', description: 'מחלקת התיק' },
];

const CLIENT_FORMATS = [
  { value: '{number} - {name}', label: 'מספר - שם (1234 - חברה בע"מ)' },
  { value: '{name}', label: 'שם בלבד' },
  { value: '{number}', label: 'מספר בלבד' },
];

const CASE_FORMATS = [
  { value: '{case_number}', label: 'מספר תיק (PAT-2024-001)' },
  { value: '{case_number} - {title}', label: 'מספר - כותרת' },
];

const DEFAULT_MAPPING = {
  office_action: 'הודעות רשמיות',
  response: 'תגובות',
  certificate: 'תעודות',
  correspondence: 'התכתבויות',
  invoice: 'חשבוניות',
  application: 'בקשות',
  assignment: 'הקצאות',
  license: 'רישיונות',
  renewal_notice: 'הודעות חידוש',
  search_report: 'דוחות חיפוש',
  other: 'אחר',
};

const TEMPLATES = [
  {
    id: 'standard_ip',
    name: 'מבנה סטנדרטי למשרד IP',
    description: 'DWO / לקוחות / לקוח / תיק / סוג מסמך',
    structure: [
      { type: 'fixed', value: 'DWO', order: 0 },
      { type: 'fixed', value: 'לקוחות - משרד', order: 1 },
      { type: 'client', format: '{number} - {name}', order: 2 },
      { type: 'case', format: '{case_number}', order: 3 },
      { type: 'document_type', order: 4, mapping: { ...DEFAULT_MAPPING } },
    ]
  },
  {
    id: 'simple',
    name: 'מבנה פשוט',
    description: 'DWO / לקוח / תיק',
    structure: [
      { type: 'fixed', value: 'DWO', order: 0 },
      { type: 'client', format: '{number} - {name}', order: 1 },
      { type: 'case', format: '{case_number}', order: 2 },
    ]
  },
  {
    id: 'by_year',
    name: 'מבנה לפי שנה',
    description: 'DWO / שנה / לקוח / תיק / סוג מסמך',
    structure: [
      { type: 'fixed', value: 'DWO', order: 0 },
      { type: 'year', order: 1 },
      { type: 'client', format: '{number} - {name}', order: 2 },
      { type: 'case', format: '{case_number}', order: 3 },
      { type: 'document_type', order: 4, mapping: { ...DEFAULT_MAPPING } },
    ]
  }
];

// === HELPER: Build preview path ===
function buildPreviewPath(structure) {
  const parts = [];
  const sorted = [...structure].sort((a, b) => (a.order || 0) - (b.order || 0));
  
  for (const level of sorted) {
    switch (level.type) {
      case 'fixed': parts.push(level.value || '...'); break;
      case 'client': {
        const f = level.format || '{number} - {name}';
        parts.push(f.replace('{number}', '1234').replace('{name}', 'ישראלי בע"מ'));
        break;
      }
      case 'case': {
        const f = level.format || '{case_number}';
        parts.push(f.replace('{case_number}', 'PAT-2024-001').replace('{title}', 'סימן מסחר'));
        break;
      }
      case 'document_type': parts.push('הודעות רשמיות'); break;
      case 'year': parts.push(new Date().getFullYear().toString()); break;
      case 'month_year': {
        const now = new Date();
        parts.push(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
        break;
      }
      case 'department': parts.push('פטנטים'); break;
    }
  }
  return '/' + parts.join('/');
}

function getLevelLabel(level) {
  const block = BUILDING_BLOCKS.find(b => b.type === level.type);
  return block ? `${block.icon} ${block.label}` : level.type;
}

function getLevelDetail(level) {
  switch (level.type) {
    case 'fixed': return level.value || '(ריק)';
    case 'client': return CLIENT_FORMATS.find(f => f.value === level.format)?.label || level.format;
    case 'case': return CASE_FORMATS.find(f => f.value === level.format)?.label || level.format;
    case 'document_type': {
      const count = level.mapping ? Object.keys(level.mapping).length : 0;
      return `${count} סוגי מסמכים`;
    }
    default: return '';
  }
}

// === MAIN COMPONENT ===
export default function FolderStructureBuilder() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: connection, isLoading } = useQuery({
    queryKey: ['dropbox-connection-meta'],
    queryFn: async () => {
      const connections = await base44.entities.IntegrationConnection.filter({
        provider: 'dropbox', is_active: true
      });
      return connections?.[0] || null;
    }
  });

  const [structure, setStructure] = useState([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [mappingOpen, setMappingOpen] = useState(false);

  useEffect(() => {
    if (connection?.metadata?.folder_structure) {
      setStructure(connection.metadata.folder_structure);
      setShowTemplates(false);
    } else if (connection) {
      setShowTemplates(true);
    }
  }, [connection]);

  const saveMutation = useMutation({
    mutationFn: async (newStructure) => {
      const metadata = { ...(connection.metadata || {}), folder_structure: newStructure };
      await base44.entities.IntegrationConnection.update(connection.id, { metadata });
    },
    onSuccess: () => {
      setHasChanges(false);
      queryClient.invalidateQueries(['dropbox-connection-meta']);
      toast({ title: "נשמר", description: "מבנה התיקיות עודכן בהצלחה" });
    },
    onError: (err) => {
      toast({ variant: "destructive", title: "שגיאה", description: err.message });
    }
  });

  // --- Handlers ---
  const updateStructure = (newStructure) => {
    setStructure(newStructure);
    setHasChanges(true);
  };

  const applyTemplate = (template) => {
    updateStructure(template.structure);
    setShowTemplates(false);
  };

  const addLevel = (type) => {
    const newLevel = { type, order: structure.length };
    if (type === 'fixed') newLevel.value = '';
    if (type === 'client') newLevel.format = '{number} - {name}';
    if (type === 'case') newLevel.format = '{case_number}';
    if (type === 'document_type') newLevel.mapping = { ...DEFAULT_MAPPING };
    
    const updated = [...structure, newLevel].map((l, i) => ({ ...l, order: i }));
    updateStructure(updated);
    setAddMenuOpen(false);
    
    if (type === 'fixed') {
      setEditingIndex(updated.length - 1);
      setEditValue('');
    }
  };

  const removeLevel = (index) => {
    const updated = structure.filter((_, i) => i !== index).map((l, i) => ({ ...l, order: i }));
    updateStructure(updated);
    if (editingIndex === index) setEditingIndex(null);
  };

  const moveLevel = (index, direction) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= structure.length) return;
    const updated = [...structure];
    [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
    updateStructure(updated.map((l, i) => ({ ...l, order: i })));
  };

  const updateLevel = (index, field, value) => {
    const updated = [...structure];
    updated[index] = { ...updated[index], [field]: value };
    updateStructure(updated);
  };

  const updateMapping = (index, key, value) => {
    const updated = [...structure];
    const mapping = { ...(updated[index].mapping || {}) };
    mapping[key] = value;
    updated[index] = { ...updated[index], mapping };
    updateStructure(updated);
  };

  const startEdit = (index) => {
    setEditingIndex(index);
    setEditValue(structure[index].value || '');
  };

  const confirmEdit = () => {
    if (editingIndex !== null) {
      updateLevel(editingIndex, 'value', editValue);
      setEditingIndex(null);
    }
  };

  // --- RENDER ---
  if (isLoading) return <Card><CardContent className="py-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></CardContent></Card>;
  if (!connection) return null;

  return (
    <Card className="dark:bg-slate-800 dark:border-slate-700">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base dark:text-slate-200">
          <FolderTree className="w-5 h-5 text-blue-500" />
          מבנה תיקיות Dropbox
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">

        {/* Template Selection */}
        {showTemplates && structure.length === 0 && (
          <div className="space-y-3">
            <p className="text-sm text-slate-500">בחר תבנית התחלה, תוכל לערוך אותה אחר כך:</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {TEMPLATES.map(tmpl => (
                <button
                  key={tmpl.id}
                  onClick={() => applyTemplate(tmpl)}
                  className="p-4 border dark:border-slate-600 rounded-xl text-right hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all"
                >
                  <p className="font-medium text-sm dark:text-slate-200">{tmpl.name}</p>
                  <p className="text-xs text-slate-400 mt-1 dir-ltr text-left">{tmpl.description}</p>
                </button>
              ))}
            </div>
            <button
              onClick={() => { setShowTemplates(false); }}
              className="text-xs text-slate-400 hover:text-slate-600 underline"
            >
              או התחל מאפס
            </button>
          </div>
        )}

        {/* Tree View */}
        {(!showTemplates || structure.length > 0) && (
          <>
            <div className="space-y-1">
              {structure.map((level, index) => (
                <div key={index} className="group">
                  <div 
                    className="flex items-center gap-2 p-2.5 bg-slate-50 dark:bg-slate-900 rounded-lg border border-transparent hover:border-slate-200 dark:hover:border-slate-600 transition-all"
                    style={{ paddingRight: `${index * 20 + 12}px` }}
                  >
                    {/* Reorder buttons */}
                    <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => moveLevel(index, -1)} disabled={index === 0} className="p-0.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded disabled:opacity-20">
                        <ChevronUp className="w-3 h-3" />
                      </button>
                      <button onClick={() => moveLevel(index, 1)} disabled={index === structure.length - 1} className="p-0.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded disabled:opacity-20">
                        <ChevronDown className="w-3 h-3" />
                      </button>
                    </div>

                    {/* Folder icon + indentation line */}
                    <span className="text-slate-400">📁</span>

                    {/* Level content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px] h-5 px-1.5 whitespace-nowrap">
                          {getLevelLabel(level)}
                        </Badge>

                        {/* Inline editing for 'fixed' type */}
                        {level.type === 'fixed' && editingIndex === index ? (
                          <div className="flex items-center gap-1 flex-1">
                            <Input
                              value={editValue}
                              onChange={e => setEditValue(e.target.value)}
                              className="h-7 text-sm flex-1"
                              autoFocus
                              onKeyDown={e => { if (e.key === 'Enter') confirmEdit(); if (e.key === 'Escape') setEditingIndex(null); }}
                            />
                            <button onClick={confirmEdit} className="p-1 hover:bg-green-100 rounded"><span className="text-green-600 text-xs">✓</span></button>
                            <button onClick={() => setEditingIndex(null)} className="p-1 hover:bg-red-100 rounded"><span className="text-red-500 text-xs">✕</span></button>
                          </div>
                        ) : level.type === 'fixed' ? (
                          <span 
                            className="text-sm font-medium dark:text-slate-200 cursor-pointer hover:text-blue-600"
                            onClick={() => startEdit(index)}
                          >
                            {level.value || <span className="text-slate-400 italic">לחץ לעריכה</span>}
                          </span>
                        ) : level.type === 'client' ? (
                          <Select value={level.format || '{number} - {name}'} onValueChange={v => updateLevel(index, 'format', v)}>
                            <SelectTrigger className="h-7 text-xs w-auto min-w-[180px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {CLIENT_FORMATS.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        ) : level.type === 'case' ? (
                          <Select value={level.format || '{case_number}'} onValueChange={v => updateLevel(index, 'format', v)}>
                            <SelectTrigger className="h-7 text-xs w-auto min-w-[180px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {CASE_FORMATS.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        ) : level.type === 'document_type' ? (
                          <button
                            onClick={() => setMappingOpen(!mappingOpen)}
                            className="flex items-center gap-1 text-xs text-slate-500 hover:text-blue-600"
                          >
                            {mappingOpen ? <ChevronDownIcon className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                            {getLevelDetail(level)}
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400">{getLevelDetail(level)}</span>
                        )}
                      </div>
                    </div>

                    {/* Delete button */}
                    <button
                      onClick={() => removeLevel(index)}
                      className="p-1 opacity-0 group-hover:opacity-100 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-opacity"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-red-500" />
                    </button>
                  </div>

                  {/* Document Type Mapping (inline, collapsible) */}
                  {level.type === 'document_type' && mappingOpen && (
                    <div className="mr-8 mt-1 mb-2 p-3 bg-slate-100 dark:bg-slate-900/50 rounded-lg border dark:border-slate-700 space-y-2" style={{ marginRight: `${index * 20 + 48}px` }}>
                      <p className="text-xs font-medium text-slate-500 mb-2">מיפוי סוגי מסמכים → שמות תיקיות:</p>
                      {Object.entries(level.mapping || DEFAULT_MAPPING).map(([key, folderName]) => (
                        <div key={key} className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px] h-5 w-24 justify-center whitespace-nowrap">
                            {DEFAULT_MAPPING[key] ? key : key}
                          </Badge>
                          <span className="text-slate-400 text-xs">→</span>
                          <Input
                            value={folderName}
                            onChange={e => updateMapping(index, key, e.target.value)}
                            className="h-7 text-xs flex-1"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Add Level Button */}
            {addMenuOpen ? (
              <div className="p-3 border-2 border-dashed border-blue-300 dark:border-blue-700 rounded-xl space-y-2 bg-blue-50/50 dark:bg-blue-900/10">
                <p className="text-xs font-medium text-slate-500">בחר אבן בניין:</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {BUILDING_BLOCKS.map(block => (
                    <button
                      key={block.type}
                      onClick={() => addLevel(block.type)}
                      className="p-2.5 border dark:border-slate-600 rounded-lg text-right hover:border-blue-400 hover:bg-white dark:hover:bg-slate-800 transition-all"
                    >
                      <span className="text-lg">{block.icon}</span>
                      <p className="text-xs font-medium mt-1 dark:text-slate-200">{block.label}</p>
                    </button>
                  ))}
                </div>
                <button onClick={() => setAddMenuOpen(false)} className="text-xs text-slate-400 hover:text-slate-600 underline">ביטול</button>
              </div>
            ) : (
              <Button variant="outline" size="sm" className="w-full border-dashed" onClick={() => setAddMenuOpen(true)}>
                <Plus className="w-4 h-4 ml-2" /> הוסף רמה
              </Button>
            )}

            {/* Live Preview */}
            {structure.length > 0 && (
              <div className="p-3 bg-slate-100 dark:bg-slate-900 rounded-lg">
                <p className="text-xs text-slate-400 mb-1">תצוגה מקדימה:</p>
                <p className="text-sm font-mono dir-ltr text-left text-blue-700 dark:text-blue-400 break-all">
                  {buildPreviewPath(structure)}
                </p>
              </div>
            )}

            {/* Save + Reset buttons */}
            <div className="flex items-center gap-2 pt-2">
              <Button
                onClick={() => saveMutation.mutate(structure)}
                disabled={!hasChanges || saveMutation.isPending}
                className="gap-2"
              >
                {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                שמור מבנה
              </Button>
              {structure.length > 0 && (
                <Button variant="ghost" size="sm" onClick={() => setShowTemplates(true)} className="text-xs text-slate-400">
                  החלף לתבנית
                </Button>
              )}
              {hasChanges && (
                <Badge variant="outline" className="text-amber-600 border-amber-300 text-xs">שינויים לא שמורים</Badge>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
