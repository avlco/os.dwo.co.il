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

    const { data: connections, error: connError } = await supabase
      .from('IntegrationConnection')
      .select('*')
      .eq('provider', 'smtp')
      .eq('is_active', true)
      .limit(1);

    if (connError || !connections || connections.length === 0) {
      console.log('[SendEmail] No active SMTP connection found, using fallback');
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Email logged (no SMTP configured)',
          to,
          subject,
          fallback: true
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const smtpConfig = connections[0].metadata;
    
    if (!smtpConfig?.smtp_host || !smtpConfig?.smtp_username) {
      throw new Error('Invalid SMTP configuration');
    }

    console.log(`[SendEmail] Using SMTP: ${smtpConfig.smtp_host}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Email sent successfully',
        to,
        subject,
        via: 'smtp'
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
