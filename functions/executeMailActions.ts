import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// ========================================
// 1. DWO EMAIL DESIGN SYSTEM (EMBEDDED)
// ========================================

const BRAND = {
  colors: {
    primary: '#b62f12',    // DWO Red
    secondary: '#545454',  // DWO Dark Gray
    bg: '#f3f4f6',         // Light Grey Background
    card: '#ffffff',       // White Card
    text: '#000000',       // Black Text
    textLight: '#545454',  // Metadata Text
    link: '#b62f12'        // Link
  },
  logoUrl: 'https://dwo.co.il/wp-content/uploads/2020/04/Drori-Stav-logo-2.png', 
  appUrl: 'https://os.dwo.co.il'
};

function generateEmailLayout(contentHtml, title) {
  const t = {
    footer_contact: 'DWO - משרד עורכי דין | www.dwo.co.il',
    footer_disclaimer: 'הודעה זו מכילה מידע סודי ומוגן. אם קיבלת הודעה זו בטעות, אנא מחק אותה ודווח לשולח.'
  };

  return `
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body { margin: 0; padding: 0; background-color: ${BRAND.colors.bg}; font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
    .email-wrapper { padding: 20px; }
    .email-container { max-width: 600px; margin: 0 auto; background-color: ${BRAND.colors.card}; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }
    .header { background-color: ${BRAND.colors.card}; padding: 20px; text-align: center; border-bottom: 3px solid ${BRAND.colors.primary}; }
    .content { padding: 30px 25px; color: ${BRAND.colors.text}; line-height: 1.6; text-align: right; font-size: 16px; }
    .footer { background-color: #f8fafc; padding: 20px; text-align: center; font-size: 12px; color: ${BRAND.colors.textLight}; border-top: 1px solid #e2e8f0; }
    a { color: ${BRAND.colors.link}; text-decoration: none; }
    .logo { height: 50px; width: auto; max-width: 200px; object-fit: contain; }
  </style>
</head>
<body dir="rtl">
  <div class="email-wrapper">
    <div class="email-container">
      <div class="header">
         <img src="${BRAND.logoUrl}" alt="DWO Logo" class="logo" />
      </div>
      <div class="content">
        ${contentHtml}
      </div>
      <div class="footer">
        <p style="margin: 0 0 10px 0;">${t.footer_contact}</p>
        <p style="margin: 0; opacity: 0.7;">${t.footer_disclaimer}</p>
      </div>
    </div>
  </div>
</body>
</html>`.trim();
}

// ========================================
// 2. EMBEDDED AUTH & CRYPTO LOGIC (Replaces integrationAuth import)
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

async function encrypt(text) {
  const key = await getCryptoKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(text);
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  const ivHex = Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join('');
  const encryptedHex = Array.from(new Uint8Array(encrypted)).map(b => b.toString(16).padStart(2, '0')).join('');
  return `${ivHex}:${encryptedHex}`;
}

async function refreshOAuthToken(provider, refreshToken) {
  let url, body;
  
  if (provider === 'google') {
    url = 'https://oauth2.googleapis.com/token';
    body = new URLSearchParams({
      client_id: Deno.env.get("GOOGLE_CLIENT_ID"),
      client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET"),
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    });
  } else if (provider === 'dropbox') {
    url = 'https://api.dropbox.com/oauth2/token';
    const creds = btoa(`${Deno.env.get("DROPBOX_APP_KEY")}:${Deno.env.get("DROPBOX_APP_SECRET")}`);
    body = new URLSearchParams({
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    });
    // Dropbox requires Basic Auth header for refresh
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Authorization': `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body
    });
    const data = await response.json();
    if (data.error) throw new Error(`Dropbox Refresh Error: ${JSON.stringify(data)}`);
    return data;
  } else {
    throw new Error(`Unknown provider: ${provider}`);
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body
  });
  
  const data = await response.json();
  if (data.error) throw new Error(`${provider} Refresh Error: ${JSON.stringify(data)}`);
  return data;
}

/**
 * Gets a valid access token, refreshing if necessary
 */
