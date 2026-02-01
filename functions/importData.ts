import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
    }

    const { entityType, items } = await req.json();

    if (!entityType || !['clients', 'cases', 'automations'].includes(entityType)) {
      return Response.json({ error: 'Invalid entityType' }, { status: 400, headers: corsHeaders });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return Response.json({ error: 'No items to import' }, { status: 400, headers: corsHeaders });
    }

    const results = {
      created: 0,
      updated: 0,
      failed: 0,
      errors: []
    };

    for (const item of items) {
      try {
        const { data, existingMatch, action } = item;
        
        // Clean data - remove system fields
        const cleanData = { ...data };
        delete cleanData.id;
        delete cleanData.created_date;
        delete cleanData.updated_date;
        delete cleanData.created_by;

        if (entityType === 'clients') {
          if (action === 'create') {
            await base44.entities.Client.create(cleanData);
            results.created++;
          } else if (action === 'update' && existingMatch?.id) {
            await base44.entities.Client.update(existingMatch.id, cleanData);
            results.updated++;
          }
        } else if (entityType === 'cases') {
          // Handle special fields
          if (typeof cleanData.inventors === 'string') {
            try {
              cleanData.inventors = JSON.parse(cleanData.inventors);
            } catch {}
          }
          if (typeof cleanData.external_identifiers === 'string') {
            try {
              cleanData.external_identifiers = JSON.parse(cleanData.external_identifiers);
            } catch {}
          }

          if (action === 'create') {
            await base44.entities.Case.create(cleanData);
            results.created++;
          } else if (action === 'update' && existingMatch?.id) {
            await base44.entities.Case.update(existingMatch.id, cleanData);
            results.updated++;
          }
        } else if (entityType === 'automations') {
          // Automations are always deactivated on import for safety
          cleanData.is_active = false;

          if (action === 'create') {
            await base44.entities.AutomationRule.create(cleanData);
            results.created++;
          } else if (action === 'update' && existingMatch?.id) {
            await base44.entities.AutomationRule.update(existingMatch.id, cleanData);
            results.updated++;
          }
        }
      } catch (err) {
        results.failed++;
        results.errors.push({
          item: item.data?.name || item.data?.case_number || item.data?.email || 'unknown',
          error: err.message
        });
      }
    }

    return Response.json(results, { headers: corsHeaders });

  } catch (error) {
    console.error('Import error:', error);
    return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });
  }
});