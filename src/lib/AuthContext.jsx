import React, { createContext, useState, useEffect, useContext } from 'react';
import { base44 } from '@/api/base44Client';
import { appParams } from './app-params';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  // משתנים לניהול מצב
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true); // משתנה טעינה ראשי אחד
  const [appPublicSettings, setAppPublicSettings] = useState(null);

  // פונקציית האימות הראשית - מוגנת לחלוטין
  const checkAuth = async () => {
    setIsLoading(true);
    
    try {
      // 1. נסיון למשוך משתמש
      console.log("Attempting to fetch user...");
      const userData = await base44.auth.me();
      
      if (userData) {
        console.log("User authenticated:", userData.id);
        setUser(userData);
        setIsAuthenticated(true);
        
        // 2. רק אם יש משתמש, ננסה למשוך הגדרות אפליקציה
        if (appParams.appId && base44.app_client) {
            try {
                const settings = await base44.app_client.get(`/prod/public-settings/by-id/${appParams.appId}`);
                setAppPublicSettings(settings);
            } catch (settingsError) {
                console.warn("Failed to load settings, continuing anyway:", settingsError);
            }
        }
      }
    } catch (error) {
      // ניתוח השגיאה
      const status = error.response?.status || 0;
      console.error(`Auth check failed with status ${status}:`, error);

      // איפוס המצב - המשתמש לא מחובר
      setUser(null);
      setIsAuthenticated(false);

      // אם זו שגיאת הרשאה חמורה (403) - ננקה את הזיכרון המקומי
      // זה פותר מצב של "טוקן תקוע"
      if (status === 403) {
        console.warn("Critical 403 Error: Clearing local storage to reset session.");
        localStorage.clear(); 
        sessionStorage.clear();
      }
    } finally {
      // חובה! שחרור הטעינה קורה תמיד, לא משנה מה קרה
      console.log("Auth check finished. Releasing Loading state.");
      setIsLoading(false);
    }
  };

  // הפעלה בטעינת הדף
  useEffect(() => {
    checkAuth();
  }, []);

  const navigateToLogin = () => {
      window.location.href = base44.auth.getLoginUrl();
  };

  const logout = async () => {
      try {
          await base44.auth.logout();
      } catch (e) { console.error(e); }
      setUser(null);
      setIsAuthenticated(false);
      localStorage.clear();
      navigateToLogin();
  };

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
