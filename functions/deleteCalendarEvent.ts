// functions/deleteCalendarEvent.ts
// @ts-nocheck
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function getCryptoKey() {
  const envKey = Deno.env.get("SECRET_KEY_ENCRYPTION");
  if (!envKey) throw new Error("SECRET_KEY_ENCRYPTION is missing");
  const encoder = new TextEncoder();
  const keyString = envKey.padEnd(32, '0').slice(0, 32);
  const keyBuffer = encoder.encode(keyString);
  return await crypto.subtle.importKey("raw", keyBuffer, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function decrypt(text) {
  if (!text) return null;
  const parts = text.split(':');
  if (parts.length !== 2) return text;

  const [ivHex, encryptedHex] = parts;
  const key = await getCryptoKey();

  const iv = new Uint8Array(ivHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
  const encrypted = new Uint8Array(encryptedHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));

  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, encrypted);
  return new TextDecoder().decode(decrypted);
}

async function encrypt(text) {
  const key = await getCryptoKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(text);
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  const ivHex = Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join('');
  const encryptedHex = Array.from(new Uint8Array(encrypted)).map(b => b.toString(16).padStart(2, '0')).join('');
  return `${ivHex}:${encryptedHex}`;
}

async function refreshGoogleToken(refreshToken, connectionId, base44) {
  console.log('[Calendar] Refreshing expired Google token...');
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  if (!clientId || !clientSecret) throw new Error('Missing Google Client ID/Secret env vars');

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }).toString(),
  });

  const data = await res.json();
  if (data.error) throw new Error(`Token refresh failed: ${JSON.stringify(data)}`);

  const newAccessToken = data.access_token;
  const encryptedAccess = await encrypt(newAccessToken);
  await base44.entities.IntegrationConnection.update(connectionId, {
    access_token_encrypted: encryptedAccess,
  });
  console.log('[Calendar] Token refreshed and saved');
  return newAccessToken;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const base44 = createClientFromRequest(req);
    const rawBody = await req.json();
    const body = rawBody.body || rawBody;

    const { google_event_id } = body;

    if (!google_event_id) {
      throw new Error('google_event_id is required');
    }

    console.log('[Calendar] Deleting event:', google_event_id);

    // Get Google OAuth connection
    const gmailConnections = await base44.entities.IntegrationConnection.filter({
      provider: 'google',
      is_active: true
    });

    if (!gmailConnections || gmailConnections.length === 0) {
      throw new Error('No active Google connection found.');
    }

    const connection = gmailConnections[0];
    let accessToken = await decrypt(connection.access_token_encrypted);
    const refreshToken = connection.refresh_token_encrypted
      ? await decrypt(connection.refresh_token_encrypted)
      : null;

    if (!accessToken && !refreshToken) {
      throw new Error('No access or refresh token available - reconnect Google');
    }

    if (!accessToken && refreshToken) {
      accessToken = await refreshGoogleToken(refreshToken, connection.id, base44);
    }

    const calendarUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${google_event_id}`;

    let response = await fetch(calendarUrl, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      }
    });

    // Retry on 401 with token refresh
    if (response.status === 401 && refreshToken) {
      console.log('[Calendar] Token expired, refreshing...');
      accessToken = await refreshGoogleToken(refreshToken, connection.id, base44);
      response = await fetch(calendarUrl, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        }
      });
    }

    // 204 No Content = success, 410 Gone = already deleted
    if (response.status === 204 || response.status === 410) {
      console.log('[Calendar] Event deleted:', google_event_id);
      return new Response(
        JSON.stringify({ success: true, google_event_id }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!response.ok) {
      const errorData = await response.json();
      console.error('[Calendar] Google API error:', errorData);
      throw new Error(`Google Calendar API failed: ${errorData.error?.message || response.statusText}`);
    }

    return new Response(
      JSON.stringify({ success: true, google_event_id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Calendar] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
