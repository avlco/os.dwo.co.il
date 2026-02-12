// functions/syncGoogleCalendar.ts
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

function extractTimeFromDateTime(isoString) {
  if (!isoString) return null;
  const date = new Date(isoString);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function extractDateFromDateTime(isoString) {
  if (!isoString) return null;
  const date = new Date(isoString);
  return date.toISOString().split('T')[0];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const base44 = createClientFromRequest(req);

    console.log('[CalSync] Starting Google Calendar sync...');

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

    // Get stored syncToken
    const syncToken = connection.metadata?.calendar_sync_token;

    // Build Google Calendar events.list request
    let calendarUrl = 'https://www.googleapis.com/calendar/v3/calendars/primary/events?';
    const params = new URLSearchParams({
      singleEvents: 'true',
      maxResults: '250',
    });

    if (syncToken) {
      // Incremental sync
      params.set('syncToken', syncToken);
      console.log('[CalSync] Using syncToken for incremental sync');
    } else {
      // Initial sync - get events from last 30 days forward
      const timeMin = new Date();
      timeMin.setDate(timeMin.getDate() - 30);
      params.set('timeMin', timeMin.toISOString());
      console.log('[CalSync] Initial sync from', timeMin.toISOString());
    }

    calendarUrl += params.toString();

    let allEvents = [];
    let nextPageToken = null;
    let nextSyncToken = null;

    // Paginate through results
    do {
      let pageUrl = calendarUrl;
      if (nextPageToken) {
        pageUrl += `&pageToken=${nextPageToken}`;
      }

      const response = await fetch(pageUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        }
      });

      if (response.status === 410) {
        // Sync token expired, do full sync
        console.log('[CalSync] SyncToken expired, performing full sync');
        const timeMin = new Date();
        timeMin.setDate(timeMin.getDate() - 30);
        const freshParams = new URLSearchParams({
          singleEvents: 'true',
          maxResults: '250',
          timeMin: timeMin.toISOString(),
        });
        const freshResponse = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events?${freshParams.toString()}`,
          { headers: { 'Authorization': `Bearer ${accessToken}` } }
        );
        const freshData = await freshResponse.json();
        allEvents = freshData.items || [];
        nextSyncToken = freshData.nextSyncToken;
        nextPageToken = null;
        break;
      }

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Google Calendar API failed: ${errorData.error?.message || response.statusText}`);
      }

      const data = await response.json();
      allEvents = allEvents.concat(data.items || []);
      nextPageToken = data.nextPageToken;
      nextSyncToken = data.nextSyncToken;
    } while (nextPageToken);

    console.log(`[CalSync] Received ${allEvents.length} events from Google`);

    // Get all local deadlines with google_event_id
    const allDeadlines = await base44.entities.Deadline.list('-created_date', 2000);
    const deadlineByGoogleId = {};
    for (const d of allDeadlines) {
      if (d.metadata?.google_event_id) {
        deadlineByGoogleId[d.metadata.google_event_id] = d;
      }
    }

    let created = 0;
    let updated = 0;
    let deleted = 0;

    for (const event of allEvents) {
      const googleEventId = event.id;
      const existingDeadline = deadlineByGoogleId[googleEventId];

      if (event.status === 'cancelled') {
        // Event was deleted in Google Calendar
        if (existingDeadline) {
          console.log(`[CalSync] Deleting local event: ${googleEventId}`);
          await base44.entities.Deadline.delete(existingDeadline.id);
          deleted++;
        }
        continue;
      }

      // Extract event data
      const isAllDay = !!event.start?.date && !event.start?.dateTime;
      const startDate = isAllDay
        ? event.start.date
        : extractDateFromDateTime(event.start?.dateTime);
      const startTime = isAllDay ? null : extractTimeFromDateTime(event.start?.dateTime);
      const endTime = isAllDay ? null : extractTimeFromDateTime(event.end?.dateTime);

      const eventData = {
        entry_type: 'event',
        title: event.summary || '',
        description: event.description || '',
        due_date: startDate,
        start_time: startTime,
        end_time: endTime,
        all_day: isAllDay,
        event_type: 'meeting',
        color: 'blue',
        status: 'pending',
        location: event.location || '',
        attendees: (event.attendees || []).map(a => a.email),
        metadata: {
          google_event_id: googleEventId,
          html_link: event.htmlLink || '',
          meet_link: event.hangoutLink || '',
          source: 'google_sync',
        },
      };

      if (existingDeadline) {
        // Update existing
        console.log(`[CalSync] Updating local event: ${googleEventId}`);
        await base44.entities.Deadline.update(existingDeadline.id, eventData);
        updated++;
      } else {
        // Create new
        console.log(`[CalSync] Creating local event from Google: ${googleEventId}`);
        await base44.entities.Deadline.create(eventData);
        created++;
      }
    }

    // Store the new syncToken
    if (nextSyncToken) {
      const updatedMetadata = {
        ...(connection.metadata || {}),
        calendar_sync_token: nextSyncToken,
        last_calendar_sync: new Date().toISOString(),
      };
      await base44.entities.IntegrationConnection.update(connection.id, {
        metadata: updatedMetadata,
      });
      console.log('[CalSync] Saved new syncToken');
    }

    console.log(`[CalSync] Sync complete: ${created} created, ${updated} updated, ${deleted} deleted`);

    return new Response(
      JSON.stringify({
        success: true,
        created,
        updated,
        deleted,
        total_processed: allEvents.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[CalSync] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
