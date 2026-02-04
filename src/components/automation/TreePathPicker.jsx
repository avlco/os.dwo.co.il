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
  List,
  Loader2,
  AlertCircle
} from 'lucide-react';

const LEVEL_TYPE_ICONS = {
  dynamic: Lock,
  static: FolderTree,
  pool: List
};

export default function TreePathPicker({ schemaId, pathSelections, onSchemaChange, onPathSelectionsChange }) {
  const { t } = useTranslation();
  const [previewPath, setPreviewPath] = useState('/...');

  // Fetch all active schemas
  const { data: schemas = [], isLoading: schemasLoading } = useQuery({
    queryKey: ['folderTreeSchemas'],
    queryFn: () => base44.entities.FolderTreeSchema.filter({ is_active: true }),
  });

  // Get the selected schema
  const selectedSchema = schemas.find(s => s.id === schemaId);

  // Update preview whenever selections change
  useEffect(() => {
    if (selectedSchema) {
      setPreviewPath(generatePreview(selectedSchema, pathSelections));
    }
  }, [selectedSchema, pathSelections]);

  const generatePreview = (schema, selections) => {
    if (!schema?.levels) return '/...';
    
    const parts = [];
    if (schema.root_path) {
      parts.push(schema.root_path.replace(/^\/+|\/+$/g, ''));
    }
    
    const sortedLevels = [...schema.levels].sort((a, b) => (a.order || 0) - (b.order || 0));
    
    for (const level of sortedLevels) {
      switch (level.type) {
        case 'dynamic':
          parts.push(`[${level.label || level.key}]`);
          break;
        case 'static':
          if (level.values?.length === 1 && level.values[0].code) {
            parts.push(level.values[0].code);
          } else {
            const selected = selections?.[level.key];
            parts.push(selected || `<${level.label || level.key}>`);
          }
          break;
        case 'pool':
          const selected = selections?.[level.key];
          parts.push(selected || `<${level.label || level.key}>`);
          break;
      }
    }
    
    return '/' + parts.join('/');
  };

  const handleSelectionChange = (levelKey, value) => {
    const newSelections = { ...pathSelections, [levelKey]: value };
    onPathSelectionsChange(newSelections);
  };

  // Get available values for a pool level (considering dependencies)
  const getAvailableValues = (level) => {
    if (!level.values) return [];
    
    // If level depends on another, filter values based on parent selection
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

  return (
    <div className="space-y-4">
      {/* Schema Selection */}
      <div className="space-y-2">
        <Label className="text-sm">סכמת מבנה תיקיות</Label>
        <Select value={schemaId || ''} onValueChange={onSchemaChange}>
          <SelectTrigger className="dark:bg-slate-800 dark:border-slate-600">
            <SelectValue placeholder="בחר סכמה..." />
          </SelectTrigger>
          <SelectContent className="dark:bg-slate-800">
            {schemas.map(schema => (
              <SelectItem key={schema.id} value={schema.id}>
                <div className="flex items-center gap-2">
                  <FolderTree className="w-3 h-3" />
                  {schema.name}
                  {schema.is_default && (
                    <Badge variant="outline" className="text-[10px] h-4">ברירת מחדל</Badge>
                  )}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedSchema?.description && (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {selectedSchema.description}
          </p>
        )}
      </div>

      {/* Path Configuration */}
      {selectedSchema && (
        <div className="space-y-3 p-4 bg-slate-50 dark:bg-slate-900 rounded-lg border dark:border-slate-700">
          <Label className="text-sm font-medium">קביעת נתיב</Label>
          
          {selectedSchema.levels
            .sort((a, b) => (a.order || 0) - (b.order || 0))
            .map((level, index) => {
              const TypeIcon = LEVEL_TYPE_ICONS[level.type];
              const availableValues = getAvailableValues(level);
              
              return (
                <div key={level.key || index} className="flex items-start gap-3">
                  <div className="pt-1">
                    <Badge variant="outline" className="text-[10px] h-6">
                      <TypeIcon className="w-3 h-3 ml-1" />
                      {level.label || level.key}
                    </Badge>
                  </div>
                  
                  <div className="flex-1">
                    {level.type === 'dynamic' ? (
                      <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                        <Lock className="w-4 h-4" />
                        <span>נקבע אוטומטית מ{level.source === 'client' ? 'לקוח' : level.source === 'case' ? 'תיק' : level.source}</span>
                      </div>
                    ) : level.type === 'static' && level.values?.length === 1 ? (
                      <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                        <span className="font-medium">{level.values[0].name || level.values[0].code}</span>
                        <Badge variant="outline" className="text-[10px]">קבוע</Badge>
                      </div>
                    ) : (
                      <Select 
                        value={pathSelections?.[level.key] || ''} 
                        onValueChange={(v) => handleSelectionChange(level.key, v)}
                      >
                        <SelectTrigger className="h-8 text-sm dark:bg-slate-800 dark:border-slate-600">
                          <SelectValue placeholder={`בחר ${level.label || level.key}...`} />
                        </SelectTrigger>
                        <SelectContent className="dark:bg-slate-800">
                          {availableValues.map(val => (
                            <SelectItem key={val.code} value={val.code} className="text-sm">
                              {val.name} <code className="text-xs text-slate-400">({val.code})</code>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>
              );
            })}
        </div>
      )}

      {/* Path Preview */}
      {selectedSchema && (
        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
          <Label className="text-xs text-blue-800 dark:text-blue-200 mb-2 block">תצוגה מקדימה:</Label>
          <div className="flex items-center gap-1 flex-wrap">
            {previewPath.split('/').filter(Boolean).map((part, i, arr) => (
              <React.Fragment key={i}>
                <Badge 
                  variant={part.startsWith('[') || part.startsWith('<') ? 'secondary' : 'default'}
                  className="font-mono text-xs"
                >
                  {part}
                </Badge>
                {i < arr.length - 1 && <ChevronRight className="w-3 h-3 text-slate-400" />}
              </React.Fragment>
            ))}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 font-mono dir-ltr text-left">
            {previewPath}
          </p>
        </div>
      )}
    </div>
  );
}