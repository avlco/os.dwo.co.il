import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from "sonner";
import { 
  Plus, 
  Edit, 
  Trash2, 
  FolderTree, 
  Globe, 
  FileText, 
  ChevronRight,
  GripVertical,
  Search,
  Filter
} from 'lucide-react';

const LEVEL_CONFIG = {
  domain: { 
    label: 'תחום', 
    labelEn: 'Domain',
    icon: FolderTree, 
    color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    description: 'תחום ראשי (פטנטים, סימני מסחר וכו\')'
  },
  country: { 
    label: 'מדינה', 
    labelEn: 'Country',
    icon: Globe, 
    color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    description: 'מדינה או טריטוריה'
  },
  document_type: { 
    label: 'סוג מסמך', 
    labelEn: 'Document Type',
    icon: FileText, 
    color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
    description: 'סוג המסמך (בקשה, תעודה וכו\')'
  }
};

const defaultTaxonomyItem = {
  level: 'domain',
  name: '',
  name_en: '',
  code: '',
  parent_id: '',
  sort_order: 0,
  is_active: true,
  metadata: { color: '', icon: '' }
};

export default function DocumentTaxonomyManager() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [currentItem, setCurrentItem] = useState(defaultTaxonomyItem);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterLevel, setFilterLevel] = useState('all');

  const { data: taxonomyItems = [], isLoading } = useQuery({
    queryKey: ['documentTaxonomy'],
    queryFn: () => base44.entities.DocumentTaxonomy.list('sort_order'),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.DocumentTaxonomy.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['documentTaxonomy']);
      toast.success('פריט נוסף בהצלחה');
      setIsEditModalOpen(false);
    },
    onError: (error) => {
      toast.error(`שגיאה ביצירה: ${error.message}`);
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.DocumentTaxonomy.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['documentTaxonomy']);
      toast.success('פריט עודכן בהצלחה');
      setIsEditModalOpen(false);
    },
    onError: (error) => {
      toast.error(`שגיאה בעדכון: ${error.message}`);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.DocumentTaxonomy.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['documentTaxonomy']);
      toast.success('פריט נמחק בהצלחה');
    },
    onError: (error) => {
      toast.error(`שגיאה במחיקה: ${error.message}`);
    }
  });

  const openEdit = (item = null) => {
    if (item) {
      setCurrentItem({ ...defaultTaxonomyItem, ...item });
    } else {
      setCurrentItem({ ...defaultTaxonomyItem });
    }
    setIsEditModalOpen(true);
  };

  const handleSave = () => {
    if (!currentItem.name || !currentItem.code) {
      toast.error('יש למלא שם וקוד');
      return;
    }

    const data = { ...currentItem };
    if (!data.parent_id) delete data.parent_id;

    if (currentItem.id) {
      updateMutation.mutate({ id: currentItem.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleDelete = (id) => {
    if (window.confirm('האם למחוק פריט זה?')) {
      deleteMutation.mutate(id);
    }
  };

  const toggleActive = (item) => {
    updateMutation.mutate({ 
      id: item.id, 
      data: { is_active: !item.is_active } 
    });
  };

  // Build hierarchy tree
  const buildTree = () => {
    const domains = taxonomyItems.filter(i => i.level === 'domain');
    const countries = taxonomyItems.filter(i => i.level === 'country');
    const documentTypes = taxonomyItems.filter(i => i.level === 'document_type');
    
    return { domains, countries, documentTypes };
  };

  // Filter items
  const filteredItems = taxonomyItems.filter(item => {
    const matchesSearch = !searchTerm || 
      item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.name_en?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.code.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesLevel = filterLevel === 'all' || item.level === filterLevel;
    
    return matchesSearch && matchesLevel;
  });

  // Get parent options based on current level
  const getParentOptions = () => {
    if (currentItem.level === 'domain') return [];
    if (currentItem.level === 'country') {
      return taxonomyItems.filter(i => i.level === 'domain');
    }
    if (currentItem.level === 'document_type') {
      return taxonomyItems.filter(i => i.level === 'domain');
    }
    return [];
  };

  const getParentName = (parentId) => {
    const parent = taxonomyItems.find(i => i.id === parentId);
    return parent ? parent.name : '';
  };

  const { domains, countries, documentTypes } = buildTree();

  if (isLoading) {
    return (
      <Card className="dark:bg-slate-800 dark:border-slate-700">
        <CardContent className="p-6 text-center">
          <div className="animate-pulse">טוען...</div>
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
              {t('document_taxonomy.title')}
            </CardTitle>
            <CardDescription className="dark:text-slate-400 mt-1">
              {t('document_taxonomy.description', 'Define the smart folder structure for saving documents in Dropbox')}
            </CardDescription>
          </div>
          <Button onClick={() => openEdit()} className="gap-2">
            <Plus className="w-4 h-4" />
            {t('document_taxonomy.add_new')}
          </Button>
        </CardHeader>
        
        <CardContent>
          {/* Filters */}
          <div className="flex gap-3 mb-6">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="חיפוש..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pr-10 dark:bg-slate-900 dark:border-slate-600"
              />
            </div>
            <Select value={filterLevel} onValueChange={setFilterLevel}>
            <SelectTrigger className="w-40 dark:bg-slate-900 dark:border-slate-600">
              <Filter className="w-4 h-4 ml-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="dark:bg-slate-800">
              <SelectItem value="all">{t('document_taxonomy.all_levels', 'All Levels')}</SelectItem>
              <SelectItem value="domain">{t('document_taxonomy.domain')}</SelectItem>
              <SelectItem value="country">{t('document_taxonomy.country')}</SelectItem>
              <SelectItem value="document_type">{t('document_taxonomy.document_type')}</SelectItem>
            </SelectContent>
            </Select>
          </div>

          {/* Statistics */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <div className="flex items-center gap-2 mb-1">
                <FolderTree className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span className="text-sm font-medium text-blue-800 dark:text-blue-200">{t('document_taxonomy.domain')}</span>
              </div>
              <div className="text-2xl font-bold text-blue-900 dark:text-blue-100">{domains.length}</div>
            </div>
            <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
              <div className="flex items-center gap-2 mb-1">
                <Globe className="w-4 h-4 text-green-600 dark:text-green-400" />
                <span className="text-sm font-medium text-green-800 dark:text-green-200">{t('document_taxonomy.country')}</span>
              </div>
              <div className="text-2xl font-bold text-green-900 dark:text-green-100">{countries.length}</div>
            </div>
            <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
              <div className="flex items-center gap-2 mb-1">
                <FileText className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                <span className="text-sm font-medium text-purple-800 dark:text-purple-200">{t('document_taxonomy.document_type')}</span>
              </div>
              <div className="text-2xl font-bold text-purple-900 dark:text-purple-100">{documentTypes.length}</div>
            </div>
          </div>

          {/* Items List */}
          <div className="divide-y dark:divide-slate-700">
            {filteredItems.length === 0 ? (
              <div className="text-center py-12 text-slate-500 dark:text-slate-400">
                {searchTerm || filterLevel !== 'all' 
                  ? 'לא נמצאו פריטים התואמים את החיפוש'
                  : 'אין פריטים בטקסונומיה. לחץ "הוסף פריט" להתחיל.'}
              </div>
            ) : (
              filteredItems.map((item) => {
                const config = LEVEL_CONFIG[item.level];
                const Icon = config.icon;
                
                return (
                  <div key={item.id} className="flex items-center gap-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 px-2 -mx-2 rounded">
                    <GripVertical className="w-4 h-4 text-slate-300 dark:text-slate-600 cursor-grab" />
                    
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Badge className={config.color}>
                          <Icon className="w-3 h-3 ml-1" />
                          {config.label}
                        </Badge>
                        <span className="font-medium dark:text-slate-200">{item.name}</span>
                        {item.name_en && (
                          <span className="text-sm text-slate-500 dark:text-slate-400">({item.name_en})</span>
                        )}
                        <code className="text-xs bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded text-slate-600 dark:text-slate-300">
                          {item.code}
                        </code>
                        {!item.is_active && (
                          <Badge variant="secondary" className="text-xs">לא פעיל</Badge>
                        )}
                      </div>
                      {item.parent_id && (
                        <div className="text-sm text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-1">
                          <ChevronRight className="w-3 h-3" />
                          שייך ל: {getParentName(item.parent_id)}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      <Switch 
                        checked={item.is_active} 
                        onCheckedChange={() => toggleActive(item)}
                      />
                      <Button variant="ghost" size="icon" onClick={() => openEdit(item)}>
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                        onClick={() => handleDelete(item.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Path Preview */}
          {domains.length > 0 && (
            <div className="mt-6 p-4 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700">
              <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">תצוגה מקדימה של מבנה התיקיות:</h4>
              <div className="text-sm text-slate-600 dark:text-slate-400 font-mono">
                <code>/Clients/[שם לקוח]/[תחום]/[מדינה]/[סוג מסמך]/[קובץ]</code>
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-500 mt-2">
                לדוגמה: /Clients/אינטל/Patents/Israel/Applications/IL-2024-001.pdf
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Modal */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="max-w-md dark:bg-slate-800">
          <DialogHeader>
            <DialogTitle className="dark:text-slate-100">
              {currentItem.id ? t('common.edit') : t('document_taxonomy.add_new')}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label className="dark:text-slate-300">רמה</Label>
              <Select 
                value={currentItem.level} 
                onValueChange={(v) => setCurrentItem({ ...currentItem, level: v, parent_id: '' })}
              >
                <SelectTrigger className="dark:bg-slate-900 dark:border-slate-600">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="dark:bg-slate-800">
                  {Object.entries(LEVEL_CONFIG).map(([key, config]) => (
                    <SelectItem key={key} value={key} className="dark:text-slate-200">
                      <span className="flex items-center gap-2">
                        <config.icon className="w-4 h-4" />
                        {config.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {LEVEL_CONFIG[currentItem.level].description}
              </p>
            </div>

            <div>
              <Label className="dark:text-slate-300">שם (עברית) *</Label>
              <Input
                value={currentItem.name}
                onChange={(e) => setCurrentItem({ ...currentItem, name: e.target.value })}
                placeholder="למשל: פטנטים"
                className="dark:bg-slate-900 dark:border-slate-600"
              />
            </div>

            <div>
              <Label className="dark:text-slate-300">שם (אנגלית)</Label>
              <Input
                value={currentItem.name_en || ''}
                onChange={(e) => setCurrentItem({ ...currentItem, name_en: e.target.value })}
                placeholder="e.g. Patents"
                className="dark:bg-slate-900 dark:border-slate-600"
              />
            </div>

            <div>
              <Label className="dark:text-slate-300">קוד קצר *</Label>
              <Input
                value={currentItem.code}
                onChange={(e) => setCurrentItem({ ...currentItem, code: e.target.value.toUpperCase() })}
                placeholder="למשל: PAT"
                maxLength={10}
                className="dark:bg-slate-900 dark:border-slate-600 font-mono"
              />
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                קוד קצר לשימוש בנתיבים (עד 10 תווים)
              </p>
            </div>

            {getParentOptions().length > 0 && (
              <div>
                <Label className="dark:text-slate-300">שייך לתחום</Label>
                <Select 
                  value={currentItem.parent_id || ''} 
                  onValueChange={(v) => setCurrentItem({ ...currentItem, parent_id: v })}
                >
                  <SelectTrigger className="dark:bg-slate-900 dark:border-slate-600">
                    <SelectValue placeholder="בחר תחום (אופציונלי)" />
                  </SelectTrigger>
                  <SelectContent className="dark:bg-slate-800">
                    <SelectItem value={null} className="dark:text-slate-200">ללא</SelectItem>
                    {getParentOptions().map((parent) => (
                      <SelectItem key={parent.id} value={parent.id} className="dark:text-slate-200">
                        {parent.name} ({parent.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <Label className="dark:text-slate-300">סדר מיון</Label>
              <Input
                type="number"
                value={currentItem.sort_order}
                onChange={(e) => setCurrentItem({ ...currentItem, sort_order: parseInt(e.target.value) || 0 })}
                className="dark:bg-slate-900 dark:border-slate-600"
              />
            </div>

            <div className="flex items-center gap-2">
              <Switch
                checked={currentItem.is_active}
                onCheckedChange={(c) => setCurrentItem({ ...currentItem, is_active: c })}
              />
              <Label className="dark:text-slate-300">פעיל</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditModalOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleSave}>
              {currentItem.id ? t('common.update') : t('common.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}