/**
 * Gmail Sync Helper Functions
 * עזרים לניהול סנכרון חכם עם Gmail API
 */

/**
 * מחזיר תאריך של לפני שבוע
 */
export function getOneWeekAgo(): string {
  const date = new Date();
  date.setDate(date.getDate() - 7);
  return date.toISOString();
}

/**
 * ממיר תאריך ISO לפורמט של Gmail
 * @param isoDate - תאריך בפורמט ISO 8601
 * @returns תאריך בפורמט Gmail (YYYY/MM/DD)
 */
export function formatDateForGmail(isoDate: string): string {
  const date = new Date(isoDate);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}/${month}/${day}`;
}

/**
 * בונה שאילתת חיפוש ב-Gmail למיילים אחרי תאריך מסוים
 */
export function buildDateQuery(afterDate: string): string {
  const gmailDate = formatDateForGmail(afterDate);
  return `after:${gmailDate}`;
}

/**
 * מעדכן מטאדאטה של סנכרון ב-IntegrationConnection
 */
export async function updateSyncMetadata(
  connection: any,
  userBase44: any,
  updates: {
    history_id?: string;
    last_message_id?: string;
    last_sync_timestamp?: number;
    total_synced?: number;
    sync_mode?: string;
  }
) {
  const currentSync = connection.metadata?.gmail_sync || {};
  
  await userBase44.entities.IntegrationConnection.update(connection.id, {
    metadata: {
      ...connection.metadata,
      gmail_sync: {
        ...currentSync,
        ...updates,
        last_update_time: new Date().toISOString()
      }
    }
  });
  
  console.log(`[Sync Meta] Updated: ${JSON.stringify(updates)}`);
}

/**
 * מושך את ה-historyId האחרון מ-Gmail
 */
export async function getLatestHistoryId(accessToken: string): Promise<string | null> {
  try {
    const response = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=1',
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    
    const data = await response.json();
    if (!data.messages || data.messages.length === 0) {
      return null;
    }
    
    const messageId = data.messages[0].id;
    const detailResponse = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=minimal`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    
    const messageData = await detailResponse.json();
    return messageData.historyId;
  } catch (error) {
    console.error('[HistoryId] Failed to fetch:', error);
    return null;
  }
}

/**
 * ממיר מייל מ-Gmail לפורמט של ה-Mail entity
 */
export function parseGmailMessage(detailData: any) {
  const headers = detailData.payload?.headers || [];
  
  const subject = headers.find((h: any) => h.name === 'Subject')?.value || '(No Subject)';
  const from = headers.find((h: any) => h.name === 'From')?.value || 'Unknown';
  const to = headers.find((h: any) => h.name === 'To')?.value || '';
  const dateHeader = headers.find((h: any) => h.name === 'Date')?.value;
  
  // חילוץ אימייל שולח
  let senderEmail = from;
  const emailMatch = from.match(/<(.+)>/);
  if (emailMatch) {
    senderEmail = emailMatch[1];
  }
  
  // חילוץ שם שולח
  let senderName = from.replace(/<.+>/, '').trim();
  if (senderName === senderEmail) senderName = null;
  
  // חילוץ תוכן ומצורפים
  const body = extractEmailBody(detailData.payload);
  const attachments = extractAttachments(detailData.payload, detailData.id);
  
  return {
    subject,
    sender_email: senderEmail,
    sender_name: senderName,
    recipients: to ? [{ email: to }] : [],
    received_at: dateHeader ? new Date(dateHeader).toISOString() : new Date().toISOString(),
    content_snippet: detailData.snippet || "",
    external_id: detailData.id,
    processing_status: 'pending',
    source: 'gmail',
    body_plain: body.plain || detailData.snippet || "",
    body_html: body.html || null,
    attachments: attachments.length > 0 ? attachments : null,
    metadata: {
      labels: detailData.labelIds || [],
      thread_id: detailData.threadId,
      has_attachments: attachments.length > 0,
      history_id: detailData.historyId
    }
  };
}

/**
 * מחלץ את תוכן המייל (טקסט רגיל + HTML)
 */
function extractEmailBody(payload: any) {
  let plainText = null;
  let htmlText = null;
  
  function searchParts(part: any) {
    if (part.body?.data) {
      const decoded = decodeBase64(part.body.data);
      
      if (part.mimeType === 'text/plain' && !plainText) {
        plainText = decoded;
      } else if (part.mimeType === 'text/html' && !htmlText) {
        htmlText = decoded;
      }
    }
    
    if (part.parts) {
      for (const subPart of part.parts) {
        searchParts(subPart);
      }
    }
  }
  
  searchParts(payload);
  return { plain: plainText, html: htmlText };
}

/**
 * מפענח Base64 (Gmail משתמש ב-URL-safe Base64)
 */
function decodeBase64(data: string): string | null {
  if (!data) return null;
  try {
    const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
    return atob(base64);
  } catch (e) {
    console.error("[Base64] Decode error:", e);
    return null;
  }
}

/**
 * מחלץ קבצים מצורפים
 */
function extractAttachments(payload: any, messageId: string) {
  const attachments: any[] = [];
  
  function searchParts(part: any, depth = 0) {
    const indent = '  '.repeat(depth);
    
    if (part.filename && part.body?.attachmentId) {
      attachments.push({
        filename: part.filename,
        mimeType: part.mimeType || 'application/octet-stream',
        size: part.body.size || 0,
        attachmentId: part.body.attachmentId,
        messageId: messageId
      });
      console.log(`${indent}✅ Found attachment: ${part.filename}`);
    }
    
    if (part.parts) {
      for (const subPart of part.parts) {
        searchParts(subPart, depth + 1);
      }
    }
  }
  
  searchParts(payload);
  return attachments;
}
