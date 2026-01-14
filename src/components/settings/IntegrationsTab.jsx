import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, XCircle, RefreshCw, Cloud } from "lucide-react";
import { base44 } from '@/api/base44Client';
import { useToast } from "@/components/ui/use-toast";
import { useQuery, useQueryClient } from '@tanstack/react-query';

export default function IntegrationsTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [loadingDropbox, setLoadingDropbox] = useState(false);

  // === התיקון הקריטי: LIMIT 100 + סינון Active ===
  const { data: activeIntegrations = [], refetch, isLoading: isFetchingStatus } = useQuery({
    queryKey: ['integrations'],
    queryFn: async () => {
      try {
        // משיכת 100 רשומות כדי לא לפספס את החיבור הפעיל גם אם יש היסטוריה
        const res = await base44.entities.IntegrationConnection.list({ limit: 100 });
        const items = res.data || [];
        
        // החזרת ספקים שיש להם לפחות חיבור אחד שסומן כפעיל
        const active = items
          .filter(i => i.is_active === true)
          .map(i => i.provider.toLowerCase());
          
        return [...new Set(active)]; // הסרת כפילויות
      } catch (e) {
        console.error("Failed to fetch integrations", e);
        return [];
      }
    }
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

      toast({ title: "Success", description: `${provider} connected successfully!` });
      await queryClient.invalidateQueries(['integrations']);
      refetch();
      window.history.replaceState({}, document.title, window.location.pathname);

    } catch (err) {
      toast({ variant: "destructive", title: "Connection Failed", description: err.message });
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

      if (data && data.authUrl) window.location.href = data.authUrl;
      else throw new Error("Missing auth URL");

    } catch (err) {
      toast({ variant: "destructive", title: "Error", description: err.message });
      setLoadingGoogle(false);
      setLoadingDropbox(false);
    }
  };

  const disconnect = async (provider) => {
    if (!confirm("Are you sure? This will disconnect the integration for everyone.")) return;
    try {
      const res = await base44.entities.IntegrationConnection.list({ limit: 100 });
      const items = res.data || [];
      // מחיקת כל החיבורים של אותו ספק כדי לנקות את הלוח
      const toDelete = items.filter(c => c.provider === provider);
      
      for (const item of toDelete) {
          await base44.entities.IntegrationConnection.delete(item.id);
      }
      
      toast({ description: "Disconnected successfully." });
      await queryClient.invalidateQueries(['integrations']);
      refetch();
    } catch (err) {
        toast({ variant: "destructive", title: "Error", description: err.message });
    }
  };

  const renderCard = (name, key, icon, isLoading) => {
    const isConnected = activeIntegrations.includes(key);
    
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-lg font-medium flex items-center gap-2">
            {icon} {name}
          </CardTitle>
          {isConnected ? 
            <Badge className="bg-green-100 text-green-800">מחובר</Badge> : 
            <Badge variant="outline">לא מחובר</Badge>
          }
        </CardHeader>
        <CardContent>
          <div className="flex justify-end mt-4">
            {isConnected ? (
                <Button variant="outline" className="text-red-600" onClick={() => disconnect(key)}>
                  <XCircle className="w-4 h-4 mr-2" /> התנתק
                </Button>
            ) : (
                <Button onClick={() => startAuth(key)} disabled={isLoading}>
                  {isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin"/> : <Cloud className="w-4 h-4 mr-2"/>}
                  חבר חשבון
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
        <h3 className="text-lg font-medium">אינטגרציות מערכת</h3>
        <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isFetchingStatus}>
            <RefreshCw className={`w-4 h-4 mr-2 ${isFetchingStatus ? 'animate-spin' : ''}`}/> רענן סטטוס
        </Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {renderCard("Google", "google", <span className="text-xl font-bold text-blue-500">G</span>, loadingGoogle)}
        {renderCard("Dropbox", "dropbox", <span className="text-xl font-bold text-blue-600">D</span>, loadingDropbox)}
      </div>
    </div>
  );
}