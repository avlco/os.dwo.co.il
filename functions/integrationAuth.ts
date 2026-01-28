// @ts-nocheck
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const APP_BASE_URL = "https://dwo.base44.app"; 
const REDIRECT_URI = `${APP_BASE_URL}/Settings`; 

// ✅ Encryption key validation
function validateEncryptionKey() {
  const key = Deno.env.get("ENCRYPTION_KEY");
  if (!key) {
    throw new Error("⚠️ CRITICAL: ENCRYPTION_KEY environment variable is not set!");
  }
  if (key.length < 32) {
    throw new Error(`⚠️ CRITICAL: ENCRYPTION_KEY must be at least 32 characters.`);
  }
}

try { validateEncryptionKey(); } catch (error) { console.error(error.message); }

function getProviderConfig(providerRaw) {
    const provider = providerRaw.toLowerCase().trim();
    if (provider === 'google') {
        const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
        const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
        if (!clientId || !clientSecret) throw new Error("Missing GOOGLE env vars");
        return { clientId, clientSecret, type: 'google' };
    }
    if (provider === 'dropbox') {
        const key = Deno.env.get("DROPBOX_APP_KEY");
        const secret = Deno.env.get("DROPBOX_APP_SECRET");
        if (!key || !secret) throw new Error("Missing DROPBOX env vars");
        return { key, secret, type: 'dropbox' };
    }
    throw new Error(`Unknown provider: ${providerRaw}`);
}

async function getCryptoKey() {
  const envKey = Deno.env.get("ENCRYPTION_KEY");
  if (!envKey) throw new Error("ENCRYPTION_KEY is missing");
  const encoder = new TextEncoder();
  const keyString = envKey.padEnd(32, '0').slice(0, 32);
  const keyBuffer = encoder.encode(keyString);
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
        console.error("[Encryption] Failed to encrypt token:", e);
        throw new Error(`Token encryption failed: ${e.message}`);
    }
}

async function handleRequest(req) {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) throw new Error("Unauthorized");
    
    // ⚠️ FIXED: Removed Admin check to allow lawyers to connect their own accounts
    // if (user.role !== 'admin') { throw new Error("Access Denied"); }

    let body;
    try { body = await req.json(); } catch (e) { throw new Error("Invalid JSON body"); }

    const { action, provider, code, state } = body;

    if (action === 'getAuthUrl') {
        const config = getProviderConfig(provider);
        let url;
        if (config.type === 'google') {
            const params = new URLSearchParams({
                client_id: config.clientId,
                redirect_uri: REDIRECT_URI,
                response_type: 'code',
                scope: 'https://www.googleapis.com/auth/gmail.readonly ' +
                      'https://www.googleapis.com/auth/gmail.send ' +
                      'https://www.googleapis.com/auth/gmail.labels ' +
                      'https://www.googleapis.com/auth/calendar ' +
                      'https://www.googleapis.com/auth/spreadsheets ' +
                      'https://www.googleapis.com/auth/drive.file',
                access_type: 'offline',
                prompt: 'consent', // Forces refresh token on every login
                state: state,
                include_granted_scopes: 'true'
            });
            url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
        } else {
            const params = new URLSearchParams({
                client_id: config.key,
                redirect_uri: REDIRECT_URI,
                response_type: 'code',
                token_access_type: 'offline',
                state: state
            });
            url = `https://www.dropbox.com/oauth2/authorize?${params.toString()}`;
        }
        return { authUrl: url };
    }

    if (action === 'handleCallback') {
        const config = getProviderConfig(provider);
        console.log(`[DEBUG] Callback for ${provider} | User: ${user.id}`);

        let tokenRes;
        if (config.type === 'google') {
            tokenRes = await fetch('https://oauth2.googleapis.com/token', {
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
        } else {
            const creds = btoa(`${config.key}:${config.secret}`);
            tokenRes = await fetch('https://api.dropboxapi.com/oauth2/token', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/x-www-form-urlencoded', 
                    'Authorization': `Basic ${creds}` 
                },
                body: new URLSearchParams({
                    code,
                    grant_type: 'authorization_code',
                    redirect_uri: REDIRECT_URI,
                }).toString(),
            });
        }

        const tokens = await tokenRes.json();
        if (tokens.error) throw new Error(`Provider Error: ${JSON.stringify(tokens)}`);

        const encryptedAccess = await encrypt(tokens.access_token);
        const encryptedRefresh = tokens.refresh_token ? await encrypt(tokens.refresh_token) : null;
        const expiresAt = Date.now() + ((tokens.expires_in || 3600) * 1000);

        // ⚠️ FIXED: Robust filtering to find existing connection
        console.log(`[DEBUG] Looking up existing connection for user ${user.id}...`);
        
        // Use .filter instead of .list for precise lookup
        const existingConnections = await base44.entities.IntegrationConnection.filter({
            user_id: user.id,
            provider: config.type
        });
        
        // Safety check if filter returns object with data or array
        const items = Array.isArray(existingConnections) ? existingConnections : (existingConnections.data || []);
        const itemToUpdate = items[0]; // Should be unique per user+provider

        const record = {
            user_id: user.id,
            provider: config.type,
            access_token_encrypted: encryptedAccess,
            expires_at: expiresAt,
            metadata: { 
                last_updated: new Date().toISOString(),
                gmail_sync: null // Reset sync state
            },
            is_active: true
        };

        if (itemToUpdate) {
            console.log(`[DEBUG] Updating existing connection: ${itemToUpdate.id}`);
            // Only overwrite refresh token if a new one was provided
            if (encryptedRefresh) {
                record.refresh_token_encrypted = encryptedRefresh;
            }
            await base44.entities.IntegrationConnection.update(itemToUpdate.id, record);
        } else {
            console.log(`[DEBUG] Creating NEW connection`);
            await base44.entities.IntegrationConnection.create({
                ...record,
                // If create, we must have a refresh token. If missing, we mark it.
                refresh_token_encrypted: encryptedRefresh || "MISSING"
            });
        }
        
        return { success: true };
    }

    throw new Error(`Unknown action: ${action}`);
}

Deno.serve(async (req) => {
    const headers = { 
        "Access-Control-Allow-Origin": "*", 
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Content-Type": "application/json"
    };
    if (req.method === "OPTIONS") return new Response(null, { headers });

    try {
        const result = await handleRequest(req);
        return new Response(JSON.stringify(result), { status: 200, headers });
    } catch (err) {
        console.error("Handler Error:", err);
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
    }
});