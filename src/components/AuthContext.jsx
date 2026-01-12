import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const checkAuth = useCallback(async () => {
    try {
      const userData = await base44.auth.me();
      setUser(userData);
      setIsAuthenticated(true);
    } catch (error) {
      console.log('User not authenticated');
      setUser(null);
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const logout = useCallback(() => {
    // מחיקה סלקטיבית - רק מה שקשור לאפליקציה שלנו
    const keysToRemove = [
      'pending_oauth_provider',
      'base44_token', 
      'user_preferences',
      'app_settings'
    ];
    
    keysToRemove.forEach(key => {
      try {
        localStorage.removeItem(key);
      } catch (e) {
        console.warn(`Failed to remove ${key}:`, e);
      }
    });

    // ניקוי sessionStorage (זה תמיד בטוח למחוק הכל)
    try {
      sessionStorage.clear();
    } catch (e) {
      console.warn('Failed to clear sessionStorage:', e);
    }

    // שימוש ב-logout של base44 שמטפל בהתנתקות מהשרת
    base44.auth.logout();
  }, []);

  const navigateToLogin = useCallback(() => {
    base44.auth.redirectToLogin(window.location.pathname);
  }, []);

  const value = {
    user,
    isLoading,
    isAuthenticated,
    logout,
    navigateToLogin,
    checkAuth
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};