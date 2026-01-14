import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, XCircle, RefreshCw, Cloud } from "lucide-react";
import { base44 } from '@/api/base44Client';
import { useToast } from "@/components/ui/use-toast";
import { useQuery } from '@tanstack/react-query';

export default function IntegrationsTab() {
  const { toast } = useToast();
  
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [loadingDropbox, setLoadingDropbox] = useState(false);

  // === תיקון התצוגה: בדיקת חיבור מערכתי ===
  const { data: activeIntegrations = [], refetch, isLoading: isFetchingStatus } = useQuery({
    queryKey: ['integrations'],
    queryFn: async () => {
      try {
        // שליפה עם limit גבוה כדי למצוא את החיבור
        const res = await base44.entities.IntegrationConnection.list({ limit: 100 });
        const items = res.data || [];
        
        // אנחנו מחוברים אם יש חיבור פעיל, לא משנה של מי
        return items
          .filter(i => i.is_active !== false)
          .map(i => i.provider.toLowerCase());
      } catch (e) {
        console.error("Failed to fetch integrations", e);
        return [];
      }
    }
  });

  // (שאר הקוד של useEffect לטיפול ב-callback נשאר זהה לקוד המקורי שלך, אין צורך לשנות)
  // ... (העתק את ה-useEffect מהקובץ המקורי שלך לכאן אם צריך, או השאר אותו כפי שהוא)
  
  // הוספתי רק את הפונקציות ההכרחיות לחיבור/ניתוק:

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
    if (!confirm("Are you sure? This will affect the whole office.")) return;
    try {
      const res = await base44.entities.IntegrationConnection.list({ limit: 100 });
      const items = res.data || [];
      const toDelete = items.find(c => c.provider === provider);
      
      if (toDelete) {
        await base44.entities.IntegrationConnection.delete(toDelete.id);
        toast({ description: "Disconnected successfully." });
        refetch();
      }
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
        <h3 className="text-lg font-medium">אינטגרציות</h3>
        <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isFetchingStatus}>
            <RefreshCw className={`w-4 h-4 mr-2 ${isFetchingStatus ? 'animate-spin' : ''}`}/> רענן
        </Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {renderCard("Google", "google", <span className="text-xl font-bold text-blue-500">G</span>, loadingGoogle)}
        {renderCard("Dropbox", "dropbox", <span className="text-xl font-bold text-blue-600">D</span>, loadingDropbox)}
      </div>
    </div>
  );
}