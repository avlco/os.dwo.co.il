// @ts-nocheck
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// מנקה תווים לא חוקיים משם התיקייה
function sanitizeFolderName(name) {
  if (!name) return '';
  return name
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const base44 = createClientFromRequest(req);
    const { client_name, client_number } = await req.json();

    if (!client_name || !client_number) {
      throw new Error('client_name and client_number are required');
    }

    console.log('[CreateClientFolder] Starting for:', client_name);

    // שליפת חיבור Dropbox מה-SDK
    const dropboxIntegration = await base44.integrations.Dropbox.get();
    
    if (!dropboxIntegration?.access_token) {
      throw new Error('No Dropbox integration found');
    }

    // ניקוי שמות
    const safeNumber = sanitizeFolderName(client_number);
    const safeName = sanitizeFolderName(client_name);

    // בניית נתיב התיקייה
    const folderPath = `/DWO/לקוחות - משרד/${safeNumber} - ${safeName}`;

    console.log('[CreateClientFolder] Creating folder:', folderPath);

    // יצירת התיקייה ב-Dropbox
    const response = await fetch('https://api.dropboxapi.com/2/files/create_folder_v2', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${dropboxIntegration.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        path: folderPath,
        autorename: false
      })
    });

    const result = await response.json();

    if (!response.ok) {
      // אם התיקייה כבר קיימת - זה בסדר
      if (result.error?.['.tag'] === 'path' && 
          result.error?.path?.['.tag'] === 'conflict') {
        console.log('[CreateClientFolder] Folder already exists');
        return new Response(JSON.stringify({
          success: true,
          message: 'Folder already exists',
          path: folderPath
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      throw new Error(`Dropbox API error: ${JSON.stringify(result.error)}`);
    }

    console.log('[CreateClientFolder] Success!');

    return new Response(JSON.stringify({
      success: true,
      path: result.metadata?.path_display || folderPath
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[CreateClientFolder] Error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