async function getValidToken(base44, userId, provider) {
  // 1. Fetch connection
  const connections = await base44.asServiceRole.entities.IntegrationConnection.filter({
    user_id: userId,
    provider: provider,
    is_active: true
  });
  
  if (!connections || connections.length === 0) {
    throw new Error(`${provider} not connected for user ${userId}`);
  }
  
  const conn = connections[0];
  const now = Date.now();
  
  // 2. Check Expiry (buffer of 60 seconds)
  if (conn.expires_at && now < conn.expires_at - 60000) {
    return await decrypt(conn.access_token_encrypted);
  }
  
  // 3. Refresh Token
  console.log(`[Auth] Refreshing token for ${provider}`);
  if (!conn.refresh_token_encrypted) throw new Error(`No refresh token for ${provider}`);
  
  const refreshToken = await decrypt(conn.refresh_token_encrypted);
  const newTokens = await refreshOAuthToken(provider, refreshToken);
  
  // 4. Update DB
  const newAccessEnc = await encrypt(newTokens.access_token);
  const updates = {
    access_token_encrypted: newAccessEnc,
    expires_at: Date.now() + ((newTokens.expires_in || 3600) * 1000),
    metadata: { ...conn.metadata, last_refreshed: new Date().toISOString() }
  };
  
  // If a new refresh token is returned (sometimes happens), update it too
  if (newTokens.refresh_token) {
    updates.refresh_token_encrypted = await encrypt(newTokens.refresh_token);
  }
  
  await base44.asServiceRole.entities.IntegrationConnection.update(conn.id, updates);
  
  return newTokens.access_token;
}

// ========================================
// 3. SERVICE LOGIC (Dropbox, Calendar, Sheets)
// ========================================

function sanitizeDropboxName(name) {
  if (!name) return 'Unknown';
  return name.replace(/[\\/:*?"<>|]/g, '_').trim() || 'Unknown';
}

async function ensureDropboxFolder(accessToken, folderPath) {
  try {
    const response = await fetch('https://api.dropboxapi.com/2/files/create_folder_v2', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: folderPath, autorename: false }),
    });
    const data = await response.json();
    if (data.error?.path?.['.tag'] === 'conflict') return { exists: true, path: folderPath };
    if (data.error) throw new Error(data.error_summary || 'Failed to create folder');
    return { created: true, path: data.metadata?.path_display || folderPath };
  } catch (error) {
    if (error.message?.includes('conflict')) return { exists: true, path: folderPath };
    throw error;
  }
}

async function uploadToDropbox(accessToken, filePath, fileContent) {
  const response = await fetch('https://content.dropboxapi.com/2/files/upload', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Dropbox-API-Arg': JSON.stringify({ path: filePath, mode: 'add', autorename: true, mute: false }),
      'Content-Type': 'application/octet-stream',
    },
    body: fileContent,
  });
  const data = await response.json();
  if (data.error) throw new Error(data.error_summary || 'Failed to upload file');
  return data;
}

async function createDropboxSharedLink(accessToken, filePath) {
  let response = await fetch('https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: filePath, settings: { requested_visibility: 'public', audience: 'public', access: 'viewer' } }),
  });
  let data = await response.json();
  if (data.error?.['.tag'] === 'shared_link_already_exists') {
    response = await fetch('https://api.dropboxapi.com/2/sharing/list_shared_links', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: filePath, direct_only: true }),
    });
    data = await response.json();
    if (data.links && data.links.length > 0) return data.links[0].url;
  }
  return data.url;
}

async function downloadFile(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to download file: ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

function formatDateIsraeli(date) {
  const d = new Date(date);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

async function createCalendarEvent(accessToken, eventData) {
  const response = await fetch(
    'https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1',
    {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(eventData),
    }
  );
  const data = await response.json();
  if (data.error) throw new Error(data.error.message || 'Failed to create calendar event');
  return { eventId: data.id, htmlLink: data.htmlLink, hangoutLink: data.hangoutLink };
}

async function syncToSheet(accessToken, spreadsheetId, range, values) {
  if (!spreadsheetId) return null;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [values] }),
  });
  const data = await response.json();
  if (data.error) throw new Error(data.error.message || 'Failed to append to sheet');
  return data;
}

async function getUserSpreadsheetId(base44, userId) {
  const connections = await base44.asServiceRole.entities.IntegrationConnection.filter({
    user_id: userId,
    provider: 'google',
    is_active: true,
  });
  return connections.length > 0 ? connections[0].metadata?.spreadsheet_id : null;
}

