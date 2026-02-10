import React, { useState, useEffect } from 'react';
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Plus,
  Trash2,
  GripVertical,
  ChevronRight,
  FolderOpen,
  Type,
  Database,
  Combine
} from 'lucide-react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';

// Available fields for path segments - must match backend PATH_SEGMENT_FIELDS
const AVAILABLE_FIELDS = {
  client: [
    { key: 'client_name', label: 'שם לקוח' },
    { key: 'client_number', label: 'מספר לקוח' },
    { key: 'client_country', label: 'מדינת לקוח' },
  ],
  case: [
    { key: 'case_title', label: 'שם תיק' },
    { key: 'case_number', label: 'מספר תיק' },
    { key: 'case_type', label: 'סוג תיק' },
    { key: 'application_number', label: 'מספר בקשה' },
    { key: 'territory', label: 'מדינת הגשה' },
  ],
  numbering: [
    { key: 'numbering_prefix', label: '001 - לפני' },
    { key: 'numbering_suffix', label: 'אחרי - 001' },
  ],
};

// Flatten for easy lookup
const ALL_FIELDS = [
  ...AVAILABLE_FIELDS.client,
  ...AVAILABLE_FIELDS.case,
  ...AVAILABLE_FIELDS.numbering,
];

const SEGMENT_TYPES = [
  { value: 'fixed', label: 'קבוע', icon: Type },
  { value: 'field', label: 'שדה', icon: Database },
  { value: 'combined', label: 'משולב', icon: Combine },
];

// For single field type - still need numbering dropdown
const NUMBERING_OPTIONS = [
  { value: 'none', label: 'ללא מספור' },
  { value: 'prefix', label: '001 - לפני' },
  { value: 'suffix', label: 'אחרי - 001' },
];

