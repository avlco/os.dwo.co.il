import React, { createContext, useState, useEffect, useContext } from 'react';
import { base44 } from '@/api/base44Client';
import { appParams } from './app-params';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);  // ✅ שם מדויק יותר
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(false);
  const [appPublicSettings, setAppPublicSettings] = useState(null);
  const [authError, setAuthError] = useState(null);  // ✅ הוספת state לשגיאות

  const navigateToLogin = () => {
    const baseUrl = appParams.appBaseUrl || 'https://dwo.base44.app';
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
    
    // ניקוי localStorage
    localStorage.removeItem('base44_access_token');
    localStorage.removeItem('base44_refresh_token');
    localStorage.removeItem('pending_oauth_provider');
    sessionStorage.clear();
    
    navigateToLogin();
  };

  const checkAuth = async () => {
    setIsLoadingAuth(true);
    setAuthError(null);
    
    try {
      const userData = await base44.auth.me();
      
      if (userData && userData.id) {
        setUser(userData);
        setIsAuthenticated(true);
        
        // ✅ ניקוי הטוקן מה-URL לאחר התחברות מוצלחת
        const url = new URL(window.location.href);
        if (url.searchParams.has('access_token')) {
          url.searchParams.delete('access_token');
          window.history.replaceState({}, document.title, url.pathname + url.search);
        }
      } else {
        throw new Error('Invalid user data');
      }
    } catch (error) {
      console.error('[AuthContext] Authentication failed:', error);
      const status = error.response?.status || 0;
      
      setUser(null);
      setIsAuthenticated(false);

      // ✅ אם הטוקן לא תקף, ננקה אותו
      if (status === 403 || status === 401) {
        localStorage.removeItem('base44_access_token');
        localStorage.removeItem('base44_refresh_token');
        setAuthError({ type: 'auth_required', message: 'Authentication required' });
      } else {
        setAuthError({ type: 'unknown', message: error.message });
      }
    } finally {
      setIsLoadingAuth(false);
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  return (
    <AuthContext.Provider value={{ 
      user,
      isAuthenticated, 
      isLoadingAuth,  // ✅ שם מתוקן
      isLoadingPublicSettings,
      appPublicSettings,
      authError,  // ✅ הוספה
      navigateToLogin,
      logout,
      checkAuth
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
