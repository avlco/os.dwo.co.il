import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useTranslation } from 'react-i18next';
import { useDateTimeSettings } from '../DateTimeSettingsProvider';
import {
  FileText,
  ExternalLink,
  Cloud,
  Loader2
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const DOC_TYPE_LABELS = {
  office_action: 'הודעה רשמית',
  response: 'תגובה',
  certificate: 'תעודה',
  correspondence: 'התכתבות',
  invoice: 'חשבונית',
  application: 'בקשה',
  assignment: 'הקצאה',
  license: 'רישיון',
  renewal_notice: 'הודעת חידוש',
  search_report: 'דוח חיפוש',
  other: 'אחר'
};

export function CaseDocuments({ caseId }) {
  const { i18n } = useTranslation();
  const isRTL = i18n.language === 'he';
  const { formatDateTime } = useDateTimeSettings();

  const { data: documents = [], isLoading } = useQuery({
    queryKey: ['case-documents', caseId],
    queryFn: () => base44.entities.Document.filter({ case_id: caseId }),
    enabled: !!caseId,
  });

  // Sort by date descending
  const sorted = [...documents].sort((a, b) => new Date(b.created_date) - new Date(a.created_date));

  if (isLoading) {
    return (
      <Card className="dark:bg-slate-800 dark:border-slate-700">
        <CardContent className="py-12 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="dark:bg-slate-800 dark:border-slate-700">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 dark:text-slate-200">
          <Cloud className="w-5 h-5 text-blue-500" />
          {isRTL ? 'מסמכים' : 'Documents'}
          {sorted.length > 0 && (
            <Badge variant="secondary" className="text-xs">{sorted.length}</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {sorted.length === 0 ? (
          <div className="text-center py-8">
            <FileText className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
            <p className="text-slate-500 dark:text-slate-400">
              {isRTL ? 'לא נמצאו מסמכים' : 'No documents found'}
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
              {isRTL ? 'מסמכים שיועלו ל-Dropbox דרך המערכת יופיעו כאן' : 'Documents uploaded to Dropbox via the system will appear here'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {sorted.map((doc) => (
              <div 
                key={doc.id}
                className="flex items-center gap-4 p-4 bg-slate-50 dark:bg-slate-900 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center flex-shrink-0">
                  <Cloud className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-800 dark:text-slate-200 truncate">
                    {doc.name || (isRTL ? 'מסמך' : 'Document')}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {doc.created_date && formatDateTime(doc.created_date)}
                    {doc.dropbox_path && <span className="mr-2 opacity-60"> · {doc.dropbox_path.split('/').pop()}</span>}
                  </p>
                </div>
                <Badge variant="outline" className="text-xs dark:border-slate-600">
                  {DOC_TYPE_LABELS[doc.type] || doc.type || 'מסמך'}
                </Badge>
                {doc.file_url && (
                  <a href={doc.file_url} target="_blank" rel="noopener noreferrer">
                    <Button variant="ghost" size="icon" className="dark:hover:bg-slate-700">
                      <ExternalLink className="w-4 h-4 text-slate-500" />
                    </Button>
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default CaseDocuments;
