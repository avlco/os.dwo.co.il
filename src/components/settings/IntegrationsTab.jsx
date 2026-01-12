import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Power, ExternalLink, Loader2, CheckCircle2, XCircle, FileSpreadsheet, Save } from 'lucide-react';

export default function IntegrationsTab({ user }) {
  const { t } = useTranslation();
  const [connectionStatus, setConnectionStatus] = useState({ google: null, dropbox: null });
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(null);
  const [spreadsheetId, setSpreadsheetId] = useState('');
  const [savingSpreadsheet, setSavingSpreadsheet] = useState(false);

  useEffect(() => {
    loadConnectionStatus();
    handleOAuthCallback();
  }, []);

  const loadConnectionStatus = async () => {
    try {
      const response = await base44.functions.invoke('integrationAuth', { action: 'getStatus' });
      setConnectionStatus(response.data);
      if (response.data.google?.spreadsheet_id) {
        setSpreadsheetId(response.data.google.spreadsheet_id);
      }
    } catch (e) {
      console.error('Error loading connection status:', e);
    } finally {
      setLoading(false);
    }
  };

  const saveSpreadsheetId = async () => {
    if (!spreadsheetId.trim()) {
      toast.error('נא להזין מזהה גיליון');
      return;
    }
    
    setSavingSpreadsheet(true);
    try {
      await base44.functions.invoke('integrationAuth', {
        action: 'updateMetadata',
        provider: 'google',
        metadata: { spreadsheet_id: spreadsheetId.trim() }
      });
      toast.success('מזהה הגיליון נשמר בהצלחה');
    } catch (error) {
      toast.error(`שגיאה בשמירה: ${error.message}`);
    } finally {
      setSavingSpreadsheet(false);
    }
  };

  const handleOAuthCallback = async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const stateParam = urlParams.get('state');

    if (code && stateParam) {
      try {
        const state = JSON.parse(stateParam);
        const provider = state.provider;

        // Clear URL params
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.delete('code');
        newUrl.searchParams.delete('state');
        newUrl.searchParams.delete('scope');
        window.history.replaceState({}, document.title, newUrl.toString());

        setConnecting(provider);
        toast.info(`מחבר ${provider === 'google' ? 'Google' : 'Dropbox'}...`);

        const response = await base44.functions.invoke('integrationAuth', {
          action: 'handleCallback',
          provider,
          code,
        });

        if (response.data.success) {
          toast.success(`${provider === 'google' ? 'Google Workspace' : 'Dropbox'} חובר בהצלחה!`);
          loadConnectionStatus();
        }
      } catch (error) {
        toast.error(`שגיאה בחיבור: ${error.message}`);
      } finally {
        setConnecting(null);
      }
    }
  };

  const initiateOAuth = async (provider) => {
    try {
      setConnecting(provider);
      const response = await base44.functions.invoke('integrationAuth', {
        action: 'getAuthUrl',
        provider,
      });
      window.location.href = response.data.authUrl;
    } catch (error) {
      toast.error(`שגיאה בהתחלת חיבור: ${error.message}`);
      setConnecting(null);
    }
  };

  const disconnect = async (provider) => {
    try {
      setConnecting(provider);
      await base44.functions.invoke('integrationAuth', {
        action: 'disconnect',
        provider,
      });
      toast.success('החיבור נותק בהצלחה');
      setConnectionStatus(prev => ({ ...prev, [provider]: null }));
    } catch (error) {
      toast.error(`שגיאה בניתוק: ${error.message}`);
    } finally {
      setConnecting(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Google Workspace */}
      <Card className="dark:bg-slate-800 dark:border-slate-700">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-white border flex items-center justify-center">
                <svg viewBox="0 0 24 24" className="w-6 h-6">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
              </div>
              <div>
                <CardTitle className="text-lg dark:text-slate-100">Google Workspace</CardTitle>
                <CardDescription>Gmail, Calendar, Drive, Sheets</CardDescription>
              </div>
            </div>
            {connectionStatus.google?.connected && (
              <Badge variant="outline" className="gap-1 text-green-600 border-green-200 bg-green-50 dark:bg-green-900/20 dark:border-green-800">
                <CheckCircle2 className="w-3 h-3" /> מחובר
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {connectionStatus.google?.connected ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900 rounded-lg">
                <div className="flex items-center gap-3">
                  <Power className="w-5 h-5 text-green-500" />
                  <div>
                    <p className="font-medium dark:text-slate-200">{connectionStatus.google.display_name || 'חשבון Google'}</p>
                    <p className="text-sm text-slate-500">{connectionStatus.google.email}</p>
                  </div>
                </div>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => disconnect('google')}
                  disabled={connecting === 'google'}
                >
                  {connecting === 'google' ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4 ml-1" />}
                  התנתק
                </Button>
              </div>
              <p className="text-xs text-slate-500">
                הרשאות: Gmail (קריאה/כתיבה), יומן, Drive, Sheets
              </p>
              
              {/* Google Sheets Configuration */}
              <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <div className="flex items-center gap-2 mb-3">
                  <FileSpreadsheet className="w-4 h-4 text-blue-600" />
                  <Label className="text-sm font-medium text-blue-800 dark:text-blue-300">
                    הגדרת Google Sheets לגיבוי
                  </Label>
                </div>
                <p className="text-xs text-blue-700 dark:text-blue-400 mb-3">
                  הזן את מזהה הגיליון (Spreadsheet ID) לגיבוי אוטומטי של לקוחות וחיובים.
                  <br />
                  <span className="text-blue-600">ודא שיש בגיליון גיליונות בשם "Clients" ו-"Financials".</span>
                </p>
                <div className="flex gap-2">
                  <Input
                    value={spreadsheetId}
                    onChange={(e) => setSpreadsheetId(e.target.value)}
                    placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms"
                    className="flex-1 text-sm bg-white dark:bg-slate-800"
                    dir="ltr"
                  />
                  <Button 
                    size="sm" 
                    onClick={saveSpreadsheetId}
                    disabled={savingSpreadsheet}
                    className="gap-1"
                  >
                    {savingSpreadsheet ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                    שמור
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-slate-600 dark:text-slate-400">
                חבר את חשבון Google שלך כדי לאפשר סנכרון מיילים, יצירת אירועי יומן, העלאת קבצים ל-Drive וגיבוי נתונים ל-Sheets.
              </p>
              <Button 
                onClick={() => initiateOAuth('google')}
                disabled={connecting === 'google'}
                className="gap-2"
              >
                {connecting === 'google' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ExternalLink className="w-4 h-4" />
                )}
                חבר חשבון Google
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dropbox */}
      <Card className="dark:bg-slate-800 dark:border-slate-700">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500 flex items-center justify-center">
                <svg viewBox="0 0 24 24" className="w-6 h-6 fill-white">
                  <path d="M6 2L0 6l6 4-6 4 6 4 6-4-6-4 6-4-6-4zm12 0l-6 4 6 4-6 4 6 4 6-4-6-4 6-4-6-4zM6 14l6 4 6-4-6-4-6 4z"/>
                </svg>
              </div>
              <div>
                <CardTitle className="text-lg dark:text-slate-100">Dropbox</CardTitle>
                <CardDescription>אחסון ושיתוף קבצים</CardDescription>
              </div>
            </div>
            {connectionStatus.dropbox?.connected && (
              <Badge variant="outline" className="gap-1 text-green-600 border-green-200 bg-green-50 dark:bg-green-900/20 dark:border-green-800">
                <CheckCircle2 className="w-3 h-3" /> מחובר
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {connectionStatus.dropbox?.connected ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900 rounded-lg">
                <div className="flex items-center gap-3">
                  <Power className="w-5 h-5 text-green-500" />
                  <div>
                    <p className="font-medium dark:text-slate-200">{connectionStatus.dropbox.display_name || 'חשבון Dropbox'}</p>
                    <p className="text-sm text-slate-500">{connectionStatus.dropbox.email}</p>
                  </div>
                </div>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => disconnect('dropbox')}
                  disabled={connecting === 'dropbox'}
                >
                  {connecting === 'dropbox' ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4 ml-1" />}
                  התנתק
                </Button>
              </div>
              <p className="text-xs text-slate-500">
                הרשאות: קריאה/כתיבת קבצים, שיתוף
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-slate-600 dark:text-slate-400">
                חבר את חשבון Dropbox שלך כדי לאפשר העלאה אוטומטית של מסמכים ושיתוף קבצים עם לקוחות.
              </p>
              <Button 
                onClick={() => initiateOAuth('dropbox')}
                disabled={connecting === 'dropbox'}
                className="gap-2"
              >
                {connecting === 'dropbox' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ExternalLink className="w-4 h-4" />
                )}
                חבר חשבון Dropbox
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}