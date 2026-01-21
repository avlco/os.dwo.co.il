// @ts-nocheck
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const SHEET_ID = 'YOUR_GOOGLE_SHEET_ID_HERE'; // ⭐ שים את ה-ID האמיתי!
const API_KEY = Deno.env.get('GOOGLE_SHEETS_API_KEY');

Deno.serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('[SheetsSync] 🚀 Starting...');
    
    const base44 = createClientFromRequest(req);
    
    // קבל TimeEntry ID
    const { timeEntryId } = await req.json();
    console.log('[SheetsSync] TimeEntry ID:', timeEntryId);
    
    if (!timeEntryId) {
      throw new Error('timeEntryId is required');
    }

    // ⭐ בדוק שיש API Key
    if (!API_KEY) {
      throw new Error('GOOGLE_SHEETS_API_KEY is missing in environment variables');
    }

    // שלוף TimeEntry
    const timeEntry = await base44.entities.TimeEntry.get(timeEntryId);
    if (!timeEntry) {
      throw new Error(`TimeEntry not found: ${timeEntryId}`);
    }
    console.log('[SheetsSync] ✅ TimeEntry found');

    // שלוף Case
    let caseData = null;
    if (timeEntry.case_id) {
      try {
        caseData = await base44.entities.Case.get(timeEntry.case_id);
        console.log('[SheetsSync] ✅ Case found:', caseData?.case_number);
      } catch (e) {
        console.error('[SheetsSync] Failed to get case:', e.message);
      }
    }

    // שלוף Client
    let client = null;
    if (caseData?.client_id) {
      try {
        client = await base44.entities.Client.get(caseData.client_id);
        console.log('[SheetsSync] ✅ Client found:', client?.name);
      } catch (e) {
        console.error('[SheetsSync] Failed to get client:', e.message);
      }
    }

    // חלץ email נקי
    let userEmail = timeEntry.user_email || '';
    const emailMatch = userEmail.match(/<(.+?)>/);
    if (emailMatch) {
      userEmail = emailMatch[1]; // חלץ רק את האימייל
    }

    // שלוף User (עו"ד)
    let lawyer = null;
    if (userEmail) {
      try {
        const users = await base44.entities.User.filter({ email: userEmail });
        lawyer = users?.[0] || null;
        console.log('[SheetsSync] ✅ Lawyer found:', lawyer?.name);
      } catch (e) {
        console.error('[SheetsSync] Failed to get user:', e.message);
      }
    }

    // 🔥 בנה שורה
    const row = [
      lawyer?.name || userEmail || '', // שם עו״ד
      client ? `${client.id} - ${client.name}` : '', // לקוח
      caseData?.case_number || '', // מס׳ תיק
      timeEntry.date_worked || new Date().toISOString().split('T')[0], // תאריך
      timeEntry.hours || 0, // סה"כ שעות
      'שעות', // יחידה
      timeEntry.description || '', // פירוט
      (timeEntry.hours || 0) * (timeEntry.rate || 0), // סה"כ לחיוב
      '₪ + מע"מ', // מטבע
      timeEntry.invoice_id || '', // חשבון עסקה
      '' // הערות
    ];

    console.log('[SheetsSync] Row data:', row);

    // שלח לגוגל
    const sheetsUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/A:K:append?valueInputOption=USER_ENTERED&key=${API_KEY}`;
    
    console.log('[SheetsSync] Sending to Google Sheets...');
    const response = await fetch(sheetsUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        values: [row]
      })
    });

    const responseText = await response.text();
    console.log('[SheetsSync] Google response status:', response.status);
    console.log('[SheetsSync] Google response:', responseText);

    if (!response.ok) {
      throw new Error(`Google Sheets API failed (${response.status}): ${responseText}`);
    }

    const result = JSON.parse(responseText);

    return new Response(JSON.stringify({
      success: true,
      timeEntryId: timeEntry.id,
      sheetsResponse: result
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[SheetsSync] ❌ Error:', error.message);
    console.error('[SheetsSync] Stack:', error.stack);
    return new Response(JSON.stringify({
      error: error.message,
      stack: error.stack
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
