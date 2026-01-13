import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle, XCircle, RefreshCw, Cloud } from "lucide-react";
import { base44 } from '@/api/base44Client';
import { useToast } from "@/components/ui/use-toast";
import { useQuery, useQueryClient } from '@tanstack/react-query';

export default function IntegrationsTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // State נפרד לכל כפתור למניעת התנגשויות
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [loadingDropbox, setLoadingDropbox] = useState(false);

  // שליפת סטטוס חיבורים
  const { data: activeIntegrations = [], refetch, isLoading: isFetchingStatus } = useQuery({
    queryKey: ['integrations'],
    queryFn: async () => {
      try {
        const res = await base44.entities.IntegrationConnection.list({ limit: 10 });
        return res.data ? res.data.map(i => i.provider.toLowerCase()) : [];
      } catch (e) {
        return [];
      }
    }
  });

  // טיפול בחזרה מגוגל/דרופבוקס
  useEffect(() => {
    const handleCallback = async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      const state = params.get('state'); 
      const error = params.get('error');

      if (!code && !error) return;

      // ניקוי שורת הכתובת
      window.history.replaceState({}, document.title, window.location.pathname);

      if (error) {
        toast({ variant: "destructive", title: "שגיאה", description: "החיבור נדחה על ידי הספק." });
        return;
      }

      const provider = state || 'google';
      if (provider === 'google') setLoadingGoogle(true);
      else setLoadingDropbox(true);

      toast({ title: "מאמת...", description: "מבצע אימות ושמירה מול השרת." });

      try {
        // פירוק התשובה ל-data ו-error (חשוב מאוד!)
        const { data, error: apiError } = await base44.functions.invoke('integrationAuth', {
          action: 'handleCallback',
          provider: provider,
          code: code
        });

        if (apiError) throw new Error(apiError.message || "שגיאת שרת כללית");
        if (data && data.error) throw new Error(data.error);

        toast({ 
          title: "מחובר בהצלחה!", 
          description: `חשבון ${provider} חובר למערכת.`,
          className: "bg-green-50 border-green-200 text-green-900" 
        });
        
        await refetch();

      } catch (err) {
        console.error("Callback Error:", err);
        toast({ variant: "destructive", title: "שגיאת שמירה", description: err.message });
      } finally {
        setLoadingGoogle(false);
        setLoadingDropbox(false);
      }
    };

    handleCallback();
  }, []);

  const startAuth = async (provider) => {
    // הפעלת הספינר המתאים
    if (provider === 'google') setLoadingGoogle(true);
    else setLoadingDropbox(true);

    try {
      const { data, error } = await base44.functions.invoke('integrationAuth', {
        action: 'getAuthUrl',
        provider: provider,
        state: provider
      });

      console.log("Server Response:", { data, error });

      if (error) throw new Error(error.message || "שגיאת תקשורת עם השרת");
      if (data && data.error) throw new Error(data.error);

      if (data && data.authUrl) {
        window.location.href = data.authUrl;
      } else {
        throw new Error("התקבלה תשובה לא תקינה (חסר קישור)");
      }

    } catch (err) {
      console.error("Auth Start Error:", err);
      toast({ 
          variant: "destructive", 
          title: "שגיאת אתחול", 
          description: err.message 
      });
      
      // איפוס הכפתור רק במקרה של שגיאה
      if (provider === 'google') setLoadingGoogle(false);
      else setLoadingDropbox(false);
    }
  };

  const disconnect = async (provider) => {
    if (!confirm("האם לנתק את החשבון?")) return;
    try {
      const connections = await base44.entities.IntegrationConnection.list({ limit: 50 });
      const toDelete = connections.data.find(c => c.provider === provider);
      
      if (toDelete) {
        await base44.entities.IntegrationConnection.delete(toDelete.id);
        toast({ description: "החיבור הוסר בהצלחה." });
        refetch();
      }
    } catch (err) {
        toast({ variant: "destructive", title: "שגיאה", description: err.message });
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