// Default segment when adding new
const createDefaultSegment = (type = 'fixed') => ({
  id: `seg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
  type,
  value: '',
  field: '',
  fields: [],
  separator: ' - ',
  numbering: 'none',
});

// Segment item component
function SegmentItem({ segment, index, onUpdate, onRemove, canRemove, dragHandleProps }) {
  const updateField = (field, value) => {
    onUpdate(index, { ...segment, [field]: value });
  };

  const handleTypeChange = (newType) => {
    const updated = {
      ...segment,
      type: newType,
      // Reset type-specific fields
      value: newType === 'fixed' ? segment.value : '',
      field: newType === 'field' ? segment.field : '',
      fields: newType === 'combined' ? (segment.fields?.length ? segment.fields : ['', '']) : [],
    };
    onUpdate(index, updated);
  };

  const handleFieldsChange = (fieldIndex, value) => {
    const newFields = [...(segment.fields || [])];
    newFields[fieldIndex] = value;
    updateField('fields', newFields);
  };

  const addCombinedField = () => {
    const newFields = [...(segment.fields || []), ''];
    updateField('fields', newFields);
  };

  const removeCombinedField = (fieldIndex) => {
    const newFields = segment.fields.filter((_, i) => i !== fieldIndex);
    updateField('fields', newFields);
  };

  return (
    <div className="flex items-start gap-1.5 p-2 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700">
      {/* Drag handle */}
      <button
        {...dragHandleProps}
        className="p-0.5 mt-0.5 text-slate-400 hover:text-slate-600 cursor-grab active:cursor-grabbing"
      >
        <GripVertical className="w-3.5 h-3.5" />
      </button>

      {/* Segment number */}
      <div className="flex items-center justify-center w-5 h-5 mt-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-[10px] font-medium text-slate-600 dark:text-slate-300">
        {index + 1}
      </div>

      {/* Segment content */}
      <div className="flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Type selector */}
          <Select value={segment.type} onValueChange={handleTypeChange}>
            <SelectTrigger className="w-24 h-7 text-xs dark:bg-slate-800 dark:border-slate-600">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="dark:bg-slate-800">
              {SEGMENT_TYPES.map(t => (
                <SelectItem key={t.value} value={t.value} className="text-xs">
                  <div className="flex items-center gap-1">
                    <t.icon className="w-3 h-3" />
                    {t.label}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Type-specific inputs */}
          {segment.type === 'fixed' && (
            <Input
              value={segment.value || ''}
              onChange={(e) => updateField('value', e.target.value)}
              placeholder="שם התיקיה..."
              className="flex-1 h-7 text-xs dark:bg-slate-800 dark:border-slate-600"
            />
          )}

          {segment.type === 'field' && (
            <Select value={segment.field || ''} onValueChange={(v) => updateField('field', v)}>
              <SelectTrigger className="flex-1 h-7 text-xs dark:bg-slate-800 dark:border-slate-600">
                <SelectValue placeholder="בחר שדה..." />
              </SelectTrigger>
              <SelectContent className="dark:bg-slate-800">
                <div className="px-2 py-1 text-[10px] font-semibold text-slate-500">לקוח</div>
                {AVAILABLE_FIELDS.client.map(f => (
                  <SelectItem key={f.key} value={f.key} className="text-xs">{f.label}</SelectItem>
                ))}
                <div className="px-2 py-1 text-[10px] font-semibold text-slate-500 border-t dark:border-slate-700 mt-1 pt-1">תיק</div>
                {AVAILABLE_FIELDS.case.map(f => (
                  <SelectItem key={f.key} value={f.key} className="text-xs">{f.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {segment.type === 'combined' && (
            <div className="flex-1 flex items-center gap-1 flex-wrap">
              {(segment.fields || []).map((fieldKey, fidx) => (
                <React.Fragment key={fidx}>
                  {fidx > 0 && (
                    <Input
                      value={segment.separator || ' - '}
                      onChange={(e) => updateField('separator', e.target.value)}
                      className="w-9 h-7 text-xs text-center px-1 dark:bg-slate-800 dark:border-slate-600"
                    />
                  )}
                  <div className="flex items-center gap-0.5">
                    <Select value={fieldKey || ''} onValueChange={(v) => handleFieldsChange(fidx, v)}>
                      <SelectTrigger className="w-28 h-7 text-xs dark:bg-slate-800 dark:border-slate-600">
                        <SelectValue placeholder="שדה..." />
                      </SelectTrigger>
                      <SelectContent className="dark:bg-slate-800">
                        <div className="px-2 py-1 text-[10px] font-semibold text-slate-500">לקוח</div>
                        {AVAILABLE_FIELDS.client.map(f => (
                          <SelectItem key={f.key} value={f.key} className="text-xs">{f.label}</SelectItem>
                        ))}
                        <div className="px-2 py-1 text-[10px] font-semibold text-slate-500 border-t dark:border-slate-700 mt-1 pt-1">תיק</div>
                        {AVAILABLE_FIELDS.case.map(f => (
                          <SelectItem key={f.key} value={f.key} className="text-xs">{f.label}</SelectItem>
                        ))}
                        <div className="px-2 py-1 text-[10px] font-semibold text-slate-500 border-t dark:border-slate-700 mt-1 pt-1">מספור</div>
                        {AVAILABLE_FIELDS.numbering.map(f => (
                          <SelectItem key={f.key} value={f.key} className="text-xs">{f.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {segment.fields.length > 2 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeCombinedField(fidx)}
                        className="h-5 w-5 p-0 text-slate-400 hover:text-red-500"
                      >
                        <Trash2 className="w-2.5 h-2.5" />
                      </Button>
                    )}
                  </div>
                </React.Fragment>
              ))}
              {(segment.fields || []).length < 4 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={addCombinedField}
                  className="h-7 px-1.5"
                >
                  <Plus className="w-3 h-3" />
                </Button>
              )}
            </div>
          )}

          {/* Numbering selector - only for fixed and field types (combined type has numbering as a field option) */}
          {segment.type !== 'combined' && (
            <Select value={segment.numbering || 'none'} onValueChange={(v) => updateField('numbering', v)}>
              <SelectTrigger className="w-28 h-7 text-xs dark:bg-slate-800 dark:border-slate-600">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="dark:bg-slate-800">
                {NUMBERING_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value} className="text-xs">{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* Remove button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onRemove(index)}
        disabled={!canRemove}
        className="p-0.5 mt-0.5 h-5 w-5 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-30"
      >
        <Trash2 className="w-3 h-3" />
      </Button>
    </div>
  );
}

// Generate preview path
function generatePreview(segments, rootPath = '/DWO') {
  if (!segments || segments.length === 0) return '/...';

  const parts = [rootPath.replace(/^\/+|\/+$/g, '')];

  for (const segment of segments) {
    const separator = segment.separator || ' - ';
    const numbering = segment.numbering || 'none';
    let displayName = '';

    switch (segment.type) {
      case 'fixed':
        displayName = segment.value || '...';
        break;

      case 'field': {
        const fieldConfig = ALL_FIELDS.find(f => f.key === segment.field);
        displayName = `{${fieldConfig?.label || segment.field || 'שדה'}}`;
        break;
      }

      case 'combined': {
        const fieldLabels = (segment.fields || [])
          .filter(f => f)
          .map(fieldKey => {
            // Handle numbering fields specially
            if (fieldKey === 'numbering_prefix' || fieldKey === 'numbering_suffix') {
              return '###';
            }
            const fieldConfig = ALL_FIELDS.find(f => f.key === fieldKey);
            return `{${fieldConfig?.label || fieldKey}}`;
          });
        displayName = fieldLabels.join(separator) || '{משולב}';
        break;
      }
    }

    // Add numbering indicator
    if (numbering === 'prefix') {
      displayName = `###${separator}${displayName}`;
    } else if (numbering === 'suffix') {
      displayName = `${displayName}${separator}###`;
    }

    parts.push(displayName);
  }

  return '/' + parts.join('/');
}

// Reorder array helper
const reorder = (list, startIndex, endIndex) => {
  const result = Array.from(list);
  const [removed] = result.splice(startIndex, 1);
  result.splice(endIndex, 0, removed);
  return result;
};

