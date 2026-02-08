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
    description: 'נגזר אוטומטית מהקונטקסט (לקוח, תיק)'
  },
  static: {
    label: 'קבוע',
    labelEn: 'Static',
    icon: FolderTree,
    color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    description: 'ערך קבוע בכל הנתיבים'
  },
  list: {
    label: 'רשימה',
    labelEn: 'List',
    icon: List,
    color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
    description: 'בחירה מרשימת ערכים מוגדרת'
  }
};

// Numbering types
const NUMBERING_TYPES = {
  none: { label: 'ללא מספור', labelEn: 'None' },
  chronological: { label: 'כרונולוגי', labelEn: 'Chronological' },
  entity_field: { label: 'משדה ישות', labelEn: 'From Entity Field' }
};

const DYNAMIC_SOURCES = [
  { value: 'client', label: 'לקוח', icon: User, fields: ['name', 'client_number'] },
  { value: 'case', label: 'תיק', icon: Briefcase, fields: ['title', 'case_number', 'case_type'] },
];

// Entity fields for numbering (when using entity_field numbering type)
const ENTITY_NUMBER_FIELDS = {
  client: [
    { value: 'client_number', label: 'מספר לקוח' },
  ],
  case: [
    { value: 'case_number', label: 'מספר תיק' },
  ],
};

// Entity display presets - simplified options for users
const ENTITY_DISPLAY_PRESETS = {
  client: [
    { value: 'number_name', label: 'מספר לקוח - שם לקוח', source_field: 'name', numbering_type: 'entity_field', numbering_field: 'client_number' },
    { value: 'name_only', label: 'שם לקוח בלבד', source_field: 'name', numbering_type: 'none', numbering_field: '' },
    { value: 'number_only', label: 'מספר לקוח בלבד', source_field: 'client_number', numbering_type: 'none', numbering_field: '' },
  ],
  case: [
    { value: 'number_name', label: 'מספר תיק - שם תיק', source_field: 'title', numbering_type: 'entity_field', numbering_field: 'case_number' },
    { value: 'name_only', label: 'שם תיק בלבד', source_field: 'title', numbering_type: 'none', numbering_field: '' },
    { value: 'number_only', label: 'מספר תיק בלבד', source_field: 'case_number', numbering_type: 'none', numbering_field: '' },
    { value: 'type_only', label: 'סוג תיק בלבד', source_field: 'case_type', numbering_type: 'none', numbering_field: '' },
  ],
};

