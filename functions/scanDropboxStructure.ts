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

async function decrypt(text: string) {
  if (!text) return null;
  const parts = text.split(':');
  if (parts.length !== 2) return text;
  const [ivHex, encryptedHex] = parts;
  const key = await getCryptoKey();
  const iv = new Uint8Array(ivHex.match(/.{1,2}/g)!.map((byte: string) => parseInt(byte, 16)));
  const encrypted = new Uint8Array(encryptedHex.match(/.{1,2}/g)!.map((byte: string) => parseInt(byte, 16)));
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, encrypted);
  return new TextDecoder().decode(decrypted);
}

async function refreshDropboxToken(refreshToken: string) {
  const appKey = Deno.env.get("DROPBOX_APP_KEY");
  const appSecret = Deno.env.get("DROPBOX_APP_SECRET");
  if (!appKey || !appSecret) throw new Error('DROPBOX credentials not configured');

  const creds = btoa(`${appKey}:${appSecret}`);
  const response = await fetch('https://api.dropboxapi.com/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${creds}`
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    }).toString()
  });

  const result = await response.json();
  if (result.error) throw new Error(`Token refresh failed: ${result.error_description || result.error}`);
  return result.access_token;
}

async function listDropboxFolder(accessToken: string, path: string) {
  const response = await fetch('https://api.dropboxapi.com/2/files/list_folder', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      path,
      include_media_info: false,
      include_deleted: false,
      include_has_explicit_shared_members: false
    })
  });

  const data = await response.json();
  if (data.error) return { entries: [], error: data.error };

  let entries = data.entries || [];
  let hasMore = data.has_more;
  let cursor = data.cursor;

  while (hasMore) {
    const contResponse = await fetch('https://api.dropboxapi.com/2/files/list_folder/continue', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ cursor })
    });
    const contData = await contResponse.json();
    if (contData.error) break;
    entries = entries.concat(contData.entries || []);
    hasMore = contData.has_more;
    cursor = contData.cursor;
  }

  return { entries };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const base44 = createClientFromRequest(req);

    // Verify admin role
    const currentUser = await base44.auth.me();
    if (!currentUser || !['admin', 'partner', 'super_admin'].includes(currentUser.role)) {
      throw new Error('Admin access required');
    }

    // Get Dropbox connection
    const connections = await base44.entities.IntegrationConnection.filter({
      provider: 'dropbox',
      is_active: true
    });

    if (!connections || connections.length === 0) {
      throw new Error('No active Dropbox connection found');
    }

    const connection = connections[0];
    const refreshToken = await decrypt(connection.refresh_token_encrypted);
    if (!refreshToken) throw new Error('No refresh token - reconnect Dropbox');

    const accessToken = await refreshDropboxToken(refreshToken);
    console.log('[ScanDropbox] Token refreshed, starting scan...');

    // Load all clients and cases from Base44
    const allClients = await base44.entities.Client.list('-created_date', 500);
    const allCases = await base44.entities.Case.list('-created_date', 2000);

    // Build lookup maps
    const clientByNumber: Record<string, any> = {};
    for (const client of allClients) {
      const num = (client.client_number || client.number || '').trim();
      if (num) clientByNumber[num] = client;
    }

    const casesByClientId: Record<string, any[]> = {};
    for (const c of allCases) {
      if (c.client_id) {
        if (!casesByClientId[c.client_id]) casesByClientId[c.client_id] = [];
        casesByClientId[c.client_id].push(c);
      }
    }

    // Scan root folder
    const rootPath = '/DWO/לקוחות - משרד';
    const rootResult = await listDropboxFolder(accessToken, rootPath);

    if (rootResult.error) {
      if (rootResult.error?.['.tag'] === 'path' && rootResult.error?.path?.['.tag'] === 'not_found') {
        return new Response(JSON.stringify({
          success: false,
          error: `Root folder "${rootPath}" not found in Dropbox`
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      throw new Error(`Dropbox API Error: ${JSON.stringify(rootResult.error)}`);
    }

    const clientFolders = rootResult.entries.filter((e: any) => e['.tag'] === 'folder');
    console.log(`[ScanDropbox] Found ${clientFolders.length} client folders`);

    const results = {
      total_folders: clientFolders.length,
      matched_clients: 0,
      unmatched_folders: [] as string[],
      matched_details: [] as any[],
      created_documents: 0,
    };

    // Process each client folder
    for (const folder of clientFolders) {
      const folderName = folder.name;
      // Try to extract client number from folder name (pattern: "NUMBER - NAME")
      const match = folderName.match(/^(\d+)\s*-\s*/);

      if (!match) {
        results.unmatched_folders.push(folderName);
        continue;
      }

      const clientNumber = match[1];
      const client = clientByNumber[clientNumber];

      if (!client) {
        results.unmatched_folders.push(folderName);
        continue;
      }

      results.matched_clients++;
      const clientCases = casesByClientId[client.id] || [];
      const caseByNumber: Record<string, any> = {};
      for (const c of clientCases) {
        if (c.case_number) caseByNumber[c.case_number.trim()] = c;
      }

      // Scan case subfolders
      const caseFolderResult = await listDropboxFolder(accessToken, folder.path_display);
      const caseSubfolders = (caseFolderResult.entries || []).filter((e: any) => e['.tag'] === 'folder');
      const caseFiles = (caseFolderResult.entries || []).filter((e: any) => e['.tag'] === 'file');

      let matchedCases = 0;
      let unmatchedCases: string[] = [];

      for (const caseSub of caseSubfolders) {
        const caseMatch = caseByNumber[caseSub.name.trim()];
        if (caseMatch) {
          matchedCases++;
        } else {
          unmatchedCases.push(caseSub.name);
        }
      }

      results.matched_details.push({
        folder_name: folderName,
        client_id: client.id,
        client_name: client.name,
        client_number: clientNumber,
        total_case_subfolders: caseSubfolders.length,
        matched_cases: matchedCases,
        unmatched_cases: unmatchedCases,
        root_files: caseFiles.length,
      });
    }

    console.log(`[ScanDropbox] Scan complete. Matched: ${results.matched_clients}/${results.total_folders}`);

    return new Response(JSON.stringify({
      success: true,
      ...results
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('[ScanDropbox] Error:', error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
