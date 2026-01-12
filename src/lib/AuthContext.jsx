import React, { createContext, useState, useEffect, useContext } from 'react';
import { base44 } from '@/api/base44Client';
import { appParams } from './app-params';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [appPublicSettings, setAppPublicSettings] = useState(null);

  const navigateToLogin = () => {
      // כתובת לוגין קשיחה למקרה שה-SDK לא נטען
      const baseUrl = 'https://dwo.base44.app';
      window.location.href = `${baseUrl}/login`;
  };

  const logout = async () => {
      try {
          await base44.auth.logout();
      } catch (e) { 
          console.error("Logout error:", e); 
      }
      setUser(null);
      setIsAuthenticated(false);
      
      // Security Phase 2: Selective Logout
      // ניקוי כירורגי של נתוני האפליקציה בלבד
      localStorage.removeItem('base44_access_token');
      localStorage.removeItem('base44_refresh_token');
      localStorage.removeItem('pending_oauth_provider');
      sessionStorage.clear();
      
      navigateToLogin();
  };

  const checkAuth = async () => {
    setIsLoading(true);
    try {
      const userData = await base44.auth.me();
      
      if (userData) {
        setUser(userData);
        setIsAuthenticated(true);
        
        // Security Phase 2: Clean URL
        // ניקוי הטוקן משורת הכתובת לאחר אימות מוצלח
        const url = new URL(window.location.href);
        if (url.searchParams.has('access_token')) {
            url.searchParams.delete('access_token');
            window.history.replaceState({}, document.title, url.pathname + url.search);
        }
      }
    } catch (error) {
      const status = error.response?.status || 0;
      setUser(null);
      setIsAuthenticated(false);

      // אם הטוקן לא תקף, ננקה אותו מהזיכרון/סטורג'
      if (status === 403 || status === 401) {
        localStorage.removeItem('base44_access_token');
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
