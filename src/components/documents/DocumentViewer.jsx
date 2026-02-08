import React, { useState, useMemo } from 'react';
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
  FileSpreadsheet,
  Search,
  FolderOpen,
  ChevronDown,
  ChevronRight
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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

// Document Row Component
function DocumentRow({ doc, dateLocale, documentTypeLabels, onView, onOpenInDropbox }) {
  return (
    <div
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
          onClick={() => onView(doc)}
        >
          <Eye className="w-4 h-4 text-slate-500" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => onOpenInDropbox(doc)}
        >
          <ExternalLink className="w-4 h-4 text-slate-500" />
        </Button>
      </div>
    </div>
  );
}

// Main Component: Document List for Case or Client
export default function DocumentViewer({ caseId, clientId, showTitle = true }) {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language === 'he' ? he : enUS;
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [collapsedCases, setCollapsedCases] = useState({});

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

  const { data: documents = [], isLoading } = useQuery({
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

  // For client view - fetch related cases to show case numbers in groups
  const { data: cases = [] } = useQuery({
    queryKey: ['client-cases-for-docs', clientId],
    queryFn: () => base44.entities.Case.filter({ client_id: clientId }),
    enabled: !!clientId && !caseId,
  });

  // Get unique document types for filter
  const availableTypes = useMemo(() => {
    const types = new Set(documents.map(d => d.type).filter(Boolean));
    return Array.from(types);
  }, [documents]);

  // Filter documents
  const filteredDocuments = useMemo(() => {
    return documents.filter(doc => {
      const matchesSearch = !searchTerm ||
        doc.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        doc.dropbox_path?.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesType = filterType === 'all' || doc.type === filterType;

      return matchesSearch && matchesType;
    });
  }, [documents, searchTerm, filterType]);

  // Group by case for client view
  const groupedByCases = useMemo(() => {
    if (caseId || !clientId) return null;

    const groups = {};
    filteredDocuments.forEach(doc => {
      const key = doc.case_id || '_unassigned';
      if (!groups[key]) {
        const caseData = cases.find(c => c.id === doc.case_id);
        groups[key] = {
          caseId: doc.case_id,
          caseNumber: caseData?.case_number || '',
          caseTitle: caseData?.title || '',
          documents: []
        };
      }
      groups[key].documents.push(doc);
    });

    return Object.values(groups).sort((a, b) => {
      if (a.caseId === null) return 1;
      if (b.caseId === null) return -1;
      return (b.documents[0]?.created_date || '').localeCompare(a.documents[0]?.created_date || '');
    });
  }, [filteredDocuments, cases, caseId, clientId]);

  const toggleCase = (caseId) => {
    setCollapsedCases(prev => ({ ...prev, [caseId || '_unassigned']: !prev[caseId || '_unassigned'] }));
  };

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

  const showFilters = documents.length > 3;

  return (
    <>
      <Card className="dark:bg-slate-800 dark:border-slate-700">
        {showTitle && (
          <CardHeader>
            <CardTitle className="flex items-center gap-2 dark:text-slate-200">
              <Cloud className="w-5 h-5 text-blue-500" />
              {t('case_view.documents_tab')}
              {documents.length > 0 && (
                <Badge variant="secondary" className="mr-2">
                  {documents.length}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
        )}
        <CardContent>
          {/* Search & Filter Bar */}
          {showFilters && (
            <div className="flex gap-2 mb-4">
              <div className="relative flex-1">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder={t('common.search', 'Search') + '...'}
                  className="pr-10 h-9 dark:bg-slate-900 dark:border-slate-600"
                />
              </div>
              {availableTypes.length > 1 && (
                <Select value={filterType} onValueChange={setFilterType}>
                  <SelectTrigger className="w-40 h-9 dark:bg-slate-900 dark:border-slate-600">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="dark:bg-slate-800">
                    <SelectItem value="all">{t('document_taxonomy.all_levels', 'All')}</SelectItem>
                    {availableTypes.map(type => (
                      <SelectItem key={type} value={type}>
                        {documentTypeLabels[type] || type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {documents.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
              <p className="text-slate-500 dark:text-slate-400">
                {t('case_view.no_documents')}
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                {t('case_view.documents_hint')}
              </p>
            </div>
          ) : filteredDocuments.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-slate-500 dark:text-slate-400 text-sm">
                {t('common.no_results', 'No results found')}
              </p>
            </div>
          ) : groupedByCases ? (
            /* Client View - Grouped by Case */
            <div className="space-y-3">
              {groupedByCases.map(group => {
                const key = group.caseId || '_unassigned';
                const isCollapsed = collapsedCases[key];
                return (
                  <div key={key} className="border dark:border-slate-700 rounded-lg overflow-hidden">
                    <button
                      onClick={() => toggleCase(group.caseId)}
                      className="w-full flex items-center gap-2 px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors text-right"
                    >
                      {isCollapsed ? (
                        <ChevronRight className="w-4 h-4 text-slate-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      )}
                      <FolderOpen className="w-4 h-4 text-amber-500" />
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-200 flex-1 text-right">
                        {group.caseNumber
                          ? `${group.caseNumber}${group.caseTitle ? ` - ${group.caseTitle}` : ''}`
                          : t('documents.unassigned', 'Unassigned')
                        }
                      </span>
                      <Badge variant="secondary" className="text-[10px]">
                        {group.documents.length}
                      </Badge>
                    </button>
                    {!isCollapsed && (
                      <div className="p-2 space-y-1">
                        {group.documents.map(doc => (
                          <DocumentRow
                            key={doc.id}
                            doc={doc}
                            dateLocale={dateLocale}
                            documentTypeLabels={documentTypeLabels}
                            onView={handleViewDocument}
                            onOpenInDropbox={handleOpenInDropbox}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            /* Case View - Flat List */
            <div className="space-y-2">
              {filteredDocuments.map(doc => (
                <DocumentRow
                  key={doc.id}
                  doc={doc}
                  dateLocale={dateLocale}
                  documentTypeLabels={documentTypeLabels}
                  onView={handleViewDocument}
                  onOpenInDropbox={handleOpenInDropbox}
                />
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
