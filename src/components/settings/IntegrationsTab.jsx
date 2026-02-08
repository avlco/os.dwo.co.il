import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, XCircle, RefreshCw, Cloud } from "lucide-react";
import { base44 } from '@/api/base44Client';
import { useToast } from "@/components/ui/use-toast";
import { useQuery, useQueryClient } from '@tanstack/react-query';
export default function IntegrationsTab() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [loadingDropbox, setLoadingDropbox] = useState(false);

  const { data: activeIntegrations = [], refetch, isLoading: isFetchingStatus } = useQuery({
    queryKey: ['integrations'],
    queryFn: async () => {
      try {
        // שליפת כל החיבורים
        const allConnections = await base44.entities.IntegrationConnection.list('-created_at', 100);
        const items = Array.isArray(allConnections) ? allConnections : (allConnections.data || []);
        
        // ✅ תיקון: is_active !== false במקום === true
        const active = items
          .filter(i => i.is_active !== false)  // ✅ גם null וגם true יעברו
          .map(i => i.provider?.toLowerCase() || '')
          .filter(p => p);  // הסרת ערכים ריקים
          
        return [...new Set(active)]; // הסרת כפילויות
      } catch (e) {
        console.error("[IntegrationsTab] Failed to fetch integrations:", e);
        return [];
      }
    },
    staleTime: 1000 * 30, // Cache ל-30 שניות
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
        title: "הצלחה", 
        description: `${provider === 'google' ? 'Google' : 'Dropbox'} חובר בהצלחה!` 
      });
      
      await queryClient.invalidateQueries(['integrations']);
      await refetch();
      window.history.replaceState({}, document.title, window.location.pathname);

    } catch (err) {
      console.error("[IntegrationsTab] Callback error:", err);
      toast({ 
        variant: "destructive", 
        title: "שגיאת חיבור", 
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
        title: "שגיאה", 
        description: err.message 
      });
      setLoadingGoogle(false);
      setLoadingDropbox(false);
    }
  };

  const disconnect = async (provider) => {
    if (!confirm("האם אתה בטוח? פעולה זו תנתק את החיבור עבור כל המשתמשים.")) return;
    
    try {
      const allConnections = await base44.entities.IntegrationConnection.list('-created_at', 100);
      const items = Array.isArray(allConnections) ? allConnections : (allConnections.data || []);
      const toDelete = items.filter(c => c.provider === provider);
      
      for (const item of toDelete) {
        await base44.entities.IntegrationConnection.delete(item.id);
      }
      
      toast({ description: "החיבור נותק בהצלחה." });
      await queryClient.invalidateQueries(['integrations']);
      await refetch();
    } catch (err) {
      console.error("[IntegrationsTab] Disconnect error:", err);
      toast({ 
        variant: "destructive", 
        title: "שגיאה", 
        description: err.message 
      });
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
          <div className="flex justify-end mt-4">
            {isConnected ? (
              <Button 
                variant="outline" 
                className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-900/20 dark:border-red-800" 
                onClick={() => disconnect(key)}
              >
                <XCircle className="w-4 h-4 mr-2" /> {t('integrations.disconnect')}
              </Button>
            ) : (
              <Button onClick={() => startAuth(key)} disabled={isLoading} className="bg-slate-800 hover:bg-slate-700 dark:bg-slate-600 dark:hover:bg-slate-500">
                {isLoading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin"/>
                ) : (
                  <Cloud className="w-4 h-4 mr-2"/>
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
          <RefreshCw className={`w-4 h-4 mr-2 ${isFetchingStatus ? 'animate-spin' : ''}`}/>
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

    </div>
  );
}