import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, XCircle, RefreshCw, Cloud, FolderSync, CheckCircle2, AlertTriangle } from "lucide-react";
import { base44 } from '@/api/base44Client';
import { useToast } from "@/components/ui/use-toast";
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';

export default function IntegrationsTab() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'partner' || user?.role === 'super_admin';

  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [loadingDropbox, setLoadingDropbox] = useState(false);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanResults, setScanResults] = useState(null);

  const { data: activeIntegrations = [], refetch, isLoading: isFetchingStatus } = useQuery({
    queryKey: ['integrations'],
    queryFn: async () => {
      try {
        const allConnections = await base44.entities.IntegrationConnection.list('-created_at', 100);
        const items = Array.isArray(allConnections) ? allConnections : (allConnections.data || []);

        const active = items
          .filter(i => i.is_active !== false)
          .map(i => i.provider?.toLowerCase() || '')
          .filter(p => p);

        return [...new Set(active)];
      } catch (e) {
        console.error("[IntegrationsTab] Failed to fetch integrations:", e);
        return [];
      }
    },
    staleTime: 1000 * 30,
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');

    if (code && state) {
      handleCallback(code, state);
    }
  }, []);

  const handleCallback = async (code, state) => {
    const provider = state;
    if (provider === 'google') setLoadingGoogle(true);
    else setLoadingDropbox(true);

    try {
      const { data, error } = await base44.functions.invoke('integrationAuth', {
        action: 'handleCallback',
        provider,
        code
      });

      if (error) throw new Error(error.message);
      if (data && data.error) throw new Error(data.error);

      toast({
        title: t('common.success', 'הצלחה'),
        description: `${provider === 'google' ? 'Google' : 'Dropbox'} ${t('integrations.connected_success', 'חובר בהצלחה!')}`
      });

      await queryClient.invalidateQueries(['integrations']);
      await refetch();
      window.history.replaceState({}, document.title, window.location.pathname);

    } catch (err) {
      console.error("[IntegrationsTab] Callback error:", err);
      toast({
        variant: "destructive",
        title: t('common.connection_error', 'שגיאת חיבור'),
        description: err.message
      });
    } finally {
      setLoadingGoogle(false);
      setLoadingDropbox(false);
    }
  };

  const startAuth = async (provider) => {
    if (provider === 'google') setLoadingGoogle(true);
    else setLoadingDropbox(true);

    try {
      const { data, error } = await base44.functions.invoke('integrationAuth', {
        action: 'getAuthUrl',
        provider: provider,
        state: provider
      });

      if (error) throw new Error(error.message);
      if (data && data.error) throw new Error(data.error);

      if (data && data.authUrl) {
        window.location.href = data.authUrl;
      } else {
        throw new Error("Missing auth URL");
      }

    } catch (err) {
      console.error("[IntegrationsTab] Auth start error:", err);
      toast({
        variant: "destructive",
        title: t('common.error', 'שגיאה'),
        description: err.message
      });
      setLoadingGoogle(false);
      setLoadingDropbox(false);
    }
  };

  const disconnect = async (provider) => {
    if (!confirm(t('integrations.disconnect_confirm', 'האם אתה בטוח? פעולה זו תנתק את החיבור עבור כל המשתמשים.'))) return;

    try {
      const allConnections = await base44.entities.IntegrationConnection.list('-created_at', 100);
      const items = Array.isArray(allConnections) ? allConnections : (allConnections.data || []);
      const toDelete = items.filter(c => c.provider === provider);

      for (const item of toDelete) {
        await base44.entities.IntegrationConnection.delete(item.id);
      }

      toast({ description: t('integrations.disconnected_success', 'החיבור נותק בהצלחה.') });
      await queryClient.invalidateQueries(['integrations']);
      await refetch();
    } catch (err) {
      console.error("[IntegrationsTab] Disconnect error:", err);
      toast({
        variant: "destructive",
        title: t('common.error', 'שגיאה'),
        description: err.message
      });
    }
  };

  const runDropboxScan = async () => {
    setScanLoading(true);
    setScanResults(null);
    try {
      const result = await base44.functions.invoke('scanDropboxStructure', {});
      if (result.data?.error) throw new Error(result.data.error);
      setScanResults(result.data);
      toast({
        title: t('integrations.scan_complete', 'סריקה הושלמה'),
        description: `${result.data.matched_clients}/${result.data.total_folders} ${t('integrations.clients_matched', 'לקוחות מותאמים')}`
      });
    } catch (err) {
      console.error("[IntegrationsTab] Scan error:", err);
      toast({
        variant: "destructive",
        title: t('common.error', 'שגיאה'),
        description: err.message
      });
    } finally {
      setScanLoading(false);
    }
  };

  const renderCard = (name, key, icon, isLoading) => {
    const isConnected = activeIntegrations.includes(key);

    return (
      <Card key={key} className="dark:bg-slate-800 dark:border-slate-700">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-lg font-medium flex items-center gap-2 dark:text-slate-200">
            {icon} {name}
          </CardTitle>
          {isConnected ?
            <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">{t('integrations.connected')}</Badge> :
            <Badge variant="outline" className="dark:border-slate-600 dark:text-slate-300">{t('integrations.not_connected')}</Badge>
          }
        </CardHeader>
        <CardContent>
          <div className="flex justify-end gap-2 mt-4">
            {isConnected ? (
              <>
                {key === 'dropbox' && isAdmin && (
                  <Button
                    variant="outline"
                    onClick={runDropboxScan}
                    disabled={scanLoading}
                    className="dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
                  >
                    {scanLoading ? (
                      <Loader2 className="w-4 h-4 ltr:mr-2 rtl:ml-2 animate-spin" />
                    ) : (
                      <FolderSync className="w-4 h-4 ltr:mr-2 rtl:ml-2" />
                    )}
                    {t('integrations.scan_folders', 'סריקת תיקיות')}
                  </Button>
                )}
                <Button
                  variant="outline"
                  className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-900/20 dark:border-red-800"
                  onClick={() => disconnect(key)}
                >
                  <XCircle className="w-4 h-4 ltr:mr-2 rtl:ml-2" /> {t('integrations.disconnect')}
                </Button>
              </>
            ) : (
              <Button onClick={() => startAuth(key)} disabled={isLoading} className="bg-slate-800 hover:bg-slate-700 dark:bg-slate-600 dark:hover:bg-slate-500">
                {isLoading ? (
                  <Loader2 className="w-4 h-4 ltr:mr-2 rtl:ml-2 animate-spin"/>
                ) : (
                  <Cloud className="w-4 h-4 ltr:mr-2 rtl:ml-2"/>
                )}
                {t('integrations.connect')}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium dark:text-slate-100">{t('integrations.title')}</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetchingStatus}
        >
          <RefreshCw className={`w-4 h-4 ltr:mr-2 rtl:ml-2 ${isFetchingStatus ? 'animate-spin' : ''}`}/>
          {t('integrations.refresh_status', 'Refresh Status')}
        </Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {renderCard(
          "Google",
          "google",
          <span className="text-xl font-bold text-blue-500">G</span>,
          loadingGoogle
        )}
        {renderCard(
          "Dropbox",
          "dropbox",
          <span className="text-xl font-bold text-blue-600">D</span>,
          loadingDropbox
        )}
      </div>

      {/* Dropbox Scan Results */}
      {scanResults && (
        <Card className="dark:bg-slate-800 dark:border-slate-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium flex items-center gap-2 dark:text-slate-200">
              <FolderSync className="w-5 h-5" />
              {t('integrations.scan_results', 'תוצאות סריקה')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-slate-800 dark:text-slate-200">{scanResults.total_folders}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{t('integrations.total_folders', 'סה"כ תיקיות')}</p>
              </div>
              <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-green-700 dark:text-green-400">{scanResults.matched_clients}</p>
                <p className="text-xs text-green-600 dark:text-green-500">{t('integrations.matched_clients', 'לקוחות מותאמים')}</p>
              </div>
              <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-orange-700 dark:text-orange-400">{scanResults.unmatched_folders?.length || 0}</p>
                <p className="text-xs text-orange-600 dark:text-orange-500">{t('integrations.unmatched_folders', 'תיקיות לא מותאמות')}</p>
              </div>
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-blue-700 dark:text-blue-400">
                  {scanResults.matched_details?.reduce((sum, d) => sum + d.matched_cases, 0) || 0}
                </p>
                <p className="text-xs text-blue-600 dark:text-blue-500">{t('integrations.matched_cases', 'תיקים מותאמים')}</p>
              </div>
            </div>

            {/* Matched Clients */}
            {scanResults.matched_details?.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  {t('integrations.matched_clients_detail', 'לקוחות שזוהו')}
                </h4>
                <div className="space-y-1 max-h-[200px] overflow-y-auto">
                  {scanResults.matched_details.map((detail, i) => (
                    <div key={i} className="flex items-center justify-between text-sm px-3 py-2 bg-green-50 dark:bg-green-900/10 rounded-lg">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0" />
                        <span className="text-slate-700 dark:text-slate-300">{detail.client_number} — {detail.client_name}</span>
                      </div>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {detail.matched_cases}/{detail.total_case_subfolders} {t('integrations.cases_short', 'תיקים')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Unmatched Folders */}
            {scanResults.unmatched_folders?.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  {t('integrations.unmatched_folders_detail', 'תיקיות לא מזוהות')}
                </h4>
                <div className="space-y-1 max-h-[150px] overflow-y-auto">
                  {scanResults.unmatched_folders.map((name, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm px-3 py-2 bg-orange-50 dark:bg-orange-900/10 rounded-lg">
                      <AlertTriangle className="w-4 h-4 text-orange-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">{name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
