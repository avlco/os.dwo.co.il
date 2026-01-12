import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import * as crypto from './utils/crypto.ts';

// הגדרת משתני סביבה
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID");
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET");
const GOOGLE_REDIRECT_URI = Deno.env.get("GOOGLE_REDIRECT_URI");

const DROPBOX_APP_KEY = Deno.env.get("DROPBOX_APP_KEY");
const DROPBOX_APP_SECRET = Deno.env.get("DROPBOX_APP_SECRET");
const DROPBOX_REDIRECT_URI = Deno.env.get("DROPBOX_REDIRECT_URI");

// --- Helper Functions ---

async function getAuthUrl(provider: string, userId: string) {
  if (provider === 'google') {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_REDIRECT_URI) throw new Error("Missing Google Config");
    
    const scopes = [
      'https://www.googleapis.com/auth/gmail.modify',
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/spreadsheets',
    ];
    
    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: GOOGLE_REDIRECT_URI,
      response_type: 'code',
      scope: scopes.join(' '),
      access_type: 'offline', // חובה ל-Refresh Token
      prompt: 'consent',      // חובה כדי לקבל Refresh Token כל פעם מחדש
      state: userId,
      include_granted_scopes: 'true'
    });
    
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  } 
  
  if (provider === 'dropbox') {
    if (!DROPBOX_APP_KEY || !DROPBOX_REDIRECT_URI) throw new Error("Missing Dropbox Config");

    const params = new URLSearchParams({
      client_id: DROPBOX_APP_KEY,
      redirect_uri: DROPBOX_REDIRECT_URI,
      response_type: 'code',
      token_access_type: 'offline', // חובה ל-Refresh Token ב-Dropbox
      state: userId
    });

    return `https://www.dropbox.com/oauth2/authorize?${params.toString()}`;
  }

  throw new Error('Unsupported provider');
}

