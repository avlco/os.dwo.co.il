import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Normalizes catch_config for comparison by sorting senders array
 */
function normalizeCatchConfig(catchConfig) {
  if (!catchConfig) return null;
  
  return {
    senders: (catchConfig.senders || []).slice().sort(),
    subject_contains: (catchConfig.subject_contains || '').trim().toLowerCase(),
    body_contains: (catchConfig.body_contains || '').trim().toLowerCase()
  };
}

/**
 * Checks if a catch_config has meaningful filter criteria
 */
function hasMeaningfulCriteria(normalizedConfig) {
  if (!normalizedConfig) return false;
  return (
    normalizedConfig.senders.length > 0 ||
    normalizedConfig.subject_contains.length > 0 ||
    normalizedConfig.body_contains.length > 0
  );
}

/**
 * Compares two catch_config objects for equality
 * Returns true only if both have the same meaningful criteria
 */
function areCatchConfigsEqual(config1, config2) {
  const norm1 = normalizeCatchConfig(config1);
  const norm2 = normalizeCatchConfig(config2);
  
  // If either is empty/null, they are not considered equal (allow empty rules)
  if (!norm1 || !norm2) return false;
  if (!hasMeaningfulCriteria(norm1) || !hasMeaningfulCriteria(norm2)) return false;
  
  // Compare senders arrays (already sorted)
  if (norm1.senders.length !== norm2.senders.length) return false;
  for (let i = 0; i < norm1.senders.length; i++) {
    if (norm1.senders[i].toLowerCase() !== norm2.senders[i].toLowerCase()) return false;
  }
  
  // Compare subject and body
  if (norm1.subject_contains !== norm2.subject_contains) return false;
  if (norm1.body_contains !== norm2.body_contains) return false;
  
  return true;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const base44 = createClientFromRequest(req);
    
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
        status: 403, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    const rawBody = await req.json();
    const params = rawBody.body || rawBody;
    const { ruleId, catchConfig } = params;

    if (!catchConfig) {
      return new Response(JSON.stringify({ error: 'catchConfig is required' }), { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    // Fetch all existing automation rules
    const existingRules = await base44.entities.AutomationRule.list();
    
    // Check for duplicates
    for (const rule of existingRules) {
      // Skip the rule being edited
      if (ruleId && rule.id === ruleId) continue;
      
      if (areCatchConfigsEqual(rule.catch_config, catchConfig)) {
        return new Response(JSON.stringify({ 
          valid: false, 
          error: 'קיים כבר כלל אוטומציה עם תנאי סינון זהים',
          conflictingRuleId: rule.id,
          conflictingRuleName: rule.name
        }), { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }
    }

    return new Response(JSON.stringify({ valid: true }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });

  } catch (error) {
    console.error('[ValidateAutomationRule] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
});