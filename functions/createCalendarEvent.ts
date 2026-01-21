// functions/createCalendarEvent.ts
// @ts-nocheck
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
      duration_minutes = 60,  // default 1 שעה
      case_id, 
      client_id,
      reminder_minutes = 1440  // 24 שעות לפני
    } = body;

    // שלוף Gmail integration (כמו ב-syncBillingToSheets)
    const gmailIntegration = await base44.integrations.Gmail.get();
    if (!gmailIntegration?.access_token) {
      throw new Error('No Gmail integration found');
    }

    // חשב end_date
    const start = new Date(start_date);
    const end = new Date(start.getTime() + duration_minutes * 60 * 1000);

    // בנה event
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

    // שלח ל-Google Calendar API
    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${calendarIntegration.access_token}`,
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
    
    // שמור Activity במערכת לצורך tracking
    await base44.entities.Activity.create({
      activity_type: 'calendar_event_created',
      title: `אירוע קלנדר נוצר: ${title}`,
      case_id: case_id || null,
      client_id: client_id || null,
      status: 'completed',
      metadata: {
        google_event_id: calendarEvent.id,
        start_date: start_date,
        duration_minutes: duration_minutes
      }
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        google_event_id: calendarEvent.id,
        htmlLink: calendarEvent.htmlLink 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[createCalendarEvent] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
