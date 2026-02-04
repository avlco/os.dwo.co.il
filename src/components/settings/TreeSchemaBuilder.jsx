import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Plus, 
  Trash2, 
  ChevronUp, 
  ChevronDown,
  FolderTree,
  User,
  Briefcase,
  Calendar,
  List,
  Lock,
  Loader2,
  GripVertical,
  ChevronRight
} from 'lucide-react';

// Level type configurations
const LEVEL_TYPES = {
  dynamic: {
    label: 'דינמי',
    labelEn: 'Dynamic',
    icon: Lock,
    color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    description: 'נגזר אוטומטית מהקונטקסט (לקוח, תיק, תאריך)'
  },
  static: {
    label: 'קבוע',
    labelEn: 'Static',
    icon: FolderTree,
    color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    description: 'ערך קבוע בכל הנתיבים'
  },
  pool: {
    label: 'בחירה',
    labelEn: 'Pool',
    icon: List,
    color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
    description: 'בחירה מרשימת ערכים מוגדרת'
  }
};

const DYNAMIC_SOURCES = [
  { value: 'client', label: 'לקוח', icon: User },
  { value: 'case', label: 'תיק', icon: Briefcase },
  { value: 'user', label: 'משתמש', icon: User },
  { value: 'date', label: 'תאריך', icon: Calendar },
];

const FORMAT_TEMPLATES = {
  client: [
    { value: '{client_number} - {client_name}', label: 'מספר - שם' },
    { value: '{client_name}', label: 'שם בלבד' },
    { value: '{client_number}', label: 'מספר בלבד' },
  ],
  case: [
    { value: '{case_number}', label: 'מספר תיק' },
    { value: '{case_number} - {case_title}', label: 'מספר - כותרת' },
    { value: '{case_type}/{case_number}', label: 'סוג/מספר' },
  ],
  user: [
    { value: '{user_name}', label: 'שם משתמש' },
    { value: '{department}', label: 'מחלקה' },
  ],
  date: [
    { value: '{year}', label: 'שנה (2025)' },
    { value: '{year_month}', label: 'שנה-חודש (2025-01)' },
    { value: '{year}/{month}', label: 'שנה/חודש' },
  ],
};

const DEFAULT_SCHEMA = {
  name: '',
  description: '',
  scope: 'global',
  scope_value: '',
  is_default: false,
  is_active: true,
  root_path: '/DWO',
  levels: [],
  metadata: { version: 1 }
};

const DEFAULT_LEVEL = {
  order: 0,
  key: '',
  label: '',
  label_en: '',
  type: 'static',
  source: '',
  format: '',
  values: [],
  depends_on: '',
  required: true
};

