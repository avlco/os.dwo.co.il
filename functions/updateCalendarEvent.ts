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
    const accessToken = await decrypt(connection.access_token_encrypted);

    if (!accessToken) {
      throw new Error('Failed to decrypt access token');
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
      const start = new Date(start_date);
      const end = new Date(start.getTime() + duration_minutes * 60 * 1000);
      event.start = { dateTime: start.toISOString(), timeZone: event_timezone };
      event.end = { dateTime: end.toISOString(), timeZone: event_timezone };
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

    const response = await fetch(calendarUrl, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(event)
    });

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