export default function PathBuilder({ segments = [], onChange, rootPath = '', onRootPathChange }) {
  const [localSegments, setLocalSegments] = useState([]);
  const hasInitialized = React.useRef(false);
  const userHasInteracted = React.useRef(false);

  // Initialize segments from props - only once
  useEffect(() => {
    if (!hasInitialized.current) {
      hasInitialized.current = true;
      if (segments && segments.length > 0) {
        const withIds = segments.map((seg, idx) => ({
          ...seg,
          id: seg.id || `seg_init_${idx}_${Math.random().toString(36).substr(2, 9)}`,
        }));
        setLocalSegments(withIds);
      } else {
        setLocalSegments([createDefaultSegment('fixed')]);
      }
    }
  }, [segments]);

  // Notify parent of changes - only when user interacts
  useEffect(() => {
    if (userHasInteracted.current && localSegments.length > 0) {
      const cleanSegments = localSegments.map(({ id, ...rest }) => rest);
      onChange(cleanSegments);
    }
  }, [localSegments]);

  // Wrapper to mark user interaction
  const updateSegmentsWithInteraction = (newSegments) => {
    userHasInteracted.current = true;
    setLocalSegments(newSegments);
  };

  const handleDragEnd = (result) => {
    if (!result.destination) return;

    const items = reorder(
      localSegments,
      result.source.index,
      result.destination.index
    );

    updateSegmentsWithInteraction(items);
  };

  const addSegment = (type = 'fixed') => {
    updateSegmentsWithInteraction([...localSegments, createDefaultSegment(type)]);
  };

  const updateSegment = (index, updated) => {
    const newSegments = [...localSegments];
    newSegments[index] = updated;
    updateSegmentsWithInteraction(newSegments);
  };

  const removeSegment = (index) => {
    if (localSegments.length > 1) {
      updateSegmentsWithInteraction(localSegments.filter((_, i) => i !== index));
    }
  };

  const previewPath = generatePreview(localSegments, rootPath);

  return (
    <div className="space-y-2">
      <Label className="text-xs font-medium">נתיב שמירה</Label>

      {/* Root Path Input */}
      <div className="flex items-center gap-1.5">
        <Label className="text-[10px] text-slate-500 whitespace-nowrap">שורש:</Label>
        <Input
          value={rootPath || ''}
          onChange={(e) => onRootPathChange?.(e.target.value)}
          placeholder="/"
          className="h-6 text-xs font-mono w-28 dark:bg-slate-800 dark:border-slate-600"
          dir="ltr"
        />
      </div>

      {/* Path Preview */}
      <div className="rounded border dark:border-slate-700 overflow-hidden">
        <div className="flex items-center gap-1.5 px-2 py-1 bg-slate-100 dark:bg-slate-800 border-b dark:border-slate-700">
          <FolderOpen className="w-3 h-3 text-amber-500 flex-shrink-0" />
          <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">תצוגה מקדימה:</span>
        </div>

        {/* Preview with parts */}
        <div className="px-2 py-1.5 bg-blue-50 dark:bg-blue-950/40">
          <div className="flex items-center gap-1.5 flex-wrap" dir="ltr">
            {previewPath.split('/').filter(Boolean).map((part, i, arr) => {
              const isDynamic = part.includes('{');
              const hasNumber = part.includes('###');
              return (
                <React.Fragment key={i}>
                  <span
                    className={`text-[10px] font-mono px-1 py-0.5 rounded ${
                      isDynamic
                        ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300'
                        : hasNumber
                          ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                          : 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                    }`}
                  >
                    {part}
                  </span>
                  {i < arr.length - 1 && (
                    <ChevronRight className="w-2.5 h-2.5 text-slate-400 flex-shrink-0" />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      </div>

      {/* Segments List with Drag and Drop */}
      <DragDropContext onDragEnd={handleDragEnd}>
        <Droppable droppableId="segments">
          {(provided) => (
            <div
              {...provided.droppableProps}
              ref={provided.innerRef}
              className="space-y-1.5"
            >
              {localSegments.map((segment, index) => (
                <Draggable key={segment.id} draggableId={segment.id} index={index}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      style={{
                        ...provided.draggableProps.style,
                        opacity: snapshot.isDragging ? 0.8 : 1,
                      }}
                    >
                      <SegmentItem
                        segment={segment}
                        index={index}
                        onUpdate={updateSegment}
                        onRemove={removeSegment}
                        canRemove={localSegments.length > 1}
                        dragHandleProps={provided.dragHandleProps}
                      />
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>

      {/* Add Segment Button */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => addSegment('fixed')}
        className="w-full gap-1.5 h-7 text-xs dark:border-slate-600 dark:text-slate-200"
      >
        <Plus className="w-3 h-3" />
        הוסף שלב
      </Button>
    </div>
  );
}

// Export for use in other components
export { AVAILABLE_FIELDS, ALL_FIELDS, generatePreview };
