import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from "sonner";
import { 
  Plus, 
  Edit, 
  Trash2, 
  FolderTree, 
  Copy,
  Star,
  StarOff,
  ChevronRight,
  Loader2,
  Settings2,
  AlertTriangle
} from 'lucide-react';
import TreeSchemaBuilder from './TreeSchemaBuilder';

export default function TreeSchemaManager() {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'he';
  const queryClient = useQueryClient();
  
  const [isBuilderOpen, setIsBuilderOpen] = useState(false);
  const [editingSchema, setEditingSchema] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  // Fetch all schemas
  const { data: schemas = [], isLoading } = useQuery({
    queryKey: ['folderTreeSchemas'],
    queryFn: () => base44.entities.FolderTreeSchema.list('-created_date'),
  });

  // Fetch automation rules to show usage count
  const { data: automationRules = [] } = useQuery({
    queryKey: ['automationRules'],
    queryFn: () => base44.entities.AutomationRule.list(),
  });

  // Count how many automation rules use each schema
  const getSchemaUsageCount = (schemaId) => {
    return automationRules.filter(rule => 
      rule.action_bundle?.save_file?.schema_id === schemaId
    ).length;
  };

  // Mutations
  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.FolderTreeSchema.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['folderTreeSchemas'] });
      toast.success('סכמה נוצרה בהצלחה');
      setIsBuilderOpen(false);
      setEditingSchema(null);
    },
    onError: (error) => {
      toast.error(`שגיאה ביצירה: ${error.message}`);
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.FolderTreeSchema.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['folderTreeSchemas'] });
      toast.success('סכמה עודכנה בהצלחה');
      setIsBuilderOpen(false);
      setEditingSchema(null);
    },
    onError: (error) => {
      toast.error(`שגיאה בעדכון: ${error.message}`);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.FolderTreeSchema.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['folderTreeSchemas'] });
      toast.success('סכמה נמחקה בהצלחה');
      setDeleteConfirmId(null);
    },
    onError: (error) => {
      toast.error(`שגיאה במחיקה: ${error.message}`);
    }
  });

  // Handlers
  const handleCreateNew = () => {
    setEditingSchema(null);
    setIsBuilderOpen(true);
  };

  const handleEdit = (schema) => {
    setEditingSchema(schema);
    setIsBuilderOpen(true);
  };

  const handleDuplicate = (schema) => {
    const { id, created_date, updated_date, created_by, ...schemaData } = schema;
    const duplicatedSchema = {
      ...schemaData,
      name: `${schemaData.name} (העתק)`,
      is_default: false,
    };
    createMutation.mutate(duplicatedSchema);
  };

  const handleToggleActive = (schema) => {
    updateMutation.mutate({
      id: schema.id,
      data: { is_active: !schema.is_active }
    });
  };

  const handleSetDefault = (schema) => {
    // First, unset any existing default
    const currentDefault = schemas.find(s => s.is_default && s.id !== schema.id);
    if (currentDefault) {
      updateMutation.mutate({
        id: currentDefault.id,
        data: { is_default: false }
      });
    }
    // Then set this one as default
    updateMutation.mutate({
      id: schema.id,
      data: { is_default: true }
    });
  };

  const handleDelete = (schemaId) => {
    const usageCount = getSchemaUsageCount(schemaId);
    if (usageCount > 0) {
      toast.error(`לא ניתן למחוק סכמה המשמשת ${usageCount} אוטומציות`);
      return;
    }
    setDeleteConfirmId(schemaId);
  };

  const handleSaveSchema = (schemaData) => {
    if (editingSchema?.id) {
      updateMutation.mutate({ id: editingSchema.id, data: schemaData });
    } else {
      createMutation.mutate(schemaData);
    }
  };

  // Generate preview path from levels
  const generatePreviewPath = (schema) => {
    if (!schema?.levels?.length) return '/...';

    const parts = [];
    if (schema.root_path) {
      parts.push(schema.root_path.replace(/^\/+|\/+$/g, ''));
    }

    const sortedLevels = [...schema.levels].sort((a, b) => (a.order || 0) - (b.order || 0));

    for (const level of sortedLevels) {
      let folderName = '';
      const numType = level.numbering?.type || 'none';
      const numPos = level.numbering?.position || 'prefix';
      const sep = level.separator || ' - ';

      // Build base name
      if (level.type === 'dynamic') {
        folderName = `[${level.label || level.key}]`;
      } else if (level.type === 'static') {
        const val = level.values?.[0];
        const firstVal = typeof val === 'string' ? val : val?.name || val?.code;
        if (level.values?.length === 1 && firstVal) {
          folderName = firstVal;
        } else {
          folderName = `<${level.label || level.key}>`;
        }
      } else if (level.type === 'list' || level.type === 'pool') {
        folderName = `<${level.label || level.key}>`;
      }

      // Add numbering
      if (numType !== 'none') {
        const numInd = numType === 'chronological' ? '###' : '#';
        folderName = numPos === 'prefix' ? `${numInd}${sep}${folderName}` : `${folderName}${sep}${numInd}`;
      }

      parts.push(folderName);
    }

    return '/' + parts.join('/');
  };

  const getScopeLabel = (scope) => {
    switch (scope) {
      case 'global': return 'גלובלי';
      case 'department': return 'מחלקה';
      case 'user': return 'משתמש';
      default: return scope;
    }
  };

  if (isLoading) {
    return (
      <Card className="dark:bg-slate-800 dark:border-slate-700">
        <CardContent className="p-6 text-center">
          <Loader2 className="w-6 h-6 animate-spin mx-auto" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="dark:bg-slate-800 dark:border-slate-700">
        <CardHeader className="flex flex-row items-start justify-between pb-3">
          <div>
            <CardTitle className="text-xl dark:text-slate-100 flex items-center gap-2">
              <FolderTree className="w-5 h-5" />
              מבנה תיקיות
            </CardTitle>
            <CardDescription className="dark:text-slate-400 mt-1">
              הגדר מבני תיקיות חכמים לשמירת מסמכים ב-Dropbox
            </CardDescription>
          </div>
          <Button onClick={handleCreateNew} className="gap-2">
            <Plus className="w-4 h-4" />
            סכמה חדשה
          </Button>
        </CardHeader>
        
        <CardContent>
          {/* Statistics */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <div className="flex items-center gap-2 mb-1">
                <FolderTree className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span className="text-sm font-medium text-blue-800 dark:text-blue-200">סה"כ סכמות</span>
              </div>
              <div className="text-2xl font-bold text-blue-900 dark:text-blue-100">{schemas.length}</div>
            </div>
            <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
              <div className="flex items-center gap-2 mb-1">
                <Star className="w-4 h-4 text-green-600 dark:text-green-400" />
                <span className="text-sm font-medium text-green-800 dark:text-green-200">פעילות</span>
              </div>
              <div className="text-2xl font-bold text-green-900 dark:text-green-100">
                {schemas.filter(s => s.is_active).length}
              </div>
            </div>
            <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
              <div className="flex items-center gap-2 mb-1">
                <Settings2 className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                <span className="text-sm font-medium text-purple-800 dark:text-purple-200">בשימוש</span>
              </div>
              <div className="text-2xl font-bold text-purple-900 dark:text-purple-100">
                {schemas.filter(s => getSchemaUsageCount(s.id) > 0).length}
              </div>
            </div>
          </div>

          {/* Schemas List */}
          <div className="divide-y dark:divide-slate-700">
            {schemas.length === 0 ? (
              <div className="text-center py-12 text-slate-500 dark:text-slate-400">
                <FolderTree className="w-12 h-12 mx-auto mb-4 text-slate-300 dark:text-slate-600" />
                <p className="mb-4">אין סכמות מוגדרות עדיין</p>
                <Button onClick={handleCreateNew} variant="outline">
                  <Plus className="w-4 h-4 ml-2" />
                  צור סכמה ראשונה
                </Button>
              </div>
            ) : (
              schemas.map((schema) => {
                const usageCount = getSchemaUsageCount(schema.id);
                
                return (
                  <div key={schema.id} className="flex items-center gap-4 py-4 hover:bg-slate-50 dark:hover:bg-slate-700/50 px-2 -mx-2 rounded">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium dark:text-slate-200">{schema.name}</span>
                        {schema.is_default && (
                          <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                            <Star className="w-3 h-3 ml-1" />
                            ברירת מחדל
                          </Badge>
                        )}
                        {!schema.is_active && (
                          <Badge variant="secondary" className="text-xs">לא פעיל</Badge>
                        )}
                        <Badge variant="outline" className="text-xs">
                          {getScopeLabel(schema.scope)}
                        </Badge>
                      </div>
                      
                      {schema.description && (
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">
                          {schema.description}
                        </p>
                      )}
                      
                      <div className="flex items-center gap-4 text-xs text-slate-400">
                        <span className="font-mono dir-ltr">
                          {generatePreviewPath(schema)}
                        </span>
                        <span className="flex items-center gap-1">
                          <ChevronRight className="w-3 h-3" />
                          {schema.levels?.length || 0} רמות
                        </span>
                        {usageCount > 0 && (
                          <span className="text-blue-500">
                            {usageCount} אוטומציות
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <Switch 
                        checked={schema.is_active} 
                        onCheckedChange={() => handleToggleActive(schema)}
                      />
                      
                      {!schema.is_default && (
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => handleSetDefault(schema)}
                          title="הגדר כברירת מחדל"
                        >
                          <StarOff className="w-4 h-4 text-slate-400" />
                        </Button>
                      )}
                      
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(schema)} title="ערוך">
                        <Edit className="w-4 h-4" />
                      </Button>
                      
                      <Button variant="ghost" size="icon" onClick={() => handleDuplicate(schema)} title="שכפל">
                        <Copy className="w-4 h-4" />
                      </Button>
                      
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                        onClick={() => handleDelete(schema.id)}
                        disabled={usageCount > 0}
                        title={usageCount > 0 ? 'לא ניתן למחוק - בשימוש' : 'מחק'}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>

      {/* Schema Builder Dialog */}
      <Dialog open={isBuilderOpen} onOpenChange={setIsBuilderOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto dark:bg-slate-800">
          <DialogHeader>
            <DialogTitle className="dark:text-slate-100">
              {editingSchema ? 'עריכת סכמה' : 'סכמה חדשה'}
            </DialogTitle>
          </DialogHeader>
          
          <TreeSchemaBuilder
            initialSchema={editingSchema}
            onSave={handleSaveSchema}
            onCancel={() => setIsBuilderOpen(false)}
            isSaving={createMutation.isPending || updateMutation.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirmId} onOpenChange={() => setDeleteConfirmId(null)}>
        <DialogContent className="max-w-md dark:bg-slate-800">
          <DialogHeader>
            <DialogTitle className="dark:text-slate-100 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              אישור מחיקה
            </DialogTitle>
          </DialogHeader>
          <p className="text-slate-600 dark:text-slate-400">
            האם למחוק את הסכמה? פעולה זו אינה ניתנת לביטול.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>
              ביטול
            </Button>
            <Button 
              variant="destructive" 
              onClick={() => deleteMutation.mutate(deleteConfirmId)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'מחק'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}