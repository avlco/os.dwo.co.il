import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';

const { appId, token, functionsVersion, appBaseUrl } = appParams;

// ✅ פונקציה לשליפה ושמירה של Token
const getAuthToken = () => {
  // 1. אם יש טוקן ב-URL (מגיע אחרי login), שמור אותו
  if (token) {
    localStorage.setItem('base44_access_token', token);
    return token;
  }
  
  // 2. אחרת, נסה לשלוף מ-localStorage
  const storedToken = localStorage.getItem('base44_access_token');
  if (storedToken) {
    return storedToken;
  }
  
  // 3. אם אין - החזר null (המשתמש יופנה ל-login)
  return null;
};

const authToken = getAuthToken();

// ✅ יצירת Client עם הטוקן הנכון
export const base44 = createClient({
  appId,
  token: authToken,
  functionsVersion,
  serverUrl: '',
  requiresAuth: true,  // ✅ שונה מ-false ל-true
  appBaseUrl
});

// ✅ ייצוא פונקציות עזר לבדיקת Authentication
export const isAuthenticated = () => {
  return !!localStorage.getItem('base44_access_token');
};

export const clearAuth = () => {
  localStorage.removeItem('base44_access_token');
  localStorage.removeItem('base44_refresh_token');
};