async function handleCallback(code: string, provider: string, userId: string, base44: any) {
  let tokens;
  
  if (provider === 'google') {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID!,
        client_secret: GOOGLE_CLIENT_SECRET!,
        redirect_uri: GOOGLE_REDIRECT_URI!,
        grant_type: 'authorization_code',
      }).toString(),
    });
    
    tokens = await response.json();
    if (tokens.error) throw new Error(tokens.error_description || JSON.stringify(tokens));
  } 
  else if (provider === 'dropbox') {
    // Dropbox Auth Code Exchange
    const credentials = btoa(`${DROPBOX_APP_KEY}:${DROPBOX_APP_SECRET}`);
    const response = await fetch('https://api.dropboxapi.com/oauth2/token', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`
      },
      body: new URLSearchParams({
        code,
        grant_type: 'authorization_code',
        redirect_uri: DROPBOX_REDIRECT_URI!,
      }).toString(),
    });

    tokens = await response.json();
    if (tokens.error) throw new Error(tokens.error_description || JSON.stringify(tokens));
  } else {
    throw new Error('Unsupported provider');
  }

  // הצפנת הטוקנים
  const encryptedAccessToken = await crypto.encrypt(tokens.access_token);
  const encryptedRefreshToken = tokens.refresh_token ? await crypto.encrypt(tokens.refresh_token) : null;

  // חישוב זמן תפוגה (במילישניות)
  const expiresAt = Date.now() + (tokens.expires_in * 1000);

  // בדיקה אם קיים חיבור
  const existingConnections = await base44.asServiceRole.entities.IntegrationConnection.filter({ 
    user_id: userId, 
    provider 
  });

  const connectionData = {
    user_id: userId,
    provider,
    access_token: encryptedAccessToken,
    expires_at: expiresAt,
    // אם לא קיבלנו רפרש טוקן חדש (קורה לפעמים), נשמור על הישן אם יש, או נעדכן לחדש אם קיבלנו
    ...(encryptedRefreshToken && { refresh_token: encryptedRefreshToken }),
    metadata: {
        last_updated: new Date().toISOString()
    }
  };

  if (existingConnections.length > 0) {
    // עדכון
    await base44.asServiceRole.entities.IntegrationConnection.update(existingConnections[0].id, connectionData);
  } else {
    // יצירה חדשה
    // בודקים שהרפרש טוקן קיים ביצירה ראשונית (קריטי)
    if (!encryptedRefreshToken && provider === 'google') {
       console.warn("Warning: No refresh token received on first connect!");
    }
    await base44.asServiceRole.entities.IntegrationConnection.create({
        ...connectionData,
        refresh_token: encryptedRefreshToken || "MISSING" // Fallback למניעת קריסה, אבל דורש טיפול
    });
  }
  
  return { success: true };
}

export async function getValidToken(userId: string, provider: 'google' | 'dropbox', base44: any): Promise<string> {
    const connections = await base44.asServiceRole.entities.IntegrationConnection.filter({ user_id: userId, provider });
    if (connections.length === 0) throw new Error(`No connection found for ${provider}`);
  
    let connection = connections[0];
    
    // אם הטוקן פג תוקף (או עומד לפוג ב-5 דקות הקרובות)
    if (Date.now() > (connection.expires_at - 300000)) {
        console.log(`Refreshing token for ${provider}...`);
        
        if (!connection.refresh_token) throw new Error(`Cannot refresh token for ${provider} - no refresh token available`);
        
        const refreshTokenDecrypted = await crypto.decrypt(connection.refresh_token);
        let newTokens;

        if (provider === 'google') {
            const response = await fetch('https://oauth2.googleapis.com/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    client_id: GOOGLE_CLIENT_ID!,
                    client_secret: GOOGLE_CLIENT_SECRET!,
                    refresh_token: refreshTokenDecrypted,
                    grant_type: 'refresh_token',
                }).toString(),
            });
            newTokens = await response.json();
        } else if (provider === 'dropbox') {
             const credentials = btoa(`${DROPBOX_APP_KEY}:${DROPBOX_APP_SECRET}`);
             const response = await fetch('https://api.dropboxapi.com/oauth2/token', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': `Basic ${credentials}`
                },
                body: new URLSearchParams({
                    refresh_token: refreshTokenDecrypted,
                    grant_type: 'refresh_token',
                }).toString(),
            });
            newTokens = await response.json();
        }

        if (newTokens.error) throw new Error(JSON.stringify(newTokens));

        // הצפנה ושמירה מחדש
        const newAccessTokenEnc = await crypto.encrypt(newTokens.access_token);
        const newExpiresAt = Date.now() + (newTokens.expires_in * 1000);
        
        await base44.asServiceRole.entities.IntegrationConnection.update(connection.id, {
            access_token: newAccessTokenEnc,
            expires_at: newExpiresAt,
            // לפעמים מקבלים רפרש טוקן חדש גם ברענון
            ...(newTokens.refresh_token ? { refresh_token: await crypto.encrypt(newTokens.refresh_token) } : {}) 
        });
        
        return newTokens.access_token;
    }

    // הטוקן עדיין בתוקף - רק לפענח ולהחזיר
    return await crypto.decrypt(connection.access_token);
}

// === MAIN ROUTER ===
Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { action, provider, code } = await req.json();
        const userId = user.id;

        if (!action) {
            return Response.json({ error: 'Missing action parameter' }, { status: 400 });
        }

        if (action === 'getAuthUrl') {
            if (!provider) {
                return Response.json({ error: 'Missing provider parameter' }, { status: 400 });
            }
            const url = await getAuthUrl(provider, userId);
            return Response.json({ authUrl: url });
        }
        
        if (action === 'handleCallback') {
            if (!provider || !code) {
                return Response.json({ error: 'Missing provider or code parameter' }, { status: 400 });
            }
            await handleCallback(code, provider, userId, base44);
            return Response.json({ success: true });
        }

        return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
    } catch (err) {
        console.error("Integration Auth Error:", err);
        return Response.json({ error: err.message || String(err) }, { status: 500 });
    }
});