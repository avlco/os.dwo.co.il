import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle, XCircle, RefreshCw, Cloud, AlertCircle } from "lucide-react";
import { base44 } from '@/api/base44Client';
import { useToast } from "@/components/ui/use-toast";
import { useQuery, useQueryClient } from '@tanstack/react-query';

export default function IntegrationsTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // ניהול State חכם: שומר את שם הספק שכרגע בתהליך, או null אם פנוי
  const [connectingProvider, setConnectingProvider] = useState(null); 

  const { data: activeIntegrations = [], refetch, isLoading } = useQuery({
    queryKey: ['integrations'],
    queryFn: async () => {
      try {
        const res = await base44.entities.IntegrationConnection.list({ limit: 10 });
        return res.data ? res.data.map(i => i.provider.toLowerCase()) : [];
      } catch (e) {
        console.error("Failed to fetch integrations", e);
        return [];
      }
    }
  });

  // Callback Handler
  useEffect(() => {
    const handleCallback = async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      const state = params.get('state'); // 'google' | 'dropbox'
      const error = params.get('error');

      if (!code && !error) return;

      // Clean URL
      window.history.replaceState({}, document.title, window.location.pathname);

      if (error) {
        toast({ variant: "destructive", title: "התחברות בוטלה", description: "הספק דחה את הבקשה." });
        return;
      }

      // זיהוי ספק מתוך ה-state או ברירת מחדל
      const provider = state || 'google';
      setConnectingProvider(provider); // הפעלת ספינר לכפתור הרלוונטי
      
      toast({ title: "מאמת חיבור...", description: "מתקשר עם השרת לשמירת המפתח." });

      try {
        const res = await base44.functions.invoke('integrationAuth', {
          action: 'handleCallback',
          provider: provider,
          code: code
        });

        if (res && res.error) {
            throw new Error(res.error);
        }

        toast({ 
          title: "החיבור הושלם!", 
          description: "ניתן להתחיל בעבודה.",
          className: "bg-green-50 border-green-200 text-green-800" 
        });
        
        await refetch();

      } catch (err) {
        console.error("Callback Error:", err);
        // הצגת השגיאה האמיתית מהשרת למשתמש
        toast({ 
            variant: "destructive", 
            title: "שגיאת חיבור", 
            description: err.message || "שגיאה לא ידועה בשרת." 
        });
      } finally {
        setConnectingProvider(null); // שחרור הכפתור
      }
    };

    handleCallback();
  }, []);

  const startAuth = async (provider) => {
    try {
      setConnectingProvider(provider); // נעל רק את הכפתור הזה
      
      const res = await base44.functions.invoke('integrationAuth', {
        action: 'getAuthUrl',
        provider: provider,
        state: provider
      });

      // בדיקת שגיאה מהשרת לפני שמתקדמים
      if (res.error) {
          throw new Error(res.error);
      }

      if (res.authUrl) {
        window.location.href = res.authUrl;
      } else {
        throw new Error("השרת לא החזיר קישור (תגובה ריקה).");
      }
    } catch (err) {
      // כאן המשתמש יראה בדיוק מה קרה (למשל: "Missing Google Credentials")
      toast({ 
          variant: "destructive", 
          title: "שגיאת התחלה", 
          description: err.message 
      });
      setConnectingProvider(null);
    }
  };

  const disconnect = async (provider) => {
    if (!confirm(`האם לנתק את ${provider}?`)) return;
    
    try {
      const connections = await base44.entities.IntegrationConnection.list({ limit: 50 });
      const toDelete = connections.data.find(c => c.provider === provider);
      
      if (toDelete) {
        await base44.entities.IntegrationConnection.delete(toDelete.id);
        toast({ description: "החיבור הוסר." });
        refetch();
      }
    } catch (err) {
        toast({ variant: "destructive", title: "שגיאה", description: err.message });
    }
  };

  const renderIntegrationCard = (name, providerKey, icon) => {
    const isConnected = activeIntegrations.includes(providerKey);
    const isLoadingThis = connectingProvider === providerKey; // האם הכפתור הזה ספציפית בעבודה?
    const isOtherLoading = connectingProvider !== null && !isLoadingThis; // האם מישהו אחר עובד?

    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-lg font-medium flex items-center gap-2">
            {icon}
            {name}
          </CardTitle>
          {isConnected ? 
            <Badge className="bg-green-100 text-green-800 hover:bg-green-100 gap-1"><CheckCircle className="w-3 h-3"/> מחובר</Badge> : 
            <Badge variant="outline" className="text-gray-500">לא מחובר</Badge>
          }
        </CardHeader>
        <CardContent>
          <CardDescription className="mb-4">
            {isConnected 
              ? "החיבור פעיל ותקין."
              : "נדרש חיבור כדי לאפשר סנכרון אוטומטי."
            }
          </CardDescription>
          
          <div className="flex justify-end">
            {isConnected ? (
                <Button variant="outline" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => disconnect(providerKey)}>
                <XCircle className="w-4 h-4 mr-2" /> התנתק
                </Button>
            ) : (
                <Button 
                    onClick={() => startAuth(providerKey)} 
                    disabled={isLoadingThis || isOtherLoading} // נעל אם עובדים
                >
                {isLoadingThis ? <Loader2 className="w-4 h-4 mr-2 animate-spin"/> : <Cloud className="w-4 h-4 mr-2"/>}
                חבר חשבון {name}
                </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">אינטגרציות חיצוניות</h3>
          <p className="text-sm text-muted-foreground">ניהול חיבורים לשירותי ענן.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`}/> 
            רענן סטטוס
        </Button>
      </div>
      
      <div className="grid gap-4 md:grid-cols-2">
        {renderIntegrationCard("Google", "google", <span className="text-xl font-bold text-blue-500">G</span>)}
        {renderIntegrationCard("Dropbox", "dropbox", <span className="text-xl font-bold text-blue-600">D</span>)}
      </div>
    </div>
  );
}