import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { he, enUS } from 'date-fns/locale';
import {
  FileText,
  ExternalLink,
  Cloud,
  Loader2,
  Eye,
  Download,
  X,
  File,
  FileImage,
  FileSpreadsheet
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";

// Helper to get file icon based on mime type or extension
function getFileIcon(fileName, mimeType) {
  const ext = fileName?.split('.').pop()?.toLowerCase();
  
  if (mimeType?.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
    return <FileImage className="w-5 h-5 text-green-600" />;
  }
  if (mimeType?.includes('spreadsheet') || ['xlsx', 'xls', 'csv'].includes(ext)) {
    return <FileSpreadsheet className="w-5 h-5 text-emerald-600" />;
  }
  if (mimeType?.includes('pdf') || ext === 'pdf') {
    return <FileText className="w-5 h-5 text-red-600" />;
  }
  return <File className="w-5 h-5 text-blue-600" />;
}

// Helper to format file size
function formatFileSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Preview Modal Component
function DocumentPreviewModal({ document, isOpen, onClose }) {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language === 'he' ? he : enUS;
  const [isLoading, setIsLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [error, setError] = useState(null);

  const fileExt = document?.name?.split('.').pop()?.toLowerCase();
  const isPreviewable = ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'webp'].includes(fileExt);

  const handleGetUrl = async () => {
    if (document.file_url) {
      setPreviewUrl(document.file_url);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const response = await base44.functions.invoke('getSignedDropboxUrl', {
        document_id: document.id
      });
      if (response.data?.success) {
        setPreviewUrl(response.data.url);
      } else {
        throw new Error(response.data?.error || 'Failed to get URL');
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  };

  React.useEffect(() => {
    if (isOpen && document) {
      handleGetUrl();
    }
  }, [isOpen, document?.id]);

  const handleOpenInDropbox = () => {
    if (previewUrl) {
      window.open(previewUrl, '_blank');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl h-[85vh] flex flex-col dark:bg-slate-800 dark:border-slate-700">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-3 dark:text-slate-200">
            {getFileIcon(document?.name, document?.mime_type)}
            <span className="truncate">{document?.name}</span>
          </DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 min-h-0 overflow-hidden">
          {isLoading ? (
            <div className="h-full flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
            </div>
          ) : error ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-4">
              <FileText className="w-16 h-16 text-slate-300 mb-4" />
              <p className="text-slate-600 dark:text-slate-400 mb-2">{t('documents.load_error', 'Cannot load document')}</p>
              <p className="text-sm text-slate-400">{error}</p>
              <Button variant="outline" className="mt-4" onClick={handleGetUrl}>
                {t('mail_view.try_again')}
              </Button>
            </div>
          ) : previewUrl ? (
            isPreviewable ? (
              <iframe
                src={previewUrl.replace('dl=0', 'raw=1')}
                className="w-full h-full border-0 rounded-lg bg-slate-100 dark:bg-slate-900"
                title={document?.name}
              />
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center p-4">
                {getFileIcon(document?.name, document?.mime_type)}
                <p className="text-slate-600 dark:text-slate-400 mt-4 mb-2">
                  {t('documents.no_preview', 'Cannot display preview for this file type')}
                </p>
                <p className="text-sm text-slate-400 mb-4">{document?.name}</p>
              </div>
            )
          ) : null}
        </div>

        <div className="flex-shrink-0 flex justify-between items-center pt-4 border-t dark:border-slate-700">
          <div className="text-sm text-slate-500 dark:text-slate-400">
            {document?.file_size && <span>{formatFileSize(document.file_size)} • </span>}
            {document?.created_date && format(new Date(document.created_date), 'dd/MM/yyyy HH:mm', { locale: dateLocale })}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} className="dark:border-slate-600">
              {t('common.close')}
            </Button>
            {previewUrl && (
              <Button onClick={handleOpenInDropbox} className="gap-2 bg-blue-600 hover:bg-blue-700">
                <ExternalLink className="w-4 h-4" />
                {t('documents.open_in_dropbox', 'Open in Dropbox')}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Main Component: Document List for Case or Client
export default function DocumentViewer({ caseId, clientId, showTitle = true }) {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language === 'he' ? he : enUS;
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  
  const documentTypeLabels = {
    application: t('document_types.application', 'Application'),
    office_action: t('document_types.office_action', 'Office Action'),
    response: t('document_types.response', 'Response'),
    certificate: t('document_types.certificate', 'Certificate'),
    assignment: t('document_types.assignment', 'Assignment'),
    license: t('document_types.license', 'License'),
    correspondence: t('document_types.correspondence', 'Correspondence'),
    invoice: t('document_types.invoice', 'Invoice'),
    renewal_notice: t('document_types.renewal_notice', 'Renewal Notice'),
    search_report: t('document_types.search_report', 'Search Report'),
    other: t('automation_rules.other')
  };

  // Query for documents from Document entity
  const { data: documents = [], isLoading: documentsLoading } = useQuery({
    queryKey: ['documents', caseId, clientId],
    queryFn: async () => {
      let filter = {};
      if (caseId) {
        filter.case_id = caseId;
      } else if (clientId) {
        filter.client_id = clientId;
      }
      return base44.entities.Document.filter(filter, '-created_date');
    },
    enabled: !!(caseId || clientId),
  });

  // Also get documents from Task execution logs (legacy support)
  const { data: tasks = [], isLoading: tasksLoading } = useQuery({
    queryKey: ['tasks-docs', caseId, clientId],
    queryFn: async () => {
      let filter = {};
      if (caseId) {
        filter.case_id = caseId;
      } else if (clientId) {
        filter.client_id = clientId;
      }
      return base44.entities.Task.filter(filter);
    },
    enabled: !!(caseId || clientId),
  });

  // Extract documents from task execution logs
  const legacyDocuments = [];
  tasks.forEach(task => {
    const executionLog = task.extracted_data?.execution_log || [];
    executionLog.forEach(entry => {
      if (entry.status === 'success' && (entry.action_type === 'upload_to_dropbox' || entry.result_url)) {
        legacyDocuments.push({
          id: `legacy_${task.id}_${entry.executed_at}`,
          name: entry.details?.filename || task.title?.replace('עיבוד מייל: ', '') || 'מסמך',
          file_url: entry.result_url,
          dropbox_path: entry.details?.destination,
          created_date: entry.executed_at,
          type: 'other',
          source: 'legacy'
        });
      }
    });
  });

  // Combine and deduplicate
  const allDocuments = [...documents];
  legacyDocuments.forEach(legacyDoc => {
    // Check if already exists in documents by URL
    if (!documents.some(d => d.file_url === legacyDoc.file_url)) {
      allDocuments.push(legacyDoc);
    }
  });

  // Sort by date
  allDocuments.sort((a, b) => new Date(b.created_date) - new Date(a.created_date));

  const isLoading = documentsLoading || tasksLoading;

  const handleViewDocument = (doc) => {
    setSelectedDocument(doc);
    setPreviewOpen(true);
  };

  const handleOpenInDropbox = (doc) => {
    if (doc.file_url) {
      window.open(doc.file_url, '_blank');
    }
  };

  if (isLoading) {
    return (
      <Card className="dark:bg-slate-800 dark:border-slate-700">
        {showTitle && (
          <CardHeader>
            <Skeleton className="h-6 w-40" />
          </CardHeader>
        )}
        <CardContent className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="dark:bg-slate-800 dark:border-slate-700">
        {showTitle && (
          <CardHeader>
            <CardTitle className="flex items-center gap-2 dark:text-slate-200">
              <Cloud className="w-5 h-5 text-blue-500" />
              {t('case_view.documents_tab')}
              {allDocuments.length > 0 && (
                <Badge variant="secondary" className="mr-2">
                  {allDocuments.length}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
        )}
        <CardContent>
          {allDocuments.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
              <p className="text-slate-500 dark:text-slate-400">
                {t('case_view.no_documents')}
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                {t('case_view.documents_hint')}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {allDocuments.map((doc) => (
                <div 
                  key={doc.id}
                  className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-900 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors group"
                >
                  <div className="w-10 h-10 rounded-lg bg-white dark:bg-slate-800 border dark:border-slate-700 flex items-center justify-center flex-shrink-0">
                    {getFileIcon(doc.name, doc.mime_type)}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-800 dark:text-slate-200 truncate">
                      {doc.name}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      {doc.type && doc.type !== 'other' && (
                        <Badge variant="outline" className="text-[10px] h-4 px-1">
                          {documentTypeLabels[doc.type] || doc.type}
                        </Badge>
                      )}
                      {doc.created_date && (
                        <span>{format(new Date(doc.created_date), 'dd/MM/yyyy', { locale: dateLocale })}</span>
                      )}
                      {doc.file_size && (
                        <span>• {formatFileSize(doc.file_size)}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8"
                      onClick={() => handleViewDocument(doc)}
                      title={t('common.view')}
                    >
                      <Eye className="w-4 h-4 text-slate-500" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8"
                      onClick={() => handleOpenInDropbox(doc)}
                      title={t('documents.open_in_dropbox', 'Open in Dropbox')}
                    >
                      <ExternalLink className="w-4 h-4 text-slate-500" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Preview Modal */}
      {selectedDocument && (
        <DocumentPreviewModal
          document={selectedDocument}
          isOpen={previewOpen}
          onClose={() => {
            setPreviewOpen(false);
            setSelectedDocument(null);
          }}
        />
      )}
    </>
  );
}