// @ts-nocheck
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// --- קונפיגורציה ואבטחה ---
const STATIC_KEY = "my-secret-key-1234567890123456"; // חובה שיהיה זהה בכל המערכת
const APP_BASE_URL = "https://os.dwo.co.il"; 
const REDIRECT_URI = `${APP_BASE_URL}/Settings`; 

// פונקציית עזר לבדיקת תקינות הסביבה (Health Check)
function validateEnv(provider) {
    if (provider === 'google') {
        const id = Deno.env.get("GOOGLE_CLIENT_ID");
        const secret = Deno.env.get("GOOGLE_CLIENT_SECRET");
        if (!id || !secret) {
            console.error("[Config Error] Missing Google Env Vars");
            throw new Error("שרת לא מוגדר: חסרים מפתחות התחברות לגוגל (GOOGLE_CLIENT_ID/SECRET).");
        }
        return { clientId: id, clientSecret: secret };
    }
    if (provider === 'dropbox') {
        const key = Deno.env.get("DROPBOX_APP_KEY");
        const secret = Deno.env.get("DROPBOX_APP_SECRET");
        if (!key || !secret) {
            console.error("[Config Error] Missing Dropbox Env Vars");
            throw new Error("שרת לא מוגדר: חסרים מפתחות התחברות לדרופבוקס.");
        }
        return { key, secret };
    }
    throw new Error(`ספק לא נתמך: ${provider}`);
}

async function getCryptoKey() {
  const encoder = new TextEncoder();
  const keyBuffer = encoder.encode(STATIC_KEY);
  return await crypto.subtle.importKey("raw", keyBuffer, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function encrypt(text) {
    try {
        const key = await getCryptoKey();
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encoded = new TextEncoder().encode(text);
        const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
        const ivHex = Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join('');
        const encryptedHex = Array.from(new Uint8Array(encrypted)).map(b => b.toString(16).padStart(2, '0')).join('');
        return `${ivHex}:${encryptedHex}`;
    } catch (e) {
        console.error("Encryption Logic Error:", e);
        throw new Error("שגיאת אבטחה פנימית: נכשל תהליך הצפנת הטוקן.");
    }
}

// --- לוגיקה עסקית ---

async function getAuthUrl(provider, state) {
  console.log(`[OAuth Init] Provider: ${provider}`);
  const config = validateEnv(provider); // יזרוק שגיאה אם חסר

  if (provider === 'google') {
    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/drive.file',
      access_type: 'offline', // קריטי לקבלת Refresh Token
      prompt: 'consent',
      state: state,
      include_granted_scopes: 'true'
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  } 
  
  if (provider === 'dropbox') {
    const params = new URLSearchParams({
      client_id: config.key,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      token_access_type: 'offline',
      state: state
    });
    return `https://www.dropbox.com/oauth2/authorize?${params.toString()}`;
  }
}

async function handleCallback(code, provider, userId, base44) {
  console.log(`[OAuth Callback] Processing for user ${userId}, provider ${provider}`);
  const config = validateEnv(provider);
  let tokens;
  
  try {
      if (provider === 'google') {
        const res = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code,
            client_id: config.clientId,
            client_secret: config.clientSecret,
            redirect_uri: REDIRECT_URI,
            grant_type: 'authorization_code',
          }).toString(),
        });
        tokens = await res.json();
      } else if (provider === 'dropbox') {
        const credentials = btoa(`${config.key}:${config.secret}`);
        const res = await fetch('https://api.dropboxapi.com/oauth2/token', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${credentials}`
          },
          body: new URLSearchParams({
            code,
            grant_type: 'authorization_code',
            redirect_uri: REDIRECT_URI,
          }).toString(),
        });
        tokens = await res.json();
      }
  } catch (netErr) {
      console.error("Network Error during token exchange:", netErr);
      throw new Error("שגיאת תקשורת מול ספק האימות (Google/Dropbox). נסה שנית.");
  }

  if (!tokens || tokens.error) {
    console.error("Provider Token Error:", tokens);
    const errMsg = tokens?.error_description || tokens?.error || "תשובה לא תקינה מהספק";
    throw new Error(`דחייה מצד הספק: ${errMsg}`);
  }

  // הצפנה ושמירה
  const encryptedAccess = await encrypt(tokens.access_token);
  const encryptedRefresh = tokens.refresh_token ? await encrypt(tokens.refresh_token) : null;
  const expiresAt = Date.now() + ((tokens.expires_in || 3600) * 1000); 

  try {
      // שימוש ב-ServiceRole לעקיפת בעיות הרשאה (RLS)
      const existing = await base44.asServiceRole.entities.IntegrationConnection.filter({ user_id: userId, provider });
      
      const data = {
        user_id: userId,
        provider,
        access_token: encryptedAccess,
        expires_at: expiresAt, 
        metadata: { last_updated: new Date().toISOString() }
      };

      if (encryptedRefresh) data.refresh_token = encryptedRefresh;

      if (existing.length > 0) {
        await base44.asServiceRole.entities.IntegrationConnection.update(existing[0].id, data);
        console.log("DB: Updated existing connection.");
      } else {
        await base44.asServiceRole.entities.IntegrationConnection.create({
            ...data,
            refresh_token: encryptedRefresh || "MISSING" // סימון לדיבוג אם לא התקבל refresh token
        });
        console.log("DB: Created new connection.");
      }
  } catch (dbErr) {
      console.error("Database Save Error:", dbErr);
      throw new Error("שגיאת מסד נתונים: לא ניתן לשמור את החיבור.");
  }
}

Deno.serve(async (req) => {
    // CORS Headers חיוניים
    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Content-Type": "application/json"
    };

    if (req.method === "OPTIONS") return new Response(null, { headers });

    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        if (!user) return new Response(JSON.stringify({ error: 'גישה נדחתה: עליך להתחבר למערכת.' }), { status: 401, headers });

        const body = await req.json();
        const { action, provider, code, state } = body;

        if (action === 'getAuthUrl') {
            const url = await getAuthUrl(provider, state || user.id);
            return new Response(JSON.stringify({ authUrl: url }), { status: 200, headers });
        }
        
        if (action === 'handleCallback') {
            await handleCallback(code, provider, user.id, base44);
            return new Response(JSON.stringify({ success: true }), { status: 200, headers });
        }

        return new Response(JSON.stringify({ error: `פעולה לא מזוהה: ${action}` }), { status: 400, headers });

    } catch (err) {
        console.error("Critical Function Error:", err);
        // מחזירים את הודעת השגיאה האמיתית למשתמש!
        return new Response(JSON.stringify({ error: err.message || String(err) }), { status: 500, headers });
    }
});