export default function TreeSchemaBuilder({ initialSchema, onSave, onCancel, isSaving }) {
  const { t } = useTranslation();
  
  const [schema, setSchema] = useState(DEFAULT_SCHEMA);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (initialSchema) {
      setSchema({
        ...DEFAULT_SCHEMA,
        ...initialSchema,
        levels: initialSchema.levels || []
      });
    } else {
      setSchema(DEFAULT_SCHEMA);
    }
  }, [initialSchema]);

  // Generate unique key for level
  const generateKey = (label) => {
    return label
      .toLowerCase()
      .replace(/[^a-z0-9\u0590-\u05FF]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '') || `level_${Date.now()}`;
  };

  // Update schema field
  const updateSchema = (field, value) => {
    setSchema(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: null }));
    }
  };

  // Level operations
  const addLevel = (type = 'static') => {
    const newLevel = {
      ...DEFAULT_LEVEL,
      type,
      order: schema.levels.length,
      key: `level_${schema.levels.length + 1}`,
      label: type === 'dynamic' ? 'רמה דינמית' : type === 'pool' ? 'רמת בחירה' : 'תיקייה',
      source: type === 'dynamic' ? 'client' : '',
      format: type === 'dynamic' ? '{client_number} - {client_name}' : '',
      values: type !== 'dynamic' ? [{ code: '', name: '', name_en: '' }] : []
    };
    
    setSchema(prev => ({
      ...prev,
      levels: [...prev.levels, newLevel]
    }));
  };

  const updateLevel = (index, field, value) => {
    setSchema(prev => {
      const newLevels = [...prev.levels];
      newLevels[index] = { ...newLevels[index], [field]: value };
      
      // Auto-generate key from label
      if (field === 'label' && !newLevels[index].key.startsWith('level_')) {
        newLevels[index].key = generateKey(value);
      }
      
      // Update format when source changes
      if (field === 'source' && newLevels[index].type === 'dynamic') {
        const templates = FORMAT_TEMPLATES[value];
        if (templates?.length) {
          newLevels[index].format = templates[0].value;
        }
      }
      
      return { ...prev, levels: newLevels };
    });
  };

  const removeLevel = (index) => {
    setSchema(prev => ({
      ...prev,
      levels: prev.levels.filter((_, i) => i !== index).map((l, i) => ({ ...l, order: i }))
    }));
  };

  const moveLevel = (index, direction) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= schema.levels.length) return;
    
    setSchema(prev => {
      const newLevels = [...prev.levels];
      [newLevels[index], newLevels[newIndex]] = [newLevels[newIndex], newLevels[index]];
      return {
        ...prev,
        levels: newLevels.map((l, i) => ({ ...l, order: i }))
      };
    });
  };

  // Value operations for static/pool levels
  const addValue = (levelIndex) => {
    setSchema(prev => {
      const newLevels = [...prev.levels];
      newLevels[levelIndex].values = [
        ...(newLevels[levelIndex].values || []),
        { code: '', name: '', name_en: '' }
      ];
      return { ...prev, levels: newLevels };
    });
  };

  const updateValue = (levelIndex, valueIndex, field, value) => {
    setSchema(prev => {
      const newLevels = [...prev.levels];
      const newValues = [...(newLevels[levelIndex].values || [])];
      newValues[valueIndex] = { ...newValues[valueIndex], [field]: value };
      
      // Auto-generate code from name
      if (field === 'name' && !newValues[valueIndex].code) {
        newValues[valueIndex].code = value.replace(/\s+/g, '_').toUpperCase().slice(0, 20);
      }
      
      newLevels[levelIndex].values = newValues;
      return { ...prev, levels: newLevels };
    });
  };

  const removeValue = (levelIndex, valueIndex) => {
    setSchema(prev => {
      const newLevels = [...prev.levels];
      newLevels[levelIndex].values = newLevels[levelIndex].values.filter((_, i) => i !== valueIndex);
      return { ...prev, levels: newLevels };
    });
  };

  // Validation
  const validate = () => {
    const newErrors = {};
    
    if (!schema.name?.trim()) {
      newErrors.name = 'שם הסכמה הוא שדה חובה';
    }
    
    if (!schema.levels?.length) {
      newErrors.levels = 'יש להגדיר לפחות רמה אחת';
    } else {
      schema.levels.forEach((level, index) => {
        if (!level.label?.trim()) {
          newErrors[`level_${index}_label`] = 'יש להגדיר תווית לרמה';
        }
        if (level.type !== 'dynamic' && (!level.values?.length || !level.values.some(v => v.code?.trim()))) {
          newErrors[`level_${index}_values`] = 'יש להגדיר לפחות ערך אחד';
        }
      });
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Save handler
  const handleSave = () => {
    if (!validate()) {
      return;
    }
    
    // Clean up empty values
    const cleanedSchema = {
      ...schema,
      levels: schema.levels.map(level => ({
        ...level,
        values: level.type === 'dynamic' ? [] : (level.values || []).filter(v => v.code?.trim())
      }))
    };
    
    onSave(cleanedSchema);
  };

  // Generate preview path
  const generatePreviewPath = () => {
    const parts = [];
    
    if (schema.root_path) {
      parts.push(schema.root_path.replace(/^\/+|\/+$/g, ''));
    }
    
    const sortedLevels = [...(schema.levels || [])].sort((a, b) => (a.order || 0) - (b.order || 0));
    
    for (const level of sortedLevels) {
      switch (level.type) {
        case 'dynamic':
          parts.push(`[${level.label || level.source || 'דינמי'}]`);
          break;
        case 'static':
          if (level.values?.length === 1 && level.values[0].code) {
            parts.push(level.values[0].code);
          } else {
            parts.push(`<${level.label || 'קבוע'}>`);
          }
          break;
        case 'pool':
          parts.push(`<${level.label || 'בחירה'}>`);
          break;
      }
    }
    
    return '/' + parts.join('/');
  };

  return (
    <div className="space-y-6">
      {/* Basic Info */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="dark:text-slate-300">שם הסכמה *</Label>
          <Input
            value={schema.name}
            onChange={(e) => updateSchema('name', e.target.value)}
            placeholder="לדוגמה: מבנה סטנדרטי למשרד"
            className={`dark:bg-slate-900 dark:border-slate-600 ${errors.name ? 'border-red-500' : ''}`}
          />
          {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
        </div>
        
        <div className="space-y-2">
          <Label className="dark:text-slate-300">היקף</Label>
          <Select value={schema.scope} onValueChange={(v) => updateSchema('scope', v)}>
            <SelectTrigger className="dark:bg-slate-900 dark:border-slate-600">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="dark:bg-slate-800">
              <SelectItem value="global">גלובלי - כל המערכת</SelectItem>
              <SelectItem value="department">מחלקה</SelectItem>
              <SelectItem value="user">משתמש ספציפי</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label className="dark:text-slate-300">תיאור</Label>
        <Textarea
          value={schema.description || ''}
          onChange={(e) => updateSchema('description', e.target.value)}
          placeholder="תיאור קצר של מבנה התיקיות..."
          className="dark:bg-slate-900 dark:border-slate-600 min-h-[60px]"
          rows={2}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="dark:text-slate-300">נתיב שורש</Label>
          <Input
            value={schema.root_path}
            onChange={(e) => updateSchema('root_path', e.target.value)}
            placeholder="/DWO"
            className="dark:bg-slate-900 dark:border-slate-600 font-mono"
            dir="ltr"
          />
        </div>
        
        <div className="flex items-center gap-4 pt-6">
          <div className="flex items-center gap-2">
            <Switch
              checked={schema.is_active}
              onCheckedChange={(c) => updateSchema('is_active', c)}
            />
            <Label className="dark:text-slate-300">פעיל</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={schema.is_default}
              onCheckedChange={(c) => updateSchema('is_default', c)}
            />
            <Label className="dark:text-slate-300">ברירת מחדל</Label>
          </div>
        </div>
      </div>

      {/* Levels Builder */}
      <div className="border-t dark:border-slate-700 pt-4">
        <div className="flex items-center justify-between mb-4">
          <Label className="text-lg dark:text-slate-200">רמות הנתיב</Label>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => addLevel('dynamic')} className="gap-1">
              <Lock className="w-3 h-3" /> דינמי
            </Button>
            <Button variant="outline" size="sm" onClick={() => addLevel('static')} className="gap-1">
              <FolderTree className="w-3 h-3" /> קבוע
            </Button>
            <Button variant="outline" size="sm" onClick={() => addLevel('pool')} className="gap-1">
              <List className="w-3 h-3" /> בחירה
            </Button>
          </div>
        </div>

        {errors.levels && (
          <p className="text-sm text-red-500 mb-4">{errors.levels}</p>
        )}

        <div className="space-y-3">
          {schema.levels.length === 0 ? (
            <div className="text-center py-8 border-2 border-dashed dark:border-slate-700 rounded-lg">
              <FolderTree className="w-8 h-8 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
              <p className="text-slate-400">לחץ על הכפתורים למעלה להוספת רמות</p>
            </div>
          ) : (
            schema.levels.map((level, index) => {
              const typeConfig = LEVEL_TYPES[level.type];
              const TypeIcon = typeConfig.icon;
              
              return (
                <div 
                  key={index} 
                  className="p-4 bg-slate-50 dark:bg-slate-900 rounded-lg border dark:border-slate-700"
                >
                  <div className="flex items-start gap-3">
                    {/* Reorder */}
                    <div className="flex flex-col gap-1 pt-1">
                      <button 
                        onClick={() => moveLevel(index, -1)} 
                        disabled={index === 0}
                        className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded disabled:opacity-20"
                      >
                        <ChevronUp className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => moveLevel(index, 1)} 
                        disabled={index === schema.levels.length - 1}
                        className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded disabled:opacity-20"
                      >
                        <ChevronDown className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Level Content */}
                    <div className="flex-1 space-y-3">
                      <div className="flex items-center gap-2">
                        <Badge className={typeConfig.color}>
                          <TypeIcon className="w-3 h-3 ml-1" />
                          {typeConfig.label}
                        </Badge>
                        <span className="text-xs text-slate-400">רמה {index + 1}</span>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-xs text-slate-500">תווית *</Label>
                          <Input
                            value={level.label}
                            onChange={(e) => updateLevel(index, 'label', e.target.value)}
                            placeholder="שם הרמה"
                            className={`h-8 text-sm dark:bg-slate-800 ${errors[`level_${index}_label`] ? 'border-red-500' : ''}`}
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-slate-500">תווית באנגלית</Label>
                          <Input
                            value={level.label_en || ''}
                            onChange={(e) => updateLevel(index, 'label_en', e.target.value)}
                            placeholder="English label"
                            className="h-8 text-sm dark:bg-slate-800"
                          />
                        </div>
                      </div>

                      {/* Dynamic Level Options */}
                      {level.type === 'dynamic' && (
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label className="text-xs text-slate-500">מקור</Label>
                            <Select 
                              value={level.source || 'client'} 
                              onValueChange={(v) => updateLevel(index, 'source', v)}
                            >
                              <SelectTrigger className="h-8 text-sm dark:bg-slate-800">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="dark:bg-slate-800">
                                {DYNAMIC_SOURCES.map(src => (
                                  <SelectItem key={src.value} value={src.value}>
                                    <span className="flex items-center gap-2">
                                      <src.icon className="w-3 h-3" />
                                      {src.label}
                                    </span>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label className="text-xs text-slate-500">פורמט</Label>
                            <Select 
                              value={level.format || ''} 
                              onValueChange={(v) => updateLevel(index, 'format', v)}
                            >
                              <SelectTrigger className="h-8 text-sm dark:bg-slate-800">
                                <SelectValue placeholder="בחר פורמט" />
                              </SelectTrigger>
                              <SelectContent className="dark:bg-slate-800">
                                {(FORMAT_TEMPLATES[level.source] || []).map(fmt => (
                                  <SelectItem key={fmt.value} value={fmt.value}>
                                    {fmt.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      )}

                      {/* Static/Pool Level Values */}
                      {level.type !== 'dynamic' && (
                        <div className="space-y-2">
                          <Label className="text-xs text-slate-500">
                            ערכים {level.type === 'static' ? '(קבוע)' : '(לבחירה)'}
                          </Label>
                          {errors[`level_${index}_values`] && (
                            <p className="text-xs text-red-500">{errors[`level_${index}_values`]}</p>
                          )}
                          <div className="space-y-1">
                            {(level.values || []).map((val, valIndex) => (
                              <div key={valIndex} className="flex items-center gap-2">
                                <Input
                                  value={val.name}
                                  onChange={(e) => updateValue(index, valIndex, 'name', e.target.value)}
                                  placeholder="שם"
                                  className="h-7 text-xs flex-1 dark:bg-slate-800"
                                />
                                <Input
                                  value={val.code}
                                  onChange={(e) => updateValue(index, valIndex, 'code', e.target.value)}
                                  placeholder="קוד"
                                  className="h-7 text-xs w-24 font-mono dark:bg-slate-800"
                                />
                                <button
                                  onClick={() => removeValue(index, valIndex)}
                                  className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
                                >
                                  <Trash2 className="w-3 h-3 text-red-500" />
                                </button>
                              </div>
                            ))}
                          </div>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => addValue(index)}
                            className="h-7 text-xs"
                          >
                            <Plus className="w-3 h-3 ml-1" /> הוסף ערך
                          </Button>
                        </div>
                      )}
                    </div>

                    {/* Delete Level */}
                    <button
                      onClick={() => removeLevel(index)}
                      className="p-2 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
                    >
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Preview */}
      {schema.levels.length > 0 && (
        <div className="p-4 bg-slate-100 dark:bg-slate-900 rounded-lg border dark:border-slate-700">
          <Label className="text-sm text-slate-500 mb-2 block">תצוגה מקדימה:</Label>
          <div className="flex items-center gap-2 flex-wrap">
            {schema.root_path && (
              <>
                <Badge variant="outline" className="font-mono text-xs">
                  {schema.root_path.replace(/^\/+|\/+$/g, '')}
                </Badge>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </>
            )}
            {schema.levels.map((level, index) => {
              const typeConfig = LEVEL_TYPES[level.type];
              return (
                <React.Fragment key={index}>
                  <Badge className={`${typeConfig.color} text-xs`}>
                    {level.type === 'dynamic' 
                      ? `[${level.label || level.source}]`
                      : level.type === 'static' && level.values?.length === 1 && level.values[0].code
                        ? level.values[0].code
                        : `<${level.label}>`
                    }
                  </Badge>
                  {index < schema.levels.length - 1 && (
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  )}
                </React.Fragment>
              );
            })}
          </div>
          <p className="text-xs text-slate-400 mt-2 font-mono dir-ltr text-left">
            {generatePreviewPath()}
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-4 border-t dark:border-slate-700">
        <Button variant="outline" onClick={onCancel}>
          ביטול
        </Button>
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : null}
          {initialSchema ? 'עדכן סכמה' : 'צור סכמה'}
        </Button>
      </div>
    </div>
  );
}