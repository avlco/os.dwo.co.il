// @ts-nocheck
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const SHEET_ID = '1jmCeZQgJHIiCPy9HZo0XGOEl_xQyb23DPmhNehdrV54';
const SHEET_NAME = 'Financials';

// ========================================
// CRYPTO HELPERS (מועתק מ-sendEmail)
// ========================================
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
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('[SheetsSync] 🚀 Starting...');
    
    // ⭐ בדיוק כמו sendEmail!
    const base44 = createClientFromRequest(req);
    
    const { timeEntryId } = await req.json();
    console.log('[SheetsSync] TimeEntry ID:', timeEntryId);
    
    if (!timeEntryId) {
      throw new Error('timeEntryId is required');
    }

    // ⭐ בדיוק כמו sendEmail - שורות 47-50!
    console.log('[SheetsSync] 🔍 Looking for Google OAuth connection...');
    const gmailConnections = await base44.entities.IntegrationConnection.filter({
      provider: 'google',
      is_active: true
    });
    
    if (!gmailConnections || gmailConnections.length === 0) {
      throw new Error('No active Google connection found. Please connect via Settings.');
    }
    
    const connection = gmailConnections[0];
    console.log('[SheetsSync] ✅ Google connection found');
    
    // פענח את ה-access token (בדיוק כמו sendEmail)
    const accessToken = await decrypt(connection.access_token_encrypted);
    if (!accessToken) {
      throw new Error('Failed to decrypt Google access token');
    }
    console.log('[SheetsSync] ✅ Access token decrypted');

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
      userEmail = emailMatch[1];
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

    // בנה שורה
    const totalAmount = (timeEntry.hours || 0) * (timeEntry.rate || 0);
    const currency = '₪ + מע"מ';
    
    const row = [
      lawyer?.name || userEmail || '',
      client ? `${client.id} - ${client.name}` : '',
      caseData?.case_number || '',
      timeEntry.date_worked || new Date().toISOString().split('T')[0],
      timeEntry.hours || 0,
      'שעות',
      timeEntry.description || '',
      totalAmount,
      currency,
      timeEntry.invoice_id || '',
      ''
    ];

    console.log('[SheetsSync] Row data:', row);

    // שלח לגוגל שיטס
    const sheetsUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${SHEET_NAME}!A:K:append?valueInputOption=USER_ENTERED`;
    
    console.log('[SheetsSync] Sending to Google Sheets...');
    const response = await fetch(sheetsUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
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
