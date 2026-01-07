import React from 'react';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Mail, Paperclip, User, Calendar } from 'lucide-react';

export default function MailContent({ mail }) {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'he';

  if (!mail) {
    return (
      <Card className="h-full dark:bg-slate-800 dark:border-slate-700">
        <CardContent className="py-12 text-center">
          <Mail className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-4" />
          <p className="text-slate-400 dark:text-slate-500">
            {isRTL ? 'אין מייל מקושר למשימה זו' : 'No email linked to this task'}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full flex flex-col dark:bg-slate-800 dark:border-slate-700">
      <CardHeader className="border-b dark:border-slate-700 flex-shrink-0">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
            <Mail className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200 line-clamp-2">
              {mail.subject || (isRTL ? 'ללא נושא' : 'No subject')}
            </h2>
            <div className="flex items-center gap-2 mt-2">
              <User className="w-4 h-4 text-slate-400" />
              <span className="text-sm text-slate-600 dark:text-slate-400">
                {mail.sender_name || mail.sender_email}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <Calendar className="w-3 h-3 text-slate-400" />
              <span className="text-xs text-slate-500 dark:text-slate-500">
                {mail.received_at ? format(new Date(mail.received_at), 'dd/MM/yyyy HH:mm') : ''}
              </span>
            </div>
            {mail.recipients?.length > 0 && (
              <div className="flex items-start gap-2 mt-2">
                <span className="text-xs text-slate-500 dark:text-slate-500">
                  {isRTL ? 'אל:' : 'To:'}
                </span>
                <div className="flex flex-wrap gap-1">
                  {mail.recipients.slice(0, 3).map((r, idx) => (
                    <span key={idx} className="text-xs text-slate-600 dark:text-slate-400">
                      {r.email}{idx < Math.min(mail.recipients.length, 3) - 1 ? ',' : ''}
                    </span>
                  ))}
                  {mail.recipients.length > 3 && (
                    <span className="text-xs text-slate-500">+{mail.recipients.length - 3}</span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </CardHeader>

      {mail.attachments?.length > 0 && (
        <div className="p-4 border-b dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex-shrink-0">
          <div className="flex items-center gap-2 mb-3">
            <Paperclip className="w-4 h-4 text-slate-500 dark:text-slate-400" />
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              {mail.attachments.length} {isRTL ? 'קבצים מצורפים' : 'attachments'}
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {mail.attachments.map((att, idx) => (
              <a
                key={idx}
                href={att.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 p-2 bg-white dark:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-600 hover:border-blue-300 dark:hover:border-blue-500 transition-colors"
              >
                <Paperclip className="w-4 h-4 text-slate-400" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                    {att.filename}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {(att.size / 1024).toFixed(1)} KB
                  </p>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}

      <CardContent className="pt-6 flex-1 overflow-auto">
        <div 
          className="prose prose-sm max-w-none dark:prose-invert"
          dangerouslySetInnerHTML={{ 
            __html: mail.body_html || `<pre style="white-space: pre-wrap; font-family: inherit;">${mail.body_plain || ''}</pre>` 
          }}
        />
      </CardContent>
    </Card>
  );
}