// functions/updateCalendarEvent.ts
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

    const {
      google_event_id,
      title,
      description,
      start_date,
      event_timezone = 'Asia/Jerusalem',
      duration_minutes = 60,
      case_id,
      client_id,
      attendees = [],
      create_meet_link = false,
      all_day = false,
    } = body;

    if (!google_event_id) {
      throw new Error('google_event_id is required');
    }

    console.log('[Calendar] Updating event:', google_event_id);

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

    // Resolve attendee emails
    const attendeeEmails = [];
    for (const attendee of attendees) {
      if (attendee === 'client' && client_id) {
        try {
          const client = await base44.entities.Client.get(client_id);
          if (client?.email) {
            attendeeEmails.push({ email: client.email });
          }
        } catch (e) {
          console.error('[Calendar] Failed to get client:', e.message);
        }
      } else if (attendee === 'lawyer' && case_id) {
        try {
          const caseData = await base44.entities.Case.get(case_id);
          if (caseData?.assigned_lawyer_id) {
            const lawyer = await base44.entities.User.get(caseData.assigned_lawyer_id);
            if (lawyer?.email) {
              attendeeEmails.push({ email: lawyer.email });
            }
          }
        } catch (e) {
          console.error('[Calendar] Failed to get lawyer:', e.message);
        }
      } else if (attendee && attendee.includes('@')) {
        attendeeEmails.push({ email: attendee });
      }
    }

    // Build update payload
    const event = {};

    if (title !== undefined) event.summary = title;
    if (description !== undefined) event.description = description || '';

    if (start_date) {
      if (all_day) {
        const dateOnly = start_date.split('T')[0];
        const nextDay = new Date(dateOnly + 'T00:00:00');
        nextDay.setDate(nextDay.getDate() + 1);
        const endDateOnly = nextDay.toISOString().split('T')[0];
        event.start = { date: dateOnly };
        event.end = { date: endDateOnly };
      } else {
        const start = new Date(start_date);
        const end = new Date(start.getTime() + duration_minutes * 60 * 1000);
        event.start = { dateTime: start.toISOString(), timeZone: event_timezone };
        event.end = { dateTime: end.toISOString(), timeZone: event_timezone };
      }
    }

    if (attendeeEmails.length > 0) {
      event.attendees = attendeeEmails;
    }

    // Add Google Meet if requested
    if (create_meet_link) {
      event.conferenceData = {
        createRequest: {
          requestId: `meet-${Date.now()}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' }
        }
      };
    }

    console.log('[Calendar] Update payload:', JSON.stringify(event, null, 2));

    const calendarUrl = create_meet_link
      ? `https://www.googleapis.com/calendar/v3/calendars/primary/events/${google_event_id}?conferenceDataVersion=1`
      : `https://www.googleapis.com/calendar/v3/calendars/primary/events/${google_event_id}`;

    let response = await fetch(calendarUrl, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(event)
    });

    // Retry on 401 with token refresh
    if (response.status === 401 && refreshToken) {
      console.log('[Calendar] Token expired, refreshing...');
      accessToken = await refreshGoogleToken(refreshToken, connection.id, base44);
      response = await fetch(calendarUrl, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(event)
      });
    }

    if (!response.ok) {
      const errorData = await response.json();
      console.error('[Calendar] Google API error:', errorData);
      throw new Error(`Google Calendar API failed: ${errorData.error?.message || response.statusText}`);
    }

    const calendarEvent = await response.json();
    console.log('[Calendar] Event updated:', calendarEvent.id);

    return new Response(
      JSON.stringify({
        success: true,
        google_event_id: calendarEvent.id,
        htmlLink: calendarEvent.htmlLink,
        meetLink: calendarEvent.hangoutLink || null
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