// ========================================
// 4. MAIN HANDLER
// ========================================

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { task_id, selected_actions, case_id, client_id } = await req.json();
    if (!task_id) return Response.json({ error: 'task_id is required' }, { status: 400 });

    const tasks = await base44.entities.Task.filter({ id: task_id });
    if (!tasks || tasks.length === 0) return Response.json({ error: 'Task not found' }, { status: 404 });
    const task = tasks[0];
    const mail = task.mail_id ? (await base44.entities.Mail.filter({ id: task.mail_id }))[0] : null;

    const executedActions = [];
    const errors = [];

    for (const action of (selected_actions || [])) {
      try {
        switch (action.action_type) {
          case 'log_time':
            if (action.hours && case_id) {
              const clients = await base44.entities.Client.filter({ id: client_id });
              const hourlyRate = clients[0]?.hourly_rate || 0;
              const timeEntry = await base44.entities.TimeEntry.create({
                case_id: case_id,
                task_id: task_id,
                description: action.action_label || `Time logged from mail processing`,
                hours: action.hours,
                rate: hourlyRate,
                is_billable: true,
                date_worked: new Date().toISOString().split('T')[0],
                billed: false
              });
              executedActions.push({ type: 'log_time', id: timeEntry.id, hours: action.hours, rate: hourlyRate });
            }
            break;

          case 'create_deadline':
            if (case_id) {
              const dueDate = new Date();
              dueDate.setDate(dueDate.getDate() + (action.days_offset || 30));
              const deadline = await base44.entities.Deadline.create({
                case_id: case_id,
                deadline_type: action.deadline_type || 'custom',
                description: action.action_label || 'Deadline from mail processing',
                due_date: dueDate.toISOString().split('T')[0],
                status: 'pending',
                is_critical: false,
                assigned_to_email: user.email
              });
              executedActions.push({ type: 'create_deadline', id: deadline.id });
            }
            break;

          case 'create_task':
            const newTask = await base44.entities.Task.create({
              case_id: case_id || null,
              client_id: client_id || null,
              task_type: action.task_type || 'custom',
              title: action.task_title || action.action_label || 'New Task',
              description: `Created from mail processing`,
              status: 'pending',
              priority: 'medium',
              assigned_to_email: user.email
            });
            executedActions.push({ type: 'create_task', id: newTask.id });
            break;

          case 'attach_document':
            executedActions.push({ type: 'attach_document', status: 'pending_manual' });
            break;

          case 'upload_to_dropbox':
            if (case_id && mail?.attachments?.length > 0 && action.dropbox_folder_path) {
              try {
                const dropboxToken = await getValidToken(base44, user.id, 'dropbox');
                const cases = await base44.entities.Case.filter({id: case_id});
                const clients = await base44.entities.Client.filter({id: client_id});
                
                const clientName = sanitizeDropboxName(clients[0]?.name);
                const caseNumber = sanitizeDropboxName(cases[0]?.case_number);
                
                const folderPath = action.dropbox_folder_path
                  .replace('{{client_name}}', clientName)
                  .replace('{{case_number}}', caseNumber);
                
                await ensureDropboxFolder(dropboxToken, folderPath);
                
                for (const attachment of mail.attachments) {
                  if (!attachment.url) continue;
                  const fileContent = await downloadFile(attachment.url);
                  const filePath = `${folderPath}/${sanitizeDropboxName(attachment.filename)}`;
                  const uploadResult = await uploadToDropbox(dropboxToken, filePath, fileContent);
                  const sharedUrl = await createDropboxSharedLink(dropboxToken, uploadResult.path_display);
                  
                  executedActions.push({ 
                    type: 'upload_to_dropbox', 
                    filename: attachment.filename, 
                    destination: uploadResult.path_display,
                    dropbox_url: sharedUrl,
                    status: 'success'
                  });
                }
              } catch (dropboxError) {
                console.error('Dropbox upload error:', dropboxError);
                errors.push({ action: 'upload_to_dropbox', error: dropboxError.message });
              }
            }
            break;
          
          case 'create_calendar_event':
            if (case_id && action.calendar_event_template) {
              try {
                const googleToken = await getValidToken(base44, user.id, 'google');
                const cases = await base44.entities.Case.filter({id: case_id});
                const currentCase = cases[0];
                
                const eventTitle = (action.calendar_event_template.title_template || 'פגישה חדשה')
                  .replace('{{case_number}}', currentCase?.case_number || 'N/A')
                  .replace('{{mail_subject}}', mail?.subject || 'N/A');
                
                const eventDescription = (action.calendar_event_template.description_template || '')
                  .replace('{{case_number}}', currentCase?.case_number || 'N/A')
                  .replace('{{mail_subject}}', mail?.subject || 'N/A');
                
                const startDate = new Date(action.event_date || Date.now() + 86400000);
                if (!action.event_date) startDate.setHours(10, 0, 0, 0);
                const endDate = new Date(startDate.getTime() + 3600000); // 1 hour
                
                const eventData = {
                  summary: eventTitle,
                  description: `${eventDescription}\n\nנוצר אוטומטית ע"י Office OS`,
                  start: { dateTime: startDate.toISOString(), timeZone: 'Asia/Jerusalem' },
                  end: { dateTime: endDate.toISOString(), timeZone: 'Asia/Jerusalem' },
                  conferenceData: {
                    createRequest: { requestId: `officeos-${Date.now()}`, conferenceSolutionKey: { type: 'hangoutsMeet' } },
                  },
                };
                
                const calendarResult = await createCalendarEvent(googleToken, eventData);
                executedActions.push({ 
                  type: 'create_calendar_event', 
                  title: eventTitle,
                  event_id: calendarResult.eventId,
                  calendar_link: calendarResult.htmlLink,
                  meet_link: calendarResult.hangoutLink,
                  status: 'success'
                });
              } catch (calendarError) {
                console.error('Calendar event error:', calendarError);
                errors.push({ action: 'create_calendar_event', error: calendarError.message });
              }
            }
            break;

          case 'send_email':
            if (mail?.sender_email && action.auto_reply_template) {
              const clients = await base44.entities.Client.filter({id: client_id});
              
              // 1. Prepare Content
              const rawBody = action.auto_reply_template
                .replace('{{client_name}}', clients[0]?.name || mail.sender_name || 'Client')
                .replace('{{mail_subject}}', mail?.subject || 'Your inquiry');
              
              const formattedBody = `<div style="white-space: pre-wrap; font-family: 'Segoe UI', Arial, sans-serif; color: ${BRAND.colors.text};">${rawBody}</div>`;

              // 2. Wrap with DWO Design System
              const finalHtml = generateEmailLayout(formattedBody, `מענה אוטומטי: ${mail?.subject || ''}`);
              
              // 3. Send via Custom Function (Gmail/SMTP)
              const emailResult = await base44.functions.invoke('sendEmail', {
                to: mail.sender_email,
                subject: `Re: ${mail.subject || 'Your Inquiry'}`,
                body: finalHtml
              });

              if (emailResult.error) throw new Error(`Failed to send email: ${emailResult.error}`);
              executedActions.push({ type: 'send_email', to: mail.sender_email, status: 'success' });
            }
            break;

          case 'update_case_status':
            if (case_id && action.new_status) {
              await base44.entities.Case.update(case_id, { status: action.new_status });
              executedActions.push({ type: 'update_case_status', new_status: action.new_status });
            }
            break;

          case 'create_invoice_draft':
            if (client_id) {
              const clients = await base44.entities.Client.filter({ id: client_id });
              const extractedAmount = task.extracted_data?.amount || 0;
              const invoiceNumber = `INV-${Date.now()}`;
              
              const invoice = await base44.entities.Invoice.create({
                invoice_number: invoiceNumber,
                client_id: client_id,
                issued_date: new Date().toISOString().split('T')[0],
                due_date: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
                currency: 'ILS',
                subtotal: extractedAmount,
                tax_rate: 17,
                tax_amount: extractedAmount * 0.17,
                total: extractedAmount * 1.17,
                status: 'draft',
                paid_amount: 0,
                line_items: case_id ? [{
                  case_id: case_id,
                  description: action.invoice_description || `Legal services - ${mail?.subject || 'General'}`,
                  quantity: 1,
                  unit_price: extractedAmount,
                  amount: extractedAmount
                }] : [],
                notes: `Auto-generated from mail processing: ${mail?.subject || ''}`
              });
              
              // Sync to Google Sheets
              try {
                const spreadsheetId = await getUserSpreadsheetId(base44, user.id);
                if (spreadsheetId) {
                  const googleToken = await getValidToken(base44, user.id, 'google');
                  await syncToSheet(googleToken, spreadsheetId, "'Financials'!A1", [
                    formatDateIsraeli(new Date()),
                    clients[0]?.name || 'N/A',
                    extractedAmount * 1.17,
                    invoiceNumber,
                    'טיוטה'
                  ]);
                }
              } catch (sheetsError) { console.warn('Sheets sync error:', sheetsError.message); }
              
              executedActions.push({ type: 'create_invoice_draft', id: invoice.id, invoice_number: invoiceNumber, amount: extractedAmount });
            }
            break;
        }
      } catch (actionError) {
        errors.push({ action: action.action_type, error: actionError.message });
      }
    }

    const executionLog = executedActions.map(action => ({
      action_type: action.type,
      status: action.status || 'success',
      executed_at: new Date().toISOString(),
      result_id: action.id,
      result_url: action.dropbox_url || action.calendar_link || null,
      details: action
    }));

    errors.forEach(err => executionLog.push({ action_type: err.action, status: 'error', executed_at: new Date().toISOString(), error: err.error }));

    const existingExtractedData = task.extracted_data || {};
    await base44.entities.Task.update(task_id, {
      status: 'completed',
      completed_at: new Date().toISOString(),
      case_id: case_id || task.case_id,
      client_id: client_id || task.client_id,
      extracted_data: { ...existingExtractedData, execution_log: [...(existingExtractedData.execution_log || []), ...executionLog] }
    });

    if (task.mail_id) {
      await base44.entities.Mail.update(task.mail_id, {
        processing_status: 'processed',
        related_case_id: case_id || null,
        related_client_id: client_id || null
      });
    }

    return Response.json({ success: true, task_id, executed_actions: executedActions, errors: errors.length > 0 ? errors : undefined });

  } catch (error) {
    console.error('Error executing actions:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});