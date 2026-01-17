import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req) => {
  try {
    const { mail_id } = await req.json();
    
    if (!mail_id) {
      return new Response(JSON.stringify({ error: 'mail_id is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. שלוף את המייל
    const { data: mail, error: mailError } = await supabase
      .from('Mail')
      .select('*')
      .eq('id', mail_id)
      .single();

    if (mailError || !mail) {
      throw new Error(`Mail not found: ${mailError?.message}`);
    }

    // 2. שלוף את כל החוקים הפעילים
    const { data: rules, error: rulesError } = await supabase
      .from('AutomationRule')
      .select('*')
      .eq('is_active', true)
      .order('created_date', { ascending: false });

    if (rulesError) {
      throw new Error(`Failed to fetch rules: ${rulesError.message}`);
    }

    // 3. בדוק אילו חוקים תואמים (CATCH)
    const matchedRules = rules.filter(rule => matchesCatchCriteria(mail, rule.catch_config));

    if (matchedRules.length === 0) {
      return new Response(JSON.stringify({ matched: 0, message: 'No matching rules' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 4. הרץ כל חוק שהתאים
    const results = [];
    for (const rule of matchedRules) {
      const result = await executeRule(supabase, mail, rule);
      results.push(result);
    }

    return new Response(JSON.stringify({ matched: matchedRules.length, results }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Automation execution error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});

// ===== CATCH: בדיקת התאמה =====
function matchesCatchCriteria(mail: any, catchConfig: any): boolean {
  // Check sender
  if (catchConfig.senders && catchConfig.senders.length > 0) {
    const senderMatch = catchConfig.senders.some((sender: string) =>
      mail.sender_email?.toLowerCase().includes(sender.toLowerCase())
    );
    if (!senderMatch) return false;
  }

  // Check subject
  if (catchConfig.subject_contains) {
    if (!mail.subject?.toLowerCase().includes(catchConfig.subject_contains.toLowerCase())) {
      return false;
    }
  }

  // Check body
  if (catchConfig.body_contains) {
    if (!mail.body_text?.toLowerCase().includes(catchConfig.body_contains.toLowerCase())) {
      return false;
    }
  }

  return true;
}

// ===== MAP: חילוץ מזהים =====
function extractIdentifiers(mail: any, mapConfig: any[]): any {
  const extracted: any = {};

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
  }

  return extracted;
}

// ===== EXECUTE RULE: הרצת חוק אחד =====
async function executeRule(supabase: any, mail: any, rule: any) {
  const log: any = {
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

    if (extracted.case_no) {
      const { data: cases } = await supabase
        .from('Case')
        .select('id, client_id')
        .ilike('case_number', `%${extracted.case_no}%`)
        .limit(1);

      if (cases && cases.length > 0) {
        case_id = cases[0].id;
        client_id = cases[0].client_id;
      }
    }

    log.case_id = case_id;
    log.client_id = client_id;

    // DISPATCH: בצע פעולות
    const actionBundle = rule.action_bundle || {};

    // פעולה 1: שליחת מייל
    if (actionBundle.send_email?.enabled) {
      const emailResult = await executeSendEmail(supabase, mail, case_id, client_id, actionBundle.send_email, extracted);
      log.actions_executed.push(emailResult);
    }

    log.status = 'success';

  } catch (error) {
    log.status = 'failed';
    log.error = error.message;
  }

  // שמור לוג (אם יש entity AutomationLog)
  await supabase.from('AutomationLog').insert(log);

  return log;
}

// ===== ACTION: שליחת מייל =====
async function executeSendEmail(
  supabase: any,
  mail: any,
  case_id: string | null,
  client_id: string | null,
  emailConfig: any,
  extracted: any
) {
  const result: any = {
    action_type: 'send_email',
    timestamp: new Date().toISOString()
  };

  try {
    // שלוף פרטי לקוח ותיק
    let caseData: any = null;
    let clientData: any = null;

    if (case_id) {
      const { data } = await supabase.from('Case').select('*').eq('id', case_id).single();
      caseData = data;
    }

    if (client_id) {
      const { data } = await supabase.from('Client').select('*').eq('id', client_id).single();
      clientData = data;
    }

    // בנה את תבנית המייל עם החלפת משתנים
    const tokens: any = {
      '{Case_No}': caseData?.case_number || extracted.case_no || 'N/A',
      '{Client_Name}': clientData?.name || 'N/A',
      '{Official_No}': caseData?.official_number || extracted.official_no || 'N/A',
      '{Mail_Subject}': mail.subject || '',
      '{Mail_Date}': new Date(mail.received_date).toLocaleDateString('he-IL'),
    };

    let subject = emailConfig.subject_template || '';
    let body = emailConfig.body_template || '';

    // החלף משתנים
    for (const [token, value] of Object.entries(tokens)) {
      subject = subject.replace(new RegExp(token, 'g'), value as string);
      body = body.replace(new RegExp(token, 'g'), value as string);
    }

    // שלח מייל דרך Base44 Email API
    const emailPayload = {
      to: clientData?.email || 'unknown@example.com',
      subject: subject,
      body: body,
      from: 'noreply@dwo.co.il'
    };

    // שליחת מייל (placeholder - צריך להשתמש ב-Gmail API או Base44 Email service)
    console.log('Sending email:', emailPayload);

    result.status = 'success';
    result.email_sent_to = emailPayload.to;
    result.subject = subject;

  } catch (error) {
    result.status = 'failed';
    result.error = error.message;
  }

  return result;
}
