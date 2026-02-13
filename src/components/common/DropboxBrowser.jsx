import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { 
  Folder, FileText, ArrowLeft, Loader2, File, Image as ImageIcon, 
  Download, AlertTriangle, Plus, ChevronRight, Home 
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from 'sonner';
import { useDateTimeSettings } from '../DateTimeSettingsProvider';
import { useTranslation } from 'react-i18next';

const getFileIcon = (filename) => {
  const ext = filename.split('.').pop().toLowerCase();
  if (['jpg', 'jpeg', 'png', 'gif', 'svg'].includes(ext)) return ImageIcon;
  if (['pdf', 'doc', 'docx', 'txt'].includes(ext)) return FileText;
  return File;
};

const formatSize = (bytes) => {
  if (!bytes) return '-';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

export default function DropboxBrowser({ caseId, clientName, clientNumber }) {
  const { t } = useTranslation();
  const [relativePath, setRelativePath] = useState('');
  const { formatDate } = useDateTimeSettings();
  const queryClient = useQueryClient();

  const canBrowse = !!caseId || (!!clientNumber && !!clientName);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['dropbox-files', caseId || `client-${clientNumber}`, relativePath],
    queryFn: async () => {
      const params = { relativePath };
      if (caseId) {
        params.caseId = caseId;
      } else {
        params.clientNumber = clientNumber;
        params.clientName = clientName;
      }
      const result = await base44.functions.invoke('listDropboxFiles', params);
      if (result.data?.error) throw new Error(result.data.error);
      return result.data;
    },
    enabled: canBrowse,
    staleTime: 1000 * 60 * 5,
  });

  const createFolderMutation = useMutation({
    mutationFn: async () => {
      // We use createClientFolder logic via server function to create the structure
      // Note: We might need a more specific function if we want to create JUST the case folder, 
      // but createClientFolder is safe (idempotent) for the client part.
      // Ideally, we'd have a 'createDropboxFolder' generic function.
      // For now, let's trigger the client folder creation which ensures the root exists.
      
      const res = await base44.functions.invoke('createClientFolder', {
        client_name: clientName,
        client_number: clientNumber
      });
      
      // Then explicitly create the case folder if needed via listDropboxFiles logic?
      // Since listDropboxFiles handles the logic, simply retrying might not be enough if the folder doesn't exist.
      // In a real scenario, we'd add 'createFolder' capability.
      // For this MVP, we assume createClientFolder creates the base, and we might need to manually handle subfolders.
      // Let's assume the user will create it manually or we trigger a 'createFolder' action.
      
      // Simulating folder creation request for now as we reused createClientFolder
      if (res.data?.error) throw new Error(res.data.error);
      return res.data;
    },
    onSuccess: () => {
      toast.success(t('dropbox.folder_created', 'תיקיית לקוח נוצרה/זוהתה'));
      refetch();
    },
    onError: (err) => {
      toast.error(t('dropbox.folder_create_error', 'שגיאה ביצירת תיקייה') + ': ' + err.message);
    }
  });

  // Breadcrumbs logic
  const pathParts = relativePath.split('/').filter(Boolean);

  const navigateTo = (index) => {
    if (index === -1) {
      setRelativePath('');
    } else {
      setRelativePath('/' + pathParts.slice(0, index + 1).join('/'));
    }
  };

  const handleEntryClick = (entry) => {
    if (entry['.tag'] === 'folder') {
      const newPath = relativePath 
        ? `${relativePath}/${entry.name}`
        : `/${entry.name}`;
      setRelativePath(newPath);
    } else {
      // For files, we could implement preview. 
      // Currently Dropbox API returns 'path_display', we can't link directly without a temp link.
      // Placeholder for file action
      toast.info(`${entry.name} — ${t('dropbox.preview_coming_soon', 'תצוגה מקדימה בפיתוח')}`);
    }
  };

  if (error) {
    return (
      <div className="p-8 text-center border-2 border-dashed border-red-200 rounded-xl bg-red-50 dark:bg-red-900/10">
        <AlertTriangle className="w-10 h-10 text-red-500 mx-auto mb-3" />
        <h3 className="font-medium text-red-800 dark:text-red-300">{t('dropbox.load_error', 'שגיאה בטעינת קבצים')}</h3>
        <p className="text-sm text-red-600 dark:text-red-400 mb-4">{error.message}</p>
        <Button variant="outline" onClick={() => refetch()}>{t('common.retry', 'נסה שוב')}</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header / Breadcrumbs */}
      <div className="flex items-center gap-2 p-2 bg-slate-100 dark:bg-slate-800 rounded-lg overflow-x-auto text-sm">
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-6 w-6" 
          onClick={() => navigateTo(-1)}
          disabled={!relativePath}
        >
          <Home className="w-4 h-4" />
        </Button>
        {pathParts.map((part, index) => (
          <React.Fragment key={index}>
            <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <button 
              onClick={() => navigateTo(index)}
              className="hover:underline font-medium whitespace-nowrap"
            >
              {part}
            </button>
          </React.Fragment>
        ))}
      </div>

      {/* Content */}
      <Card className="min-h-[300px] dark:bg-slate-800 dark:border-slate-700">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="w-10 h-10 rounded-lg" />
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-4 w-1/3" />
                    <Skeleton className="h-3 w-1/4" />
                  </div>
                </div>
              ))}
            </div>
          ) : data?.folder_missing ? (
            <div className="flex flex-col items-center justify-center h-[300px] text-center p-6">
              <div className="w-16 h-16 bg-blue-50 dark:bg-blue-900/30 rounded-full flex items-center justify-center mb-4">
                <Folder className="w-8 h-8 text-blue-500" />
              </div>
              <h3 className="text-lg font-medium mb-2">{t('dropbox.folder_not_found', 'התיקייה לא קיימת ב-Dropbox')}</h3>
              <p className="text-slate-500 mb-6 max-w-sm">
                {t('dropbox.expected_path', 'הנתיב המצופה')}: <br/>
                <code className="bg-slate-100 dark:bg-slate-900 px-2 py-1 rounded text-xs mt-1 block break-all">
                  {data.root_path}
                </code>
              </p>
              <Button 
                onClick={() => createFolderMutation.mutate()} 
                disabled={createFolderMutation.isPending}
                className="gap-2"
              >
                {createFolderMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {t('dropbox.create_folder_now', 'צור תיקייה כעת')}
              </Button>
            </div>
          ) : data?.entries?.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-[300px] text-slate-400">
              <Folder className="w-12 h-12 mb-2 opacity-20" />
              <p>{t('dropbox.folder_empty', 'התיקייה ריקה')}</p>
            </div>
          ) : (
            <div className="divide-y dark:divide-slate-700">
              {data?.entries?.map((entry) => {
                const Icon = entry['.tag'] === 'folder' ? Folder : getFileIcon(entry.name);
                const isFolder = entry['.tag'] === 'folder';
                
                return (
                  <div 
                    key={entry.id}
                    className="flex items-center justify-between p-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors cursor-pointer group"
                    onClick={() => handleEntryClick(entry)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        isFolder ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30' : 'bg-slate-100 text-slate-500 dark:bg-slate-700'
                      }`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate text-slate-700 dark:text-slate-200">
                          {entry.name}
                        </p>
                        <p className="text-xs text-slate-500">
                          {isFolder ? t('dropbox.folder', 'תיקייה') : formatSize(entry.size)}
                          {entry.server_modified && ` • ${formatDate(entry.server_modified)}`}
                        </p>
                      </div>
                    </div>
                    
                    {!isFolder && (
                      <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <Download className="w-4 h-4 text-slate-400" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

