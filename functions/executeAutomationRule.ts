import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

Deno.serve(async (req) => {
  try {
    const { mail_id } = await req.json();
    
    if (!mail_id) {
      return new Response(JSON.stringify({ error: 'mail_id is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log(`[Automation] Processing mail_id: ${mail_id}`);

    // 1. שלוף את המייל
    const { data: mail, error: mailError } = await supabase
      .from('Mail')
      .select('*')
      .eq('id', mail_id)
      .single();

    if (mailError || !mail) {
      throw new Error(`Mail not found: ${mailError?.message}`);
    }

    console.log(`[Automation] Mail found: ${mail.subject}`);

    // 2. שלוף את כל החוקים הפעילים
    const { data: rules, error: rulesError } = await supabase
      .from('AutomationRule')
      .select('*')
      .eq('is_active', true)
      .order('created_date', { ascending: false });

    if (rulesError) {
      throw new Error(`Failed to fetch rules: ${rulesError.message}`);
    }

    console.log(`[Automation] Found ${rules?.length || 0} active rules`);

    // 3. בדוק אילו חוקים תואמים (CATCH)
    const matchedRules = (rules || []).filter(rule => matchesCatchCriteria(mail, rule.catch_config));

    console.log(`[Automation] ${matchedRules.length} rules matched`);

    if (matchedRules.length === 0) {
      return new Response(JSON.stringify({ 
        matched: 0, 
        message: 'No matching rules',
        mail_id 
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 4. הרץ כל חוק שהתאים
    const results = [];
    for (const rule of matchedRules) {
      console.log(`[Automation] Executing rule: ${rule.name}`);
      const result = await executeRule(supabase, mail, rule);
      results.push(result);
    }

    return new Response(JSON.stringify({ 
      matched: matchedRules.length, 
      results,
      mail_id 
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[Automation] Execution error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});

// ===== CATCH: בדיקת התאמה =====
function matchesCatchCriteria(mail, catchConfig) {
  if (!catchConfig) return false;

  // Check sender
  if (catchConfig.senders && catchConfig.senders.length > 0) {
    const senderMatch = catchConfig.senders.some(sender =>
      mail.sender_email?.toLowerCase().includes(sender.toLowerCase())
    );
    if (!senderMatch) {
      console.log(`[Automation] Sender mismatch: ${mail.sender_email}`);
      return false;
    }
  }

  // Check subject
  if (catchConfig.subject_contains) {
    if (!mail.subject?.toLowerCase().includes(catchConfig.subject_contains.toLowerCase())) {
      console.log(`[Automation] Subject mismatch: ${mail.subject}`);
      return false;
    }
  }

  // Check body
  if (catchConfig.body_contains) {
    if (!mail.body_text?.toLowerCase().includes(catchConfig.body_contains.toLowerCase())) {
      console.log(`[Automation] Body mismatch`);
      return false;
    }
  }

  return true;
}

// ===== MAP: חילוץ מזהים =====
function extractIdentifiers(mail, mapConfig) {
  const extracted = {};

  if (!mapConfig || mapConfig.length === 0) return extracted;

  for (const mapRow of mapConfig) {
    const searchText = mapRow.source === 'subject' ? mail.subject : mail.body_text;
    if (!searchText || !mapRow.anchor_text) continue;

    // חיפוש טקסט עוגן
    const anchorIndex = searchText.indexOf(mapRow.anchor_text);
    if (anchorIndex === -1) continue;

    // חילוץ הערך שאחרי הטקסט עוגן
    const afterAnchor = searchText.substring(anchorIndex + mapRow.anchor_text.length).trim();
    const extractedValue = afterAnchor.split(/[\s,;]/)[0]; // לוקח את המילה/מספר הראשון

    extracted[mapRow.target_field] = extractedValue;
    console.log(`[Automation] Extracted ${mapRow.target_field}: ${extractedValue}`);
  }

  return extracted;
}

// ===== EXECUTE RULE: הרצת חוק אחד =====
async function executeRule(supabase, mail, rule) {
  const log = {
    rule_id: rule.id,
    rule_name: rule.name,
    mail_id: mail.id,
    executed_at: new Date().toISOString(),
    actions_executed: []
  };

  try {
    // MAP: חלץ מזהים
    const extracted = extractIdentifiers(mail, rule.map_config || []);
    log.extracted_identifiers = extracted;

    // מצא את התיק המתאים
    let case_id = null;
    let client_id = null;
    let caseData = null;
    let clientData = null;

    if (extracted.case_no) {
      const { data: cases } = await supabase
        .from('Case')
        .select('id, client_id, case_number, official_number')
        .or(`case_number.ilike.%${extracted.case_no}%,official_number.ilike.%${extracted.case_no}%`)
        .limit(1);

      if (cases && cases.length > 0) {
        case_id = cases[0].id;
        client_id = cases[0].client_id;
        caseData = cases[0];
        console.log(`[Automation] Found case: ${case_id}`);
      }
    }

    // שלוף פרטי לקוח
    if (client_id) {
      const { data: clients } = await supabase
        .from('Client')
        .select('*')
        .eq('id', client_id)
        .single();
      
      clientData = clients;
      console.log(`[Automation] Found client: ${clientData?.name}`);
    }

    log.case_id = case_id;
    log.client_id = client_id;

    // DISPATCH: בצע פעולות
    const actionBundle = rule.action_bundle || {};

    // פעולה 1: שליחת מייל
    if (actionBundle.send_email?.enabled) {
      const emailResult = await executeSendEmail(
        supabase, 
        mail, 
        caseData, 
        clientData, 
        actionBundle.send_email, 
        extracted
      );
      log.actions_executed.push(emailResult);
    }

    log.status = 'success';

  } catch (error) {
    log.status = 'failed';
    log.error = error.message;
    console.error(`[Automation] Rule execution failed:`, error);
  }

  // שמור לוג ב-Invoice entity (זמני!)
  try {
    const logTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
    await supabase.from('Invoice').insert({
      invoice_number: `AUTO_LOG_${logTimestamp}`,
      client_id: log.client_id || null,
      issued_date: new Date().toISOString().split('T')[0],
      due_date: new Date().toISOString().split('T')[0],
      currency: 'ILS',
      subtotal: 0,
      tax_rate: 0,
      tax_amount: 0,
      total: 0,
      status: 'draft',
      paid_amount: 0,
      notes: JSON.stringify(log, null, 2),
      line_items: []
    });
    console.log(`[Automation] Log saved to Invoice table`);
  } catch (logError) {
    console.error('[Automation] Failed to save log:', logError);
  }

  return log;
}

// ===== ACTION: שליחת מייל =====
async function executeSendEmail(supabase, mail, caseData, clientData, emailConfig, extracted) {
  const result = {
    action_type: 'send_email',
    timestamp: new Date().toISOString()
  };

  try {
    // בנה tokens להחלפה
    const tokens = {
      '{Case_No}': caseData?.case_number || extracted.case_no || 'N/A',
      '{Client_Name}': clientData?.name || 'N/A',
      '{Official_No}': caseData?.official_number || extracted.official_no || 'N/A',
      '{Mail_Subject}': mail.subject || '',
      '{Mail_Date}': new Date(mail.received_date).toLocaleDateString('he-IL'),
    };

    let subject = emailConfig.subject_template || 'Re: {Mail_Subject}';
    let body = emailConfig.body_template || 'שלום {Client_Name},\n\nהתקבלה הודעה בנושא: {Mail_Subject}';

    // החלף משתנים
    for (const [token, value] of Object.entries(tokens)) {
      const escapedToken = token.replace(/[{}]/g, '\\$&');
      subject = subject.replace(new RegExp(escapedToken, 'g'), value);
      body = body.replace(new RegExp(escapedToken, 'g'), value);
    }

    // קבע נמענים
    const recipients = emailConfig.recipients || [];
    let toEmail = '';

    if (recipients.includes('client') && clientData?.email) {
      toEmail = clientData.email;
    } else if (recipients.includes('sender') && mail.sender_email) {
      toEmail = mail.sender_email;
    } else if (recipients.includes('lawyer')) {
      toEmail = caseData?.assigned_lawyer_email || 'office@dwo.co.il';
    }

    if (!toEmail) {
      throw new Error('No recipient email address found');
    }

    console.log(`[Automation] Sending email to: ${toEmail}`);
    console.log(`[Automation] Subject: ${subject}`);
    console.log(`[Automation] Body preview: ${body.substring(0, 100)}...`);
    
    // קריאה ל-sendEmail function
    const { data: emailData, error: emailError } = await supabase.functions.invoke('sendEmail', {
      body: {
        to: toEmail,
        subject: subject,
        body: body
      }
    });

    if (emailError) {
      throw new Error(`Email send failed: ${emailError.message}`);
    }

    result.status = 'success';
    result.email_sent_to = toEmail;
    result.subject = subject;
    console.log(`[Automation] Email sent successfully to ${toEmail}`);

  } catch (error) {
    result.status = 'failed';
    result.error = error.message;
    console.error('[Automation] Email send error:', error);
  }

  return result;
}
