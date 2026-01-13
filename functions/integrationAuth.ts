import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// --- Section 1: Inlined Crypto Logic ---
// לוגיקת הצפנה פנימית (חובה שתהיה כאן כדי למנוע קריסות של תלויות חיצוניות)

async function getCryptoKey() {
  const keyString = Deno.env.get("ENCRYPTION_KEY");
  if (!keyString) {
      console.warn("Missing ENCRYPTION_KEY, using fallback (NOT SECURE for production)");
      return await crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
      );
  }
  
  const encoder = new TextEncoder();
  // חיתוך או ריפוד המפתח ל-32 תווים בדיוק (דרישת AES-256)
  const keyBuffer = encoder.encode(keyString.padEnd(32, '0').slice(0, 32));
  
  return await crypto.subtle.importKey("raw", keyBuffer, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function encrypt(text: string): Promise<string> {
    try {
        const key = await getCryptoKey();
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encoded = new TextEncoder().encode(text);
        const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
        const ivHex = Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join('');
        const encryptedHex = Array.from(new Uint8Array(encrypted)).map(b => b.toString(16).padStart(2, '0')).join('');
        return `${ivHex}:${encryptedHex}`;
    } catch (e) {
        console.error("Encryption failed:", e);
        throw new Error("Failed to encrypt token");
    }
}

async function decrypt(text: string): Promise<string> {
  try {
    const [ivHex, encryptedHex] = text.split(':');
    if (!ivHex || !encryptedHex) throw new Error("Invalid encrypted format");
    const key = await getCryptoKey();
    const iv = new Uint8Array(ivHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
    const encrypted = new Uint8Array(encryptedHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, encrypted);
    return new TextDecoder().decode(decrypted);
  } catch (e) {
    console.error("Decryption failed:", e);
    throw new Error("Failed to decrypt token");
  }
}

// --- Section 2: Integration Logic ---

const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID");
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET");

const DROPBOX_APP_KEY = Deno.env.get("DROPBOX_APP_KEY");
const DROPBOX_APP_SECRET = Deno.env.get("DROPBOX_APP_SECRET");

// קבלת origin מהקריאה
async function getAuthUrl(provider: string, state: string, origin: string) {
  // שימוש בכתובת שהגיעה מהלקוח לבניית ה-Redirect URI
  const redirectUri = `${origin}/Settings`; 
  console.log(`Generating Auth URL for ${provider}. State: ${state}, Redirect: ${redirectUri}`);

  if (provider === 'google') {
    if (!GOOGLE_CLIENT_ID) throw new Error("Missing Google Config (GOOGLE_CLIENT_ID)");
    
    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: [
        'https://www.googleapis.com/auth/gmail.modify',
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/drive.file',
        'https://www.googleapis.com/auth/spreadsheets'
      ].join(' '),
      access_type: 'offline',
      prompt: 'consent',
      state: state,
      include_granted_scopes: 'true'
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  } 
  
  if (provider === 'dropbox') {
    if (!DROPBOX_APP_KEY) throw new Error("Missing Dropbox Config (DROPBOX_APP_KEY)");
    const params = new URLSearchParams({
      client_id: DROPBOX_APP_KEY,
      redirect_uri: redirectUri,
      response_type: 'code',
      token_access_type: 'offline',
      state: state
    });
    return `https://www.dropbox.com/oauth2/authorize?${params.toString()}`;
  }

  throw new Error(`Unsupported provider: ${provider}`);
}

// קבלת origin מהקריאה
async function handleCallback(code: string, provider: string, userId: string, base44: any, origin: string) {
  const redirectUri = `${origin}/Settings`; // חובה להיות זהה למה שנשלח ב-getAuthUrl
  console.log(`Handling callback for ${provider}. Redirect: ${redirectUri}`);
  
  let tokens;
  
  if (provider === 'google') {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID!,
        client_secret: GOOGLE_CLIENT_SECRET!,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }).toString(),
    });
    tokens = await res.json();
  } else if (provider === 'dropbox') {
    const credentials = btoa(`${DROPBOX_APP_KEY}:${DROPBOX_APP_SECRET}`);
    const res = await fetch('https://api.dropboxapi.com/oauth2/token', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`
      },
      body: new URLSearchParams({
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }).toString(),
    });
    tokens = await res.json();
  }

  if (!tokens || tokens.error) {
    console.error("Provider Token Error:", tokens);
    throw new Error(`Provider Error: ${tokens?.error_description || JSON.stringify(tokens)}`);
  }

  // הצפנת הטוקנים
  const encryptedAccess = await encrypt(tokens.access_token);
  const encryptedRefresh = tokens.refresh_token ? await encrypt(tokens.refresh_token) : null;
  const expiresAt = Date.now() + ((tokens.expires_in || 3600) * 1000); 

  // בדיקה אם קיים חיבור
  const existing = await base44.entities.IntegrationConnection.filter({ user_id: userId, provider });

  const data = {
    user_id: userId,
    provider,
    access_token: encryptedAccess,
    expires_at: expiresAt, 
    metadata: { last_updated: new Date().toISOString() }
  };

  if (encryptedRefresh) {
    Object.assign(data, { refresh_token: encryptedRefresh });
  }

  // עדכון או יצירה
  if (existing.length > 0) {
    await base44.entities.IntegrationConnection.update(existing[0].id, data);
  } else {
    await base44.entities.IntegrationConnection.create({
        ...data,
        refresh_token: encryptedRefresh || "MISSING_REFRESH_TOKEN"
    });
  }
  console.log(`Successfully connected ${provider} for user ${userId}`);
}

// === MAIN ENTRY POINT ===
Deno.serve(async (req) => {
    // CORS Headers - קריטי כדי שהדפדפן לא יחסום את הבקשה
    const headers = new Headers({
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Content-Type": "application/json"
    });

    if (req.method === "OPTIONS") {
        return new Response(null, { headers });
    }

    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        if (!user) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers });
        }

        const body = await req.json();
        // חילוץ ה-origin והנתונים האחרים מהבקשה
        const { action, provider, code, state, origin } = body;

        // Fallback למקרה שהקליינט לא שלח origin (או לשימוש ישיר), נשתמש במשתנה הסביבה או ברירת מחדל
        const effectiveOrigin = origin || Deno.env.get("APP_BASE_URL") || "https://dwo.base44.app";

        // ניתוב הפעולות
        if (action === 'getAuthUrl') {
            const url = await getAuthUrl(provider, state || user.id, effectiveOrigin);
            return new Response(JSON.stringify({ authUrl: url }), { status: 200, headers });
        }
        
        if (action === 'handleCallback') {
            await handleCallback(code, provider, user.id, base44, effectiveOrigin);
            return new Response(JSON.stringify({ success: true }), { status: 200, headers });
        }

        return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers });

    } catch (err: any) {
        console.error("Function Error:", err);
        return new Response(JSON.stringify({ error: err.message || String(err) }), { status: 500, headers });
    }
});
