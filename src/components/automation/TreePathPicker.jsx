import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import {
  ChevronRight,
  Lock,
  FolderTree,
  FolderOpen,
  Folder,
  List,
  Loader2,
  AlertCircle
} from 'lucide-react';

const SOURCE_LABELS = {
  client: 'לקוח',
  case: 'תיק'
};

export default function TreePathPicker({ schemaId, pathSelections, onSchemaChange, onPathSelectionsChange }) {
  const { t } = useTranslation();
  const [previewPath, setPreviewPath] = useState('/...');

  const { data: schemas = [], isLoading: schemasLoading } = useQuery({
    queryKey: ['folderTreeSchemas'],
    queryFn: () => base44.entities.FolderTreeSchema.filter({ is_active: true }),
  });

  const selectedSchema = schemas.find(s => s.id === schemaId);

  useEffect(() => {
    if (selectedSchema) {
      setPreviewPath(generatePreview(selectedSchema, pathSelections));
    } else {
      setPreviewPath('/...');
    }
  }, [selectedSchema, pathSelections]);

  // Helper to get string value from either format (string or {code, name})
  const getValue = (val) => typeof val === 'string' ? val : (val?.name || val?.code || '');

  const generatePreview = (schema, selections) => {
    if (!schema?.levels) return '/...';

    const parts = [];
    if (schema.root_path) {
      parts.push(schema.root_path.replace(/^\/+|\/+$/g, ''));
    }

    const sortedLevels = [...schema.levels].sort((a, b) => (a.order || 0) - (b.order || 0));

    for (const level of sortedLevels) {
      const separator = level.separator || ' - ';
      let folderName = '';
      let numbering = level.numbering || { type: 'none' };

      switch (level.type) {
        case 'dynamic':
          folderName = `[${level.label || level.key}]`;
          break;
        case 'static': {
          if (level.values?.length === 1) {
            folderName = getValue(level.values[0]);
          } else {
            const selected = selections?.[level.key];
            folderName = selected || `<${level.label || level.key}>`;
          }
          // Static type has no numbering
          numbering = { type: 'none' };
          break;
        }
        case 'list':
        case 'pool': {
          const selected = selections?.[level.key];
          folderName = selected || `<${level.label || level.key}>`;
          // For list type, get numbering from the selected value
          if (selected && level.values) {
            const selectedValue = level.values.find(v => getValue(v) === selected);
            if (selectedValue?.numbering) {
              numbering = selectedValue.numbering;
            }
          }
          break;
        }
      }

      // Add numbering indicator for preview
      if (numbering.type !== 'none') {
        const numIndicator = numbering.type === 'chronological' ? '###' : '#';
        if (numbering.position === 'suffix') {
          folderName = `${folderName}${separator}${numIndicator}`;
        } else {
          folderName = `${numIndicator}${separator}${folderName}`;
        }
      }

      parts.push(folderName);
    }

    return '/' + parts.join('/');
  };

  const handleSelectionChange = (levelKey, value) => {
    const newSelections = { ...pathSelections, [levelKey]: value };
    onPathSelectionsChange(newSelections);
  };

  const getAvailableValues = (level) => {
    if (!level.values) return [];

    if (level.depends_on && level.conditional_values) {
      const parentSelection = pathSelections?.[level.depends_on];
      if (parentSelection && level.conditional_values[parentSelection]) {
        return level.conditional_values[parentSelection];
      }
    }

    return level.values;
  };

  if (schemasLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
      </div>
    );
  }

  if (schemas.length === 0) {
    return (
      <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
        <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
          <AlertCircle className="w-4 h-4" />
          <span className="text-sm">אין סכמות פעילות. יש ליצור סכמה בהגדרות מבנה תיקיות.</span>
        </div>
      </div>
    );
  }

  const sortedLevels = selectedSchema
    ? [...selectedSchema.levels].sort((a, b) => (a.order || 0) - (b.order || 0))
    : [];

  return (
    <div className="space-y-3">
      {/* Schema Selection */}
      <div className="space-y-1.5">
        <Label className="text-sm">נתיב שמירה</Label>
        <Select value={schemaId || ''} onValueChange={onSchemaChange}>
          <SelectTrigger className="dark:bg-slate-800 dark:border-slate-600">
            <SelectValue placeholder="בחר מבנה תיקיות..." />
          </SelectTrigger>
          <SelectContent className="dark:bg-slate-800">
            {schemas.map(schema => (
              <SelectItem key={schema.id} value={schema.id}>
                <div className="flex items-center gap-2">
                  <FolderTree className="w-3.5 h-3.5 text-blue-500" />
                  {schema.name}
                  {schema.is_default && (
                    <Badge variant="outline" className="text-[10px] h-4 px-1.5">ברירת מחדל</Badge>
                  )}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Visual Tree */}
      {selectedSchema && (
        <div className="rounded-lg border dark:border-slate-700 overflow-hidden">
          {/* Tree Header - Root */}
          <div className="flex items-center gap-2 px-3 py-2 bg-slate-100 dark:bg-slate-800 border-b dark:border-slate-700">
            <FolderOpen className="w-4 h-4 text-amber-500" />
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200 font-mono dir-ltr">
              {selectedSchema.root_path || '/'}
            </span>
          </div>

          {/* Tree Levels */}
          <div className="bg-white dark:bg-slate-900 py-1">
            {sortedLevels.map((level, index) => {
              const isLast = index === sortedLevels.length - 1;
              const availableValues = getAvailableValues(level);
              const isSelected = level.type === 'dynamic' ||
                (level.type === 'static' && level.values?.length === 1) ||
                pathSelections?.[level.key];

              return (
                <div key={level.key || index} className="relative">
                  <div className="flex items-center min-h-[40px]">
                    {/* Tree lines */}
                    <div className="flex-shrink-0 w-8 flex justify-center relative">
                      {/* Vertical line */}
                      <div
                        className={`absolute top-0 w-px bg-slate-300 dark:bg-slate-600 ${isLast ? 'h-1/2' : 'h-full'}`}
                        style={{ right: '50%' }}
                      />
                      {/* Horizontal branch */}
                      <div
                        className="absolute top-1/2 h-px bg-slate-300 dark:bg-slate-600"
                        style={{ right: '0', width: '50%' }}
                      />
                    </div>

                    {/* Level content */}
                    <div className="flex-1 flex items-center gap-2 py-1.5 pr-1 pl-3">
                      {/* Folder icon */}
                      {level.type === 'dynamic' ? (
                        <div className="w-7 h-7 rounded flex items-center justify-center bg-slate-100 dark:bg-slate-800 flex-shrink-0">
                          <Lock className="w-3.5 h-3.5 text-slate-400" />
                        </div>
                      ) : isSelected ? (
                        <FolderOpen className="w-5 h-5 text-amber-500 flex-shrink-0" />
                      ) : (
                        <Folder className="w-5 h-5 text-slate-400 flex-shrink-0" />
                      )}

                      {/* Level label + control */}
                      <div className="flex-1 min-w-0">
                        {level.type === 'dynamic' ? (
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-slate-500 dark:text-slate-400">
                              {level.label || level.key}
                            </span>
                            <Badge variant="secondary" className="text-[10px] h-5 px-1.5 bg-slate-100 dark:bg-slate-800">
                              {SOURCE_LABELS[level.source] || level.source} - אוטומטי
                            </Badge>
                          </div>
                        ) : level.type === 'static' && level.values?.length === 1 ? (
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                              {getValue(level.values[0])}
                            </span>
                            <Badge variant="outline" className="text-[10px] h-5 px-1.5">קבוע</Badge>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-500 dark:text-slate-400 flex-shrink-0">
                              {level.label || level.key}:
                            </span>
                            <Select
                              value={pathSelections?.[level.key] || ''}
                              onValueChange={(v) => handleSelectionChange(level.key, v)}
                            >
                              <SelectTrigger className="h-7 text-sm dark:bg-slate-800 dark:border-slate-600 max-w-[220px]">
                                <SelectValue placeholder={`בחר...`} />
                              </SelectTrigger>
                              <SelectContent className="dark:bg-slate-800">
                                {availableValues.map((val, idx) => {
                                  const valueStr = getValue(val);
                                  return (
                                    <SelectItem key={valueStr || idx} value={valueStr} className="text-sm">
                                      {valueStr}
                                    </SelectItem>
                                  );
                                })}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Path Preview - Prominent */}
          <div className="px-3 py-2.5 bg-blue-50 dark:bg-blue-950/40 border-t border-blue-200 dark:border-blue-900">
            <div className="flex items-center gap-2 flex-wrap" dir="ltr">
              {previewPath.split('/').filter(Boolean).map((part, i, arr) => {
                const isDynamic = part.startsWith('[');
                const isPlaceholder = part.startsWith('<');
                return (
                  <React.Fragment key={i}>
                    <span
                      className={`text-xs font-mono px-1.5 py-0.5 rounded ${
                        isDynamic
                          ? 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                          : isPlaceholder
                            ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-dashed border-amber-300 dark:border-amber-700'
                            : 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                      }`}
                    >
                      {part}
                    </span>
                    {i < arr.length - 1 && (
                      <ChevronRight className="w-3 h-3 text-slate-400 flex-shrink-0" />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
