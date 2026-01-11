import React, { createContext, useState, useEffect, useContext } from 'react';
import { base44 } from '@/api/base44Client';
import { appParams } from './app-params';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [appPublicSettings, setAppPublicSettings] = useState(null);

  const checkAppState = async () => {
    if (!appParams.appId) {
      setIsLoadingPublicSettings(false);
      return;
    }

    try {
      if (base44.app_client) {
          const publicSettings = await base44.app_client.get(`/prod/public-settings/by-id/${appParams.appId}`);
          setAppPublicSettings(publicSettings);
      }
    } catch (appError) {
      // FIX: Safe access to error response structure
      const status = appError.response?.status || appError.status;
      const data = appError.response?.data || appError.data;

      if (status === 403 && data?.extra_data?.reason === 'user_not_registered') {
        setAuthError({ type: 'user_not_registered' });
      }
    } finally {
      setIsLoadingPublicSettings(false);
    }
  };

  const checkAuth = async () => {
    try {
      const user = await base44.auth.me();
      setIsAuthenticated(!!user);
      if (user) {
        await checkAppState();
      }
    } catch (error) {
      // FIX: Safe access here as well
      const status = error.response?.status || error.status;
      if (status === 401) {
         setAuthError({ type: 'auth_required' });
      }
      setIsAuthenticated(false);
    } finally {
      setIsLoadingAuth(false);
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  const navigateToLogin = () => {
      if (typeof window !== 'undefined') {
          window.location.href = base44.auth.getLoginUrl();
      }
  };

  return (
    <AuthContext.Provider value={{ 
      isAuthenticated, 
      isLoadingAuth, 
      isLoadingPublicSettings, 
      authError,
      appPublicSettings,
      navigateToLogin 
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
