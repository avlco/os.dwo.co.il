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

  // Handle OAuth callback
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const returnedState = urlParams.get('state');
    
    if (!code || !returnedState || !user?.id) return;
    
    const savedNonce = sessionStorage.getItem('oauth_nonce');
    const expectedState = `${user.id}:${savedNonce}`;
    
    if (returnedState !== expectedState) {
      console.error('CSRF Protection: State mismatch!', { returnedState, expectedState });
      toast.error('שגיאת אבטחה: תהליך האימות לא תקין. אנא נסה שוב.');
      cleanUrl();
      return;
    }
    
    const pendingProvider = localStorage.getItem('pending_oauth_provider');
    
    if (pendingProvider) {
      handleAuthCallback(pendingProvider, code);
    } else {
      cleanUrl();
    }
  }, [user]);

  const generateNonce = () => {
    return crypto.randomUUID ? crypto.randomUUID() : 
      Math.random().toString(36).substring(2) + Date.now().toString(36);
  };

  const cleanUrl = () => {
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete('code');
      newUrl.searchParams.delete('state');
      newUrl.searchParams.delete('scope');
      window.history.replaceState({}, document.title, newUrl.toString());
      localStorage.removeItem('pending_oauth_provider');
      sessionStorage.removeItem('oauth_nonce');
  };

  const handleAuthCallback = async (provider, code) => {
      if (isProcessing) return;
      setIsProcessing(true);
      const loadingToastId = toast.loading('משלים תהליך חיבור...');

      try {
          const response = await base44.functions.invoke('integrationAuth', { 
              action: 'handleCallback',
              provider, 
              code, 
              userId: user.id
          });
          
          if (!response?.data?.success) {
              throw new Error("האימות לא הושלם בהצלחה.");
          }
          
          toast.dismiss(loadingToastId);
          toast.success('החיבור נוצר בהצלחה!');
          queryClient.invalidateQueries(['integrationConnections']);
      } catch (error) {
          console.error(error);
          toast.dismiss(loadingToastId);
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
    
    const nonce = generateNonce();
    sessionStorage.setItem('oauth_nonce', nonce);
    localStorage.setItem('pending_oauth_provider', provider);
    
    const loadingToastId = toast.loading('מכין מעבר לאימות...');

    try {
      const secureState = `${user.id}:${nonce}`;

      const response = await base44.functions.invoke('integrationAuth', { 
          action: 'getAuthUrl',
          provider, 
          state: secureState
      });

      toast.dismiss(loadingToastId);
      
      if (response?.data?.authUrl) {
          window.location.href = response.data.authUrl;
      } else {
          throw new Error("לא התקבלה כתובת אימות מהשרת");
      }
    } catch (error) {
      toast.dismiss(loadingToastId);
      toast.error(`שגיאה בהתחלת אינטגרציה: ${error.message}`);
      localStorage.removeItem('pending_oauth_provider');
      sessionStorage.removeItem('oauth_nonce');
    }
  };

  const saveSettings = async () => {
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