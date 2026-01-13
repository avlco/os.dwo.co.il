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
  const [isConnecting, setIsConnecting] = useState(false);

  // 1. שליפת סטטוס אינטגרציות קיים מהשרת
  const { data: activeIntegrations = [], refetch, isLoading } = useQuery({
    queryKey: ['integrations'],
    queryFn: async () => {
      try {
        // מנסים לשלוף את רשימת החיבורים הקיימים
        const res = await base44.entities.IntegrationConnection.list({ limit: 10 });
        // מחזירים רשימה של שמות הספקים (למשל: ['google', 'dropbox'])
        return res.data ? res.data.map(i => i.provider.toLowerCase()) : [];
      } catch (e) {
        console.error("Failed to fetch integrations", e);
        return [];
      }
    }
  });

  // 2. המנגנון הקריטי החסר: האזנה לחזרה מגוגל (Listener)
  useEffect(() => {
    const handleCallback = async () => {
      // בדיקה: האם יש קוד בשורת הכתובת?
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      const state = params.get('state'); // יכיל 'google' או 'dropbox'
      const error = params.get('error');

      // אם אין קוד, אנחנו במצב רגיל - לא עושים כלום
      if (!code && !error) return;

      // ניקוי כתובת ה-URL כדי שהמשתמש לא ישלח את אותו קוד פעמיים בטעות
      window.history.replaceState({}, document.title, window.location.pathname);

      if (error) {
        toast({ variant: "destructive", title: "התחברות נכשלה", description: "הפעולה בוטלה או נדחתה." });
        return;
      }

      // יש קוד! מתחילים תהליך שמירה מול השרת
      setIsConnecting(true);
      toast({ title: "מאמת חיבור...", description: "אנא המתן, שומרים את מפתח הגישה המאובטח." });

      try {
        // קריאה לפונקציית השרת (integrationAuth) עם הקוד שקיבלנו
        const res = await base44.functions.invoke('integrationAuth', {
          action: 'handleCallback',
          provider: state || 'google', // ברירת מחדל אם לא חזר state
          code: code
        });

        // בדיקת תשובת השרת
        if (res && res.error) {
            throw new Error(res.error);
        }

        toast({ 
          title: "החיבור הושלם בהצלחה!", 
          description: "כעת המערכת מחוברת ויכולה לסנכרן נתונים.",
          className: "bg-green-50 border-green-200 text-green-900" 
        });
        
        // רענון הרשימה כדי להציג את הוי הירוק מיד
        await refetch();

      } catch (err) {
        console.error("Callback Error:", err);
        toast({ 
          variant: "destructive", 
          title: "שגיאה בשמירת החיבור", 
          description: err.message || "אירעה שגיאה בתקשורת עם השרת." 
        });
      } finally {
        setIsConnecting(false);
      }
    };

    // הפעלת הבדיקה בטעינת הדף
    handleCallback();
  }, []);

  // 3. התחלת תהליך (Redirect to Google)
  const startAuth = async (provider) => {
    try {
      setIsConnecting(true);
      // מבקשים מהשרת את הלינק המדויק לגוגל (כולל Client ID ו-Redirect URI)
      const res = await base44.functions.invoke('integrationAuth', {
        action: 'getAuthUrl',
        provider: provider,
        state: provider
      });

      if (res.authUrl) {
        // מעבר לדף של גוגל
        window.location.href = res.authUrl;
      } else {
        throw new Error("השרת לא החזיר קישור התחברות תקין.");
      }
    } catch (err) {
      toast({ variant: "destructive", title: "שגיאה", description: err.message });
      setIsConnecting(false);
    }
  };

  // 4. ניתוק יזום
  const disconnect = async (provider) => {
    if (!confirm(`האם לנתק את ${provider}? סנכרון נתונים יופסק.`)) return;
    
    try {
      // מציאת הרשומה למחיקה
      const connections = await base44.entities.IntegrationConnection.list({ limit: 50 });
      const toDelete = connections.data.find(c => c.provider === provider);
      
      if (toDelete) {
        await base44.entities.IntegrationConnection.delete(toDelete.id);
        toast({ description: "החיבור הוסר בהצלחה." });
        refetch();
      } else {
        toast({ description: "לא נמצא חיבור פעיל לניתוק." });
        refetch(); // רענון למקרה שהממשק לא היה מעודכן
      }
    } catch (err) {
        toast({ variant: "destructive", title: "שגיאה בניתוק", description: err.message });
    }
  };

  const renderIntegrationCard = (name, providerKey, icon) => {
    const isConnected = activeIntegrations.includes(providerKey);
    
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-lg font-medium flex items-center gap-2">
            {icon}
            {name}
          </CardTitle>
          {isConnected ? 
            <Badge className="bg-green-100 text-green-800 hover:bg-green-100 flex gap-1">
                <CheckCircle className="w-3 h-3"/> מחובר
            </Badge> : 
            <Badge variant="outline" className="text-gray-500">לא מחובר</Badge>
          }
        </CardHeader>
        <CardContent>
          <CardDescription className="mb-4">
            {isConnected 
              ? `החשבון מחובר. המערכת יכולה לקרוא ולכתוב נתונים.`
              : `חבר את חשבון ה-${name} שלך כדי להפעיל אוטומציות.`
            }
          </CardDescription>
          
          <div className="flex justify-end">
            {isConnected ? (
                <Button variant="outline" className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200" onClick={() => disconnect(providerKey)}>
                <XCircle className="w-4 h-4 mr-2" /> התנתק
                </Button>
            ) : (
                <Button onClick={() => startAuth(providerKey)} disabled={isConnecting}>
                {isConnecting ? <Loader2 className="w-4 h-4 mr-2 animate-spin"/> : <Cloud className="w-4 h-4 mr-2"/>}
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
          <p className="text-sm text-muted-foreground">נהל את החיבורים לגוגל, דרופבוקס ושירותים נוספים.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`}/> 
            רענן סטטוס
        </Button>
      </div>
      
      <div className="grid gap-4 md:grid-cols-2">
        {renderIntegrationCard("Google (Gmail/Drive)", "google", <span className="text-xl font-bold text-blue-500">G</span>)}
        {renderIntegrationCard("Dropbox", "dropbox", <span className="text-xl font-bold text-blue-600">D</span>)}
      </div>
    </div>
  );
}
