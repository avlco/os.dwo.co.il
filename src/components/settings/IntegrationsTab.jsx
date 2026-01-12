import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { Power, ExternalLink, X, Loader2 } from 'lucide-react';

export default function IntegrationsTab() {
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [isLoadingUser, setIsLoadingUser] = useState(true);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const userData = await base44.auth.me();
        setUser(userData);
      } catch (e) {
        console.error('Failed to load user:', e);
      } finally {
        setIsLoadingUser(false);
      }
    };
    loadUser();
  }, []);
  const [integrationSettings, setIntegrationSettings] = useState({
    googleSpreadsheetId: '',
  });
  const [isProcessing, setIsProcessing] = useState(false);

  // Fetch integration connections
  const { data: connections = [], isLoading: isLoadingConnections } = useQuery({
    queryKey: ['integrationConnections'],
    queryFn: () => base44.entities.IntegrationConnection.filter({ user_id: user?.id }),
    enabled: !!user?.id,
  });

  // Mutation to disconnect
  const disconnectMutation = useMutation({
    mutationFn: (id) => base44.entities.IntegrationConnection.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['integrationConnections']);
      toast.success('החיבור נותק בהצלחה');
    },
    onError: (error) => {
      toast.error(`שגיאה בניתוק: ${error.message}`);
    }
  });

  // Handle OAuth callback (כשחוזרים מגוגל/דרופבוקס)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state'); // ה-User ID ששלחנו
    
    // בדיקה בסיסית: האם חזרנו עם קוד, והאם זה המשתמש הנכון?
    if (code && state && user?.id && state === user.id) {
      
      // זיהוי הספק לפי ה-URL הנוכחי או פרמטר שנשמר (בדרך כלל עדיף לשמור ב-localStorage לפני היציאה, אבל כאן ננחש לפי הקוד)
      // מכיוון שאנחנו לא יודעים מי הספק רק לפי ה-Code, נבדוק את ה-Redirect URI או שננסה את שניהם?
      // הדרך הנכונה: כשלוחצים על הכפתור, שומרים ב-localStorage את הספק.
      const pendingProvider = localStorage.getItem('pending_oauth_provider');
      
      if (pendingProvider) {
        handleAuthCallback(pendingProvider, code);
      } else {
          // Fallback: אם אין ב-storage, ננקה את ה-URL כי זה אולי callback ישן או שגוי
          cleanUrl();
      }
    }
  }, [user]);

  const cleanUrl = () => {
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete('code');
      newUrl.searchParams.delete('state');
      // newUrl.searchParams.delete('scope'); // גוגל מוסיפים גם את זה
      window.history.replaceState({}, document.title, newUrl.toString());
      localStorage.removeItem('pending_oauth_provider');
  };

  const handleAuthCallback = async (provider, code) => {
      if (isProcessing) return; // מניעת כפילות
      setIsProcessing(true);
      toast.info('משלים תהליך חיבור...');

      try {
          // שינוי קריטי: קריאה לפונקציה בשם הקובץ, עם שם הפעולה
          await base44.functions.invoke('integrationAuth', { 
              action: 'handleCallback',
              provider, 
              code, 
              userId: user.id 
          });
          
          toast.success('החיבור נוצר בהצלחה!');
          queryClient.invalidateQueries(['integrationConnections']);
      } catch (error) {
          console.error(error);
          toast.error(`שגיאה בחיבור: ${error.message}`);
      } finally {
          setIsProcessing(false);
          cleanUrl();
      }
  };

  const initiateOAuth = async (provider) => {
    if (!user) {
      toast.error('שגיאה: יש להתחבר למערכת כדי לבצע אינטגרציה.');
      return;
    }
    
    // שמירת הספק כדי שנדע למי לשייך כשנחזור
    localStorage.setItem('pending_oauth_provider', provider);

    try {
      toast.loading('מכין מעבר לאימות...');
      
      // שינוי קריטי: קריאה לפונקציה בשם הקובץ, עם שם הפעולה
      const response = await base44.functions.invoke('integrationAuth', { 
          action: 'getAuthUrl',
          provider, 
          userId: user.id 
      });

      if (response && response.authUrl) {
          window.location.href = response.authUrl;
      } else {
          throw new Error("לא התקבלה כתובת אימות מהשרת");
      }
    } catch (error) {
      toast.dismiss(); // הסתרת ה-loading
      toast.error(`שגיאה בהתחלת אינטגרציה: ${error.message}`);
      localStorage.removeItem('pending_oauth_provider');
    }
  };

  const saveSettings = async () => {
      // כאן אפשר להוסיף שמירה של הגדרות נוספות כמו Spreadsheet ID ל-DB
      // כרגע זה ב-state מקומי, צריך לחבר לישות
      toast.info("שמירת הגדרות נוספות תיושם בקרוב");
  };

  if (isLoadingConnections || isLoadingUser) return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="space-y-6">
      
      {/* Google Workspace Card */}
      <Card className="dark:bg-slate-800 dark:border-slate-700">
        <CardHeader>
          <CardTitle>Google Workspace</CardTitle>
          <CardDescription>חבר את חשבון Google שלך כדי לאפשר אינטגרציה עם Gmail, Calendar ו-Sheets.</CardDescription>
        </CardHeader>
        <CardContent>
          {connections.some(c => c.provider === 'google') ? (
            <div className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-100 dark:border-green-900">
                  <span className="text-sm font-medium flex items-center gap-2 text-green-700 dark:text-green-400">
                    <Power className="w-4 h-4" />
                    מחובר ופעיל
                  </span>
                  <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => disconnectMutation.mutate(connections.find(c => c.provider === 'google').id)}>
                    <X className="w-4 h-4 mr-2" /> התנתק
                  </Button>
                </div>
                
                <div className="pt-2">
                    <Label htmlFor="google-spreadsheet-id">מזהה גיליון אלקטרוני של Google Sheets (לגיבוי נתונים)</Label>
                    <div className="flex gap-2 mt-1.5">
                        <Input
                        id="google-spreadsheet-id"
                        value={integrationSettings.googleSpreadsheetId}
                        onChange={(e) => setIntegrationSettings({ ...integrationSettings, googleSpreadsheetId: e.target.value })}
                        placeholder="הדבק כאן את ה-ID (לדוגמה: 1BxiMVs0XRA5n...)"
                        />
                        <Button variant="outline" onClick={saveSettings}>שמור</Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                    ניתן למצוא את המזהה בכתובת ה-URL של הגיליון (הטקסט בין ה-/d/ לבין ה-/edit).
                    </p>
                </div>
            </div>
          ) : (
            <Button onClick={() => initiateOAuth('google')} disabled={isProcessing}>
              {isProcessing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ExternalLink className="w-4 h-4 mr-2" />} 
              חבר חשבון Google
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Dropbox Card */}
      <Card className="dark:bg-slate-800 dark:border-slate-700">
        <CardHeader>
          <CardTitle>Dropbox</CardTitle>
          <CardDescription>חבר את חשבון Dropbox שלך לאחסון ושיתוף קבצים אוטומטי.</CardDescription>
        </CardHeader>
        <CardContent>
          {connections.some(c => c.provider === 'dropbox') ? (
            <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-100 dark:border-green-900">
              <span className="text-sm font-medium flex items-center gap-2 text-green-700 dark:text-green-400">
                <Power className="w-4 h-4" />
                מחובר ופעיל
              </span>
              <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => disconnectMutation.mutate(connections.find(c => c.provider === 'dropbox').id)}>
                <X className="w-4 h-4 mr-2" /> התנתק
              </Button>
            </div>
          ) : (
            <Button onClick={() => initiateOAuth('dropbox')} disabled={isProcessing}>
               {isProcessing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ExternalLink className="w-4 h-4 mr-2" />} 
               חבר חשבון Dropbox
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}