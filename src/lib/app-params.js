const isNode = typeof window === 'undefined';

// פונקציית עזר לחילוץ פרמטרים (משמשת גם קבצים אחרים)
export const getAppParamValue = (key) => {
  if (isNode) return undefined;
  return new URLSearchParams(window.location.search).get(key);
};

const getAppParams = () => {
  if (isNode) return {};

  const urlParams = new URLSearchParams(window.location.search);
  
  // Security Fix: קריאת הטוקן מה-URL ללא שמירה אוטומטית ל-LocalStorage
  const token = urlParams.get("access_token");

  return {
    // שמירה על תאימות למבנה שה-SDK מצפה לו
    appId: urlParams.get("app_id") || import.meta.env.VITE_BASE44_APP_ID,
    
    // הטוקן מועבר ל-Base44Client לאתחול, אך האחריות לשמירה (אם בכלל) עוברת ל-AuthContext
    token: token, 
    
    fromUrl: urlParams.get("from_url") || window.location.href,
    functionsVersion: import.meta.env.VITE_BASE44_FUNCTIONS_VERSION,
    appBaseUrl: import.meta.env.VITE_BASE44_APP_BASE_URL
  };
};

// ייצוא האובייקט הקריטי (חובה כדי למנוע קריסה)
export const appParams = {
  ...getAppParams()
};
