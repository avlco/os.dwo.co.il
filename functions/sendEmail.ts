import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

Deno.serve(async (req) => {
  try {
    const { to, subject, body, from } = await req.json();

    if (!to || !subject || !body) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: to, subject, body' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log(`[SendEmail] Attempting to send email to: ${to}`);
    console.log(`[SendEmail] Subject: ${subject}`);

    // שלב 1: חפש Gmail integration (יש OAuth2 מוכן)
    const { data: gmailConnections, error: gmailError } = await supabase
      .from('IntegrationConnection')
      .select('*')
      .eq('provider', 'gmail')
      .eq('is_active', true)
      .limit(1);

    if (!gmailError && gmailConnections && gmailConnections.length > 0) {
      const gmailConn = gmailConnections[0];
      const accessToken = gmailConn.access_token;

      if (!accessToken) {
        throw new Error('Gmail access token missing');
      }

      console.log('[SendEmail] Using Gmail API to send email');

      // יצירת המייל ב-RFC 2822 format
      const emailContent = [
        `To: ${to}`,
        `Subject: ${subject}`,
        'Content-Type: text/html; charset=utf-8',
        'MIME-Version: 1.0',
        '',
        body
      ].join('\n');

      // קידוד Base64 URL-safe
      const encodedEmail = btoa(emailContent)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      // שליחה דרך Gmail API
      const gmailResponse = await fetch(
        'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ raw: encodedEmail })
        }
      );

      if (!gmailResponse.ok) {
        const errorText = await gmailResponse.text();
        throw new Error(`Gmail API error: ${errorText}`);
      }

      const result = await gmailResponse.json();
      console.log('[SendEmail] ✅ Email sent via Gmail API:', result.id);

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Email sent successfully via Gmail',
          messageId: result.id,
          to,
          subject
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // שלב 2: אם אין Gmail, נסה SMTP
    const { data: smtpConnections, error: smtpError } = await supabase
      .from('IntegrationConnection')
      .select('*')
      .eq('provider', 'smtp')
      .eq('is_active', true)
      .limit(1);

    if (!smtpError && smtpConnections && smtpConnections.length > 0) {
      console.log('[SendEmail] SMTP found but not implemented yet');
      // TODO: יישום SMTP בעתיד
    }

    // שלב 3: אין אינטגרציה - רק לוג
    console.log('[SendEmail] ⚠️ No active email integration found');
    
    // שמור בActivity לוג
    await supabase.from('Activity').insert({
      activity_type: 'email_fallback',
      status: 'pending',
      description: `Email to ${to}: ${subject}`,
      metadata: {
        to,
        subject,
        body_preview: body.substring(0, 200),
        reason: 'No email integration configured'
      }
    });

    return new Response(
      JSON.stringify({ 
        success: false,
        error: 'No email integration configured. Please connect Gmail in Settings → Integrations.',
        to,
        subject,
        logged: true
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[SendEmail] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
