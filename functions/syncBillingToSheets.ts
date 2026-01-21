// @ts-nocheck
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const SHEET_ID = '1jmCeZQgJHIiCPy9HZo0XGOEl_xQyb23DPmhNehdrV54';
const SHEET_NAME = 'Financials';

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
    
    const base44 = createClientFromRequest(req);
    const { timeEntryId } = await req.json();
    
    if (!timeEntryId) {
      throw new Error('timeEntryId is required');
    }

    // Google OAuth connection
    const gmailConnections = await base44.entities.IntegrationConnection.filter({
      provider: 'google',
      is_active: true
    });
    
    if (!gmailConnections || gmailConnections.length === 0) {
      throw new Error('No active Google connection found.');
    }
    
    const connection = gmailConnections[0];
    const accessToken = await decrypt(connection.access_token_encrypted);

    // Fetch TimeEntry
    const timeEntry = await base44.entities.TimeEntry.get(timeEntryId);
    if (!timeEntry) throw new Error(`TimeEntry not found: ${timeEntryId}`);

    // Fetch Case
    let caseData = null;
    if (timeEntry.case_id) {
      try { caseData = await base44.entities.Case.get(timeEntry.case_id); } catch (e) {}
    }

    // Fetch Client
    let client = null;
    if (caseData?.client_id) {
      try { client = await base44.entities.Client.get(caseData.client_id); } catch (e) {}
    }

    // Fetch Lawyer
    let lawyerName = '';
    if (caseData?.assigned_lawyer_id) {
      try {
        const lawyer = await base44.entities.User.get(caseData.assigned_lawyer_id);
        lawyerName = lawyer?.full_name || lawyer?.email || '';
      } catch (e) {}
    }
    
    if (!lawyerName && timeEntry.user_email) {
      let userEmail = timeEntry.user_email;
      const emailMatch = userEmail.match(/<(.+?)>/);
      if (emailMatch) userEmail = emailMatch[1];
      lawyerName = userEmail;
    }

    let clientDisplay = '';
    if (client) {
      const clientNumber = client.client_number || client.number || client.client_id || '';
      clientDisplay = clientNumber ? `${clientNumber} - ${client.name}` : client.name;
    }

    // ✅ FIX: Format date nicely for Sheets (Day.Month.Year Hour:Min)
    let formattedDate = timeEntry.date_worked;
    try {
      if (timeEntry.date_worked) {
        formattedDate = new Date(timeEntry.date_worked).toLocaleString('he-IL', {
          timeZone: 'Asia/Tel_Aviv',
          day: '2-digit', month: '2-digit', year: 'numeric',
          hour: '2-digit', minute: '2-digit', hour12: false
        }).replace(',', '');
      }
    } catch (e) {
      console.warn('Date formatting failed, using raw:', e);
    }

    const totalAmount = (timeEntry.hours || 0) * (timeEntry.rate || 0);
    const row = [
      lawyerName,
      clientDisplay,
      caseData?.case_number || '',
      formattedDate, // ✅ Using formatted date
      timeEntry.hours || 0,
      'שעות',
      timeEntry.description || '',
      totalAmount,
      '₪ + מע"מ',
      timeEntry.invoice_id || '',
      ''
    ];

    console.log('[SheetsSync] Row data:', row);

    // Send to Sheets
    const sheetsUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${SHEET_NAME}!A:K:append?valueInputOption=USER_ENTERED`;
    
    const response = await fetch(sheetsUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values: [row] })
    });

    if (!response.ok) {
      throw new Error(`Google Sheets API failed: ${await response.text()}`);
    }

    return new Response(JSON.stringify({ success: true, timeEntryId: timeEntry.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[SheetsSync] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});