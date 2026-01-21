// functions/createCalendarEvent.ts
// @ts-nocheck
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function getCryptoKey() {
  const envKey = Deno.env.get("ENCRYPTION_KEY");
  if (!envKey) throw new Error("ENCRYPTION_KEY is missing");
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
    const body = await req.json();
    
    const { 
      title, 
      description, 
      start_date, 
      duration_minutes = 60,
      case_id, 
      client_id,
      reminder_minutes = 1440
    } = body;

    console.log('[Calendar] Creating event:', title);

    // Get Google OAuth connection (same as syncBillingToSheets)
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

    // Calculate end_date
    const start = new Date(start_date);
    const end = new Date(start.getTime() + duration_minutes * 60 * 1000);

    // Build event
    const event = {
      summary: title,
      description: description || '',
      start: {
        dateTime: start.toISOString(),
        timeZone: 'Asia/Tel_Aviv'
      },
      end: {
        dateTime: end.toISOString(),
        timeZone: 'Asia/Tel_Aviv'
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: reminder_minutes }
        ]
      }
    };

    console.log('[Calendar] Sending to Google API...');

    // Send to Google Calendar API
    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(event)
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Google Calendar API failed: ${errorData.error?.message || response.statusText}`);
    }

    const calendarEvent = await response.json();
    console.log('[Calendar] ✅ Event created:', calendarEvent.id);

    return new Response(
      JSON.stringify({ 
        success: true, 
        google_event_id: calendarEvent.id,
        htmlLink: calendarEvent.htmlLink 
      }),
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
