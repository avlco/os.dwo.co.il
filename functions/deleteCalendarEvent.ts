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
    const accessToken = await decrypt(connection.access_token_encrypted);

    if (!accessToken) {
      throw new Error('Failed to decrypt access token');
    }

    const calendarUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${google_event_id}`;

    const response = await fetch(calendarUrl, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      }
    });

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
