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
};

// Flatten for easy lookup
const ALL_FIELDS = [
  ...AVAILABLE_FIELDS.client,
  ...AVAILABLE_FIELDS.case,
];

const SEGMENT_TYPES = [
  { value: 'fixed', label: 'קבוע', icon: Type },
  { value: 'field', label: 'שדה', icon: Database },
  { value: 'combined', label: 'משולב', icon: Combine },
];

const NUMBERING_OPTIONS = [
  { value: 'none', label: 'ללא מספור' },
  { value: 'prefix', label: '001 - לפני השם' },
  { value: 'suffix', label: 'לאחר השם - 001' },
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
    <div className="flex items-start gap-2 p-3 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700">
      {/* Drag handle */}
      <button
        {...dragHandleProps}
        className="p-1 mt-1 text-slate-400 hover:text-slate-600 cursor-grab active:cursor-grabbing"
      >
        <GripVertical className="w-4 h-4" />
      </button>

      {/* Segment number */}
      <div className="flex items-center justify-center w-6 h-6 mt-1 rounded-full bg-slate-200 dark:bg-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300">
        {index + 1}
      </div>

      {/* Segment content */}
      <div className="flex-1 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Type selector */}
          <Select value={segment.type} onValueChange={handleTypeChange}>
            <SelectTrigger className="w-28 h-8 dark:bg-slate-800 dark:border-slate-600">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="dark:bg-slate-800">
              {SEGMENT_TYPES.map(t => (
                <SelectItem key={t.value} value={t.value}>
                  <div className="flex items-center gap-1.5">
                    <t.icon className="w-3.5 h-3.5" />
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
              className="flex-1 h-8 dark:bg-slate-800 dark:border-slate-600"
            />
          )}

          {segment.type === 'field' && (
            <Select value={segment.field || ''} onValueChange={(v) => updateField('field', v)}>
              <SelectTrigger className="flex-1 h-8 dark:bg-slate-800 dark:border-slate-600">
                <SelectValue placeholder="בחר שדה..." />
              </SelectTrigger>
              <SelectContent className="dark:bg-slate-800">
                <div className="px-2 py-1.5 text-xs font-semibold text-slate-500">לקוח</div>
                {AVAILABLE_FIELDS.client.map(f => (
                  <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>
                ))}
                <div className="px-2 py-1.5 text-xs font-semibold text-slate-500 border-t dark:border-slate-700 mt-1 pt-1">תיק</div>
                {AVAILABLE_FIELDS.case.map(f => (
                  <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>
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
                      className="w-12 h-8 text-center dark:bg-slate-800 dark:border-slate-600"
                    />
                  )}
                  <div className="flex items-center gap-1">
                    <Select value={fieldKey || ''} onValueChange={(v) => handleFieldsChange(fidx, v)}>
                      <SelectTrigger className="w-32 h-8 dark:bg-slate-800 dark:border-slate-600">
                        <SelectValue placeholder="שדה..." />
                      </SelectTrigger>
                      <SelectContent className="dark:bg-slate-800">
                        <div className="px-2 py-1.5 text-xs font-semibold text-slate-500">לקוח</div>
                        {AVAILABLE_FIELDS.client.map(f => (
                          <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>
                        ))}
                        <div className="px-2 py-1.5 text-xs font-semibold text-slate-500 border-t dark:border-slate-700 mt-1 pt-1">תיק</div>
                        {AVAILABLE_FIELDS.case.map(f => (
                          <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {segment.fields.length > 2 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeCombinedField(fidx)}
                        className="h-6 w-6 p-0 text-slate-400 hover:text-red-500"
                      >
                        <Trash2 className="w-3 h-3" />
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
                  className="h-8 px-2"
                >
                  <Plus className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
          )}

          {/* Numbering selector */}
          <Select value={segment.numbering || 'none'} onValueChange={(v) => updateField('numbering', v)}>
            <SelectTrigger className="w-36 h-8 dark:bg-slate-800 dark:border-slate-600">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="dark:bg-slate-800">
              {NUMBERING_OPTIONS.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Remove button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onRemove(index)}
        disabled={!canRemove}
        className="p-1 mt-1 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-30"
      >
        <Trash2 className="w-4 h-4" />
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

export default function PathBuilder({ segments = [], onChange, rootPath = '/DWO' }) {
  const [localSegments, setLocalSegments] = useState([]);

  // Initialize segments
  useEffect(() => {
    if (segments && segments.length > 0) {
      // Ensure each segment has an id
      const withIds = segments.map((seg, idx) => ({
        ...seg,
        id: seg.id || `seg_init_${idx}_${Math.random().toString(36).substr(2, 9)}`,
      }));
      setLocalSegments(withIds);
    } else {
      // Start with one empty fixed segment
      setLocalSegments([createDefaultSegment('fixed')]);
    }
  }, []);

  // Notify parent of changes
  useEffect(() => {
    if (localSegments.length > 0) {
      // Remove internal ids before sending to parent
      const cleanSegments = localSegments.map(({ id, ...rest }) => rest);
      onChange(cleanSegments);
    }
  }, [localSegments]);

  const handleDragEnd = (result) => {
    if (!result.destination) return;

    const items = reorder(
      localSegments,
      result.source.index,
      result.destination.index
    );

    setLocalSegments(items);
  };

  const addSegment = (type = 'fixed') => {
    setLocalSegments([...localSegments, createDefaultSegment(type)]);
  };

  const updateSegment = (index, updated) => {
    const newSegments = [...localSegments];
    newSegments[index] = updated;
    setLocalSegments(newSegments);
  };

  const removeSegment = (index) => {
    if (localSegments.length > 1) {
      setLocalSegments(localSegments.filter((_, i) => i !== index));
    }
  };

  const previewPath = generatePreview(localSegments, rootPath);

  return (
    <div className="space-y-3">
      <Label className="text-sm">נתיב שמירה</Label>

      {/* Path Preview */}
      <div className="rounded-lg border dark:border-slate-700 overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 bg-slate-100 dark:bg-slate-800 border-b dark:border-slate-700">
          <FolderOpen className="w-4 h-4 text-amber-500" />
          <span className="text-sm font-medium text-slate-700 dark:text-slate-200 font-mono dir-ltr">
            {rootPath || '/'}
          </span>
        </div>

        {/* Preview with parts */}
        <div className="px-3 py-2.5 bg-blue-50 dark:bg-blue-950/40">
          <div className="flex items-center gap-2 flex-wrap" dir="ltr">
            {previewPath.split('/').filter(Boolean).map((part, i, arr) => {
              const isDynamic = part.includes('{');
              const hasNumber = part.includes('###');
              return (
                <React.Fragment key={i}>
                  <span
                    className={`text-xs font-mono px-1.5 py-0.5 rounded ${
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
                    <ChevronRight className="w-3 h-3 text-slate-400 flex-shrink-0" />
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
              className="space-y-2"
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
        onClick={() => addSegment('fixed')}
        className="w-full gap-2 dark:border-slate-600 dark:text-slate-200"
      >
        <Plus className="w-4 h-4" />
        הוסף שלב
      </Button>
    </div>
  );
}

// Export for use in other components
export { AVAILABLE_FIELDS, ALL_FIELDS, generatePreview };