// Entity fields for display name (kept for backward compatibility)
const ENTITY_NAME_FIELDS = {
  client: [
    { value: 'name', label: 'שם לקוח' },
    { value: 'client_number', label: 'מספר לקוח' },
  ],
  case: [
    { value: 'title', label: 'שם תיק' },
    { value: 'case_number', label: 'מספר תיק' },
    { value: 'case_type', label: 'סוג תיק' },
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
  type: 'static',
  // For dynamic type
  source: '',           // 'client' | 'case'
  source_field: '',     // which field to use for display name
  // For static/list type
  values: [],           // array of strings (no more code/name objects)
  // Numbering configuration
  numbering: {
    type: 'none',       // 'none' | 'chronological' | 'entity_field'
    field: '',          // for entity_field: 'client_number', 'case_number'
    position: 'prefix'  // 'prefix' | 'suffix'
  },
  separator: ' - ',
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
    const labelMap = { dynamic: 'רמה דינמית', list: 'רמת בחירה', static: 'תיקייה קבועה' };

    // Static = single fixed value, no numbering
    // List = multiple values with per-value numbering options
    const newLevel = {
      ...DEFAULT_LEVEL,
      type,
      order: schema.levels.length,
      key: `level_${schema.levels.length + 1}`,
      label: labelMap[type] || 'תיקייה',
      source: type === 'dynamic' ? 'client' : '',
      source_field: type === 'dynamic' ? 'name' : '',
      display_preset: type === 'dynamic' ? 'number_name' : '',
      // Static: single value object, List: array of value objects with numbering
      values: type === 'static'
        ? [{ code: '', name: '' }]
        : type === 'list'
          ? [{ code: '', name: '', numbering: { type: 'none', position: 'prefix' } }]
          : [],
      // Numbering at level only for dynamic, list has per-value numbering
      numbering: {
        type: type === 'dynamic' ? 'entity_field' : 'none',
        field: type === 'dynamic' ? 'client_number' : '',
        position: 'prefix'
      },
      separator: ' - '
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

      // When source changes, update defaults
      if (field === 'source' && newLevels[index].type === 'dynamic') {
        const nameFields = ENTITY_NAME_FIELDS[value];
        const numFields = ENTITY_NUMBER_FIELDS[value];
        if (nameFields?.length) {
          newLevels[index].source_field = nameFields[0].value;
        }
        if (numFields?.length && newLevels[index].numbering?.type === 'entity_field') {
          newLevels[index].numbering = {
            ...newLevels[index].numbering,
            field: numFields[0].value
          };
        }
      }

      return { ...prev, levels: newLevels };
    });
  };

  // Update nested numbering field
  const updateLevelNumbering = (index, field, value) => {
    setSchema(prev => {
      const newLevels = [...prev.levels];
      newLevels[index] = {
        ...newLevels[index],
        numbering: { ...newLevels[index].numbering, [field]: value }
      };

      // When changing to entity_field, set default field
      if (field === 'type' && value === 'entity_field' && newLevels[index].source) {
        const numFields = ENTITY_NUMBER_FIELDS[newLevels[index].source];
        if (numFields?.length) {
          newLevels[index].numbering.field = numFields[0].value;
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

  // Value operations for static/list levels (values are objects with code, name, and optionally numbering)
  const addValue = (levelIndex) => {
    setSchema(prev => {
      const newLevels = [...prev.levels];
      const level = newLevels[levelIndex];
      // For list type, include numbering in each value
      const newValue = level.type === 'list'
        ? { code: '', name: '', numbering: { type: 'none', position: 'prefix' } }
        : { code: '', name: '' };
      newLevels[levelIndex].values = [...(newLevels[levelIndex].values || []), newValue];
      return { ...prev, levels: newLevels };
    });
  };

  const updateValue = (levelIndex, valueIndex, field, value) => {
    setSchema(prev => {
      const newLevels = [...prev.levels];
      const newValues = [...(newLevels[levelIndex].values || [])];

      // Ensure value is an object
      if (typeof newValues[valueIndex] === 'string') {
        newValues[valueIndex] = { code: newValues[valueIndex], name: newValues[valueIndex] };
      }

      newValues[valueIndex] = { ...newValues[valueIndex], [field]: value };

      // Auto-sync code with name for simplicity
      if (field === 'name') {
        newValues[valueIndex].code = value;
      }

      newLevels[levelIndex].values = newValues;
      return { ...prev, levels: newLevels };
    });
  };

  const updateValueNumbering = (levelIndex, valueIndex, field, value) => {
    setSchema(prev => {
      const newLevels = [...prev.levels];
      const newValues = [...(newLevels[levelIndex].values || [])];

      // Ensure value is an object with numbering
      if (typeof newValues[valueIndex] === 'string') {
        newValues[valueIndex] = {
          code: newValues[valueIndex],
          name: newValues[valueIndex],
          numbering: { type: 'none', position: 'prefix' }
        };
      }
      if (!newValues[valueIndex].numbering) {
        newValues[valueIndex].numbering = { type: 'none', position: 'prefix' };
      }

      newValues[valueIndex].numbering = {
        ...newValues[valueIndex].numbering,
        [field]: value
      };

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
        // For static/list - need at least one non-empty value
        if (level.type === 'static' || level.type === 'list') {
          const hasValues = level.values?.some(v => {
            const name = typeof v === 'string' ? v : v?.name;
            return name?.trim();
          });
          if (!hasValues) {
            newErrors[`level_${index}_values`] = 'יש להגדיר לפחות ערך אחד';
          }
        }
        // For dynamic - need source
        if (level.type === 'dynamic' && !level.source) {
          newErrors[`level_${index}_source`] = 'יש לבחור מקור';
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

    // Clean up and normalize schema
    const cleanedSchema = {
      ...schema,
      levels: schema.levels.map(level => {
        const cleanLevel = { ...level };

        // Clean values - keep as objects, filter empty
        if (level.type === 'dynamic') {
          cleanLevel.values = [];
        } else {
          cleanLevel.values = (level.values || [])
            .map(v => {
              // Convert string to object if needed
              if (typeof v === 'string') {
                return { code: v, name: v };
              }
              // Ensure object has required fields
              return {
                code: v.code || v.name || '',
                name: v.name || v.code || '',
                name_en: v.name_en || '',
                // Include numbering for list type values
                ...(level.type === 'list' && v.numbering ? { numbering: v.numbering } : {})
              };
            })
            .filter(v => v.name?.trim());
        }

        // Ensure numbering exists at level (for dynamic)
        if (!cleanLevel.numbering) {
          cleanLevel.numbering = { type: 'none', field: '', position: 'prefix' };
        }

        // For static type, remove level numbering (no numbering for static)
        if (level.type === 'static') {
          cleanLevel.numbering = { type: 'none', field: '', position: 'prefix' };
        }

        return cleanLevel;
      })
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
      let folderName = '';
      const sep = level.separator || ' - ';
      const numType = level.numbering?.type || 'none';
      const numPos = level.numbering?.position || 'prefix';

      // Build the base name part
      if (level.type === 'dynamic') {
        folderName = `[${level.label || level.source || 'דינמי'}]`;
      } else if (level.type === 'static') {
        const val = level.values?.[0];
        const firstValue = typeof val === 'string' ? val : val?.name || val?.code;
        if (level.values?.length === 1 && firstValue) {
          folderName = firstValue;
        } else {
          folderName = `<${level.label || 'קבוע'}>`;
        }
      } else if (level.type === 'list' || level.type === 'pool') {
        folderName = `<${level.label || 'רשימה'}>`;
      }

      // Add numbering indicator
      if (numType !== 'none') {
        const numIndicator = numType === 'chronological' ? '###' : '[מס\']';
        if (numPos === 'prefix') {
          folderName = `${numIndicator}${sep}${folderName}`;
        } else {
          folderName = `${folderName}${sep}${numIndicator}`;
        }
      }

      parts.push(folderName);
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
            <Button variant="outline" size="sm" onClick={() => addLevel('list')} className="gap-1">
              <List className="w-3 h-3" /> רשימה
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
              const typeConfig = LEVEL_TYPES[level.type] || LEVEL_TYPES.list; // 'pool' -> 'list' backward compatibility
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

                      {/* Dynamic Level Options - Simplified with Presets */}
                      {level.type === 'dynamic' && (
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label className="text-xs text-slate-500">ישות</Label>
                            <Select
                              value={level.source || 'client'}
                              onValueChange={(v) => {
                                updateLevel(index, 'source', v);
                                // Reset preset when source changes
                                const presets = ENTITY_DISPLAY_PRESETS[v];
                                if (presets?.length) {
                                  const defaultPreset = presets[0];
                                  updateLevel(index, 'display_preset', defaultPreset.value);
                                  updateLevel(index, 'source_field', defaultPreset.source_field);
                                  updateLevelNumbering(index, 'type', defaultPreset.numbering_type);
                                  updateLevelNumbering(index, 'field', defaultPreset.numbering_field);
                                }
                              }}
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
                            <Label className="text-xs text-slate-500">תצוגה</Label>
                            <Select
                              value={level.display_preset || 'number_name'}
                              onValueChange={(v) => {
                                const presets = ENTITY_DISPLAY_PRESETS[level.source];
                                const preset = presets?.find(p => p.value === v);
                                if (preset) {
                                  updateLevel(index, 'display_preset', v);
                                  updateLevel(index, 'source_field', preset.source_field);
                                  updateLevelNumbering(index, 'type', preset.numbering_type);
                                  updateLevelNumbering(index, 'field', preset.numbering_field);
                                }
                              }}
                            >
                              <SelectTrigger className="h-8 text-sm dark:bg-slate-800">
                                <SelectValue placeholder="בחר תצוגה" />
                              </SelectTrigger>
                              <SelectContent className="dark:bg-slate-800">
                                {(ENTITY_DISPLAY_PRESETS[level.source] || []).map(p => (
                                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      )}

                      {/* Static Level - Single Fixed Value, No Numbering */}
                      {level.type === 'static' && (
                        <div className="space-y-2">
                          <Label className="text-xs text-slate-500">שם התיקייה הקבועה</Label>
                          {errors[`level_${index}_values`] && (
                            <p className="text-xs text-red-500">{errors[`level_${index}_values`]}</p>
                          )}
                          <Input
                            value={typeof level.values?.[0] === 'string' ? level.values[0] : level.values?.[0]?.name || ''}
                            onChange={(e) => updateValue(index, 0, 'name', e.target.value)}
                            placeholder="לדוגמה: לקוחות DWO"
                            className="h-8 text-sm dark:bg-slate-800"
                          />
                        </div>
                      )}

                      {/* List Level - Multiple Values with Per-Value Numbering */}
                      {level.type === 'list' && (
                        <div className="space-y-2">
                          <Label className="text-xs text-slate-500">ערכים לבחירה</Label>
                          {errors[`level_${index}_values`] && (
                            <p className="text-xs text-red-500">{errors[`level_${index}_values`]}</p>
                          )}
                          <div className="space-y-2">
                            {(level.values || []).map((val, valIndex) => {
                              const valName = typeof val === 'string' ? val : val?.name || '';
                              const valNumbering = val?.numbering || { type: 'none', position: 'prefix' };
                              return (
                                <div key={valIndex} className="flex items-center gap-2 p-2 bg-white dark:bg-slate-800 rounded border dark:border-slate-600">
                                  <Input
                                    value={valName}
                                    onChange={(e) => updateValue(index, valIndex, 'name', e.target.value)}
                                    placeholder="שם התיקייה"
                                    className="h-7 text-xs flex-1 dark:bg-slate-700"
                                  />
                                  <Select
                                    value={`${valNumbering.type}_${valNumbering.position}`}
                                    onValueChange={(v) => {
                                      const [type, position] = v.split('_');
                                      updateValueNumbering(index, valIndex, 'type', type);
                                      if (position) updateValueNumbering(index, valIndex, 'position', position);
                                    }}
                                  >
                                    <SelectTrigger className="h-7 text-xs w-36 dark:bg-slate-700">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="dark:bg-slate-800">
                                      <SelectItem value="none_prefix">ללא מספור</SelectItem>
                                      <SelectItem value="chronological_prefix">001 - לפני</SelectItem>
                                      <SelectItem value="chronological_suffix">001 - אחרי</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <button
                                    onClick={() => removeValue(index, valIndex)}
                                    className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
                                  >
                                    <Trash2 className="w-3 h-3 text-red-500" />
                                  </button>
                                </div>
                              );
                            })}
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

                      {/* Numbering Configuration - Only for Dynamic */}
                      {level.type === 'dynamic' && (
                        <div className="pt-2 border-t dark:border-slate-700">
                          <Label className="text-xs text-slate-500 mb-2 block">מספור</Label>
                          <div className="grid grid-cols-3 gap-2">
                            <Select
                              value={level.numbering?.type || 'none'}
                              onValueChange={(v) => updateLevelNumbering(index, 'type', v)}
                            >
                              <SelectTrigger className="h-8 text-sm dark:bg-slate-800">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="dark:bg-slate-800">
                                <SelectItem value="none">ללא</SelectItem>
                                <SelectItem value="chronological">כרונולוגי (001, 002...)</SelectItem>
                                <SelectItem value="entity_field">משדה ישות</SelectItem>
                              </SelectContent>
                            </Select>

                            {level.numbering?.type === 'entity_field' && level.source && (
                              <Select
                                value={level.numbering?.field || ''}
                                onValueChange={(v) => updateLevelNumbering(index, 'field', v)}
                              >
                                <SelectTrigger className="h-8 text-sm dark:bg-slate-800">
                                  <SelectValue placeholder="שדה" />
                                </SelectTrigger>
                                <SelectContent className="dark:bg-slate-800">
                                  {(ENTITY_NUMBER_FIELDS[level.source] || []).map(f => (
                                    <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}

                            {level.numbering?.type !== 'none' && (
                              <Select
                                value={level.numbering?.position || 'prefix'}
                                onValueChange={(v) => updateLevelNumbering(index, 'position', v)}
                              >
                                <SelectTrigger className="h-8 text-sm dark:bg-slate-800">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="dark:bg-slate-800">
                                  <SelectItem value="prefix">מספר בהתחלה</SelectItem>
                                  <SelectItem value="suffix">מספר בסוף</SelectItem>
                                </SelectContent>
                              </Select>
                            )}
                          </div>
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
              const typeConfig = LEVEL_TYPES[level.type] || LEVEL_TYPES.list;
              const numType = level.numbering?.type || 'none';
              const numPos = level.numbering?.position || 'prefix';
              const sep = level.separator || ' - ';

              // Build display name
              let displayName = '';
              if (level.type === 'dynamic') {
                displayName = `[${level.label || level.source}]`;
              } else {
                const val = level.values?.[0];
                const firstVal = typeof val === 'string' ? val : val?.name || val?.code;
                if (level.type === 'static' && level.values?.length === 1 && firstVal) {
                  displayName = firstVal;
                } else {
                  displayName = `<${level.label}>`;
                }
              }

              // Add numbering indicator
              if (numType !== 'none') {
                const numInd = numType === 'chronological' ? '###' : '#';
                displayName = numPos === 'prefix'
                  ? `${numInd}${sep}${displayName}`
                  : `${displayName}${sep}${numInd}`;
              }

              return (
                <React.Fragment key={index}>
                  <Badge className={`${typeConfig.color} text-xs`}>
                    {displayName}
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