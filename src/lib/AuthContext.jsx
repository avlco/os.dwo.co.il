import React, { createContext, useState, useEffect, useContext } from 'react';
import { base44 } from '@/api/base44Client';
import { appParams } from './app-params';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [appPublicSettings, setAppPublicSettings] = useState(null);

  // פונקציה בטוחה למעבר למסך התחברות
  const navigateToLogin = () => {
      // תיקון קריטי: בנייה ידנית של ה-URL במקום להסתמך על פונקציית SDK חסרה
      const baseUrl = appParams.appBaseUrl || 'https://dwo.base44.app';
      // מוודאים שאין לוכסן כפול
      const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
      window.location.href = `${cleanBaseUrl}/login`;
  };

  const logout = async () => {
      try {
          await base44.auth.logout();
      } catch (e) { 
          console.error("Logout error:", e); 
      }
      setUser(null);
      setIsAuthenticated(false);
      localStorage.clear();
      sessionStorage.clear();
      navigateToLogin();
  };

  const checkAuth = async () => {
    setIsLoading(true);
    try {
      // 1. נסיון לקבל משתמש
      const userData = await base44.auth.me();
      
      if (userData) {
        setUser(userData);
        setIsAuthenticated(true);
        
        // 2. טעינת הגדרות רק למשתמש מחובר
        if (appParams.appId && base44.app_client) {
            try {
                const settings = await base44.app_client.get(`/prod/public-settings/by-id/${appParams.appId}`);
                setAppPublicSettings(settings);
            } catch (settingsError) {
                console.warn("Settings fetch warning:", settingsError);
            }
        }
      }
    } catch (error) {
      const status = error.response?.status || 0;
      
      // משתמש לא מחובר או אין הרשאה - זה מצב תקין, המערכת תפנה אותו ללוגין
      setUser(null);
      setIsAuthenticated(false);

      if (status === 403 || status === 401) {
        localStorage.clear(); // ניקוי שאריות טוקן פגום
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  return (
    <AuthContext.Provider value={{ 
      user,
      isAuthenticated, 
      isLoading, 
      appPublicSettings,
      navigateToLogin,
      logout,
      checkAuth
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
