import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/** Returns today's date as YYYY-MM-DD in Israel timezone */
function getTodayIsrael() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
}

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

    const { entityType, format } = await req.json();

    if (!entityType || !['clients', 'cases', 'automations'].includes(entityType)) {
      return Response.json({ error: 'Invalid entityType' }, { status: 400, headers: corsHeaders });
    }

    let data = [];

    if (entityType === 'clients') {
      data = await base44.entities.Client.list('-created_date', 10000);
    } else if (entityType === 'cases') {
      data = await base44.entities.Case.list('-created_date', 10000);
    } else if (entityType === 'automations') {
      data = await base44.entities.AutomationRule.list('-created_date', 10000);
    }

    let content, mimeType, filename;

    if (entityType === 'automations' || format === 'json') {
      // Export as JSON for automations
      const exportData = data.map(item => {
        const { id, created_date, updated_date, created_by, ...rest } = item;
        return rest;
      });
      content = JSON.stringify(exportData, null, 2);
      mimeType = 'application/json';
      filename = `${entityType}_export_${getTodayIsrael()}.json`;
    } else {
      // Export as CSV for clients and cases
      content = convertToCSV(data, entityType);
      mimeType = 'text/csv';
      filename = `${entityType}_export_${getTodayIsrael()}.csv`;
    }

    return Response.json({
      content,
      mimeType,
      filename,
      count: data.length
    }, { headers: corsHeaders });

  } catch (error) {
    console.error('Export error:', error);
    return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });
  }
});

function convertToCSV(data, entityType) {
  if (data.length === 0) return '';

  let headers;
  
  if (entityType === 'clients') {
    headers = [
      'name', 'type', 'email', 'phone', 'address', 'country', 
      'client_number', 'registration_number', 'tax_id', 'payment_terms',
      'hourly_rate', 'billing_currency', 'is_active', 'notes',
      'account_manager_email', 'assigned_lawyer_id'
    ];
  } else if (entityType === 'cases') {
    headers = [
      'case_number', 'title', 'case_type', 'status', 'client_id',
      'application_number', 'priority_number', 'filing_date', 'priority_date',
      'publication_date', 'grant_date', 'territory', 'priority_level',
      'renewal_date', 'expiry_date', 'applicant_name', 'applicant_address',
      'classification', 'assigned_attorney_email', 'assigned_lawyer_id',
      'hourly_rate', 'notes', 'inventors', 'external_identifiers'
    ];
  }

  const csvRows = [headers.join(',')];

  for (const item of data) {
    const values = headers.map(header => {
      let value = item[header];
      
      // Handle arrays and objects
      if (Array.isArray(value) || (typeof value === 'object' && value !== null)) {
        value = JSON.stringify(value);
      }
      
      // Handle null/undefined
      if (value === null || value === undefined) {
        return '';
      }
      
      // Escape CSV values
      value = String(value);
      if (value.includes(',') || value.includes('"') || value.includes('\n')) {
        value = `"${value.replace(/"/g, '""')}"`;
      }
      
      return value;
    });
    
    csvRows.push(values.join(','));
  }

  return csvRows.join('\n');
}