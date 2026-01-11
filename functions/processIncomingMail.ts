import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import pdf from 'npm:pdf-parse@1.1.1';

/**
 * Extract text from PDF file
 */
async function extractTextFromPdf(fileUrl) {
  try {
    const response = await fetch(fileUrl);
    if (!response.ok) return '';
    const arrayBuffer = await response.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);
    const data = await pdf(buffer);
    return data.text || '';
  } catch (e) {
    console.error('Error parsing PDF:', e);
    return '';
  }
}

/**
 * Extract value using anchor text (Anchor-based extraction)
 * Looks for the anchor text and extracts what comes after it
 */
function extractByAnchor(text, anchorText) {
  if (!text || !anchorText) return null;
  
  try {
    // Escape special regex characters in anchor
    const escapedAnchor = anchorText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // Pattern: anchor followed by optional separators, then capture alphanumeric value
    const regex = new RegExp(escapedAnchor + '\\s*[:#\\-]?\\s*([\\w\\d\\-\\/\\.]+)', 'i');
    const match = text.match(regex);
    
    return match ? match[1].trim() : null;
  } catch (e) {
    console.error('Error in extractByAnchor:', e);
    return null;
  }
}

/**
 * Replace tokens in template with actual values
 * Tokens: {Case_No}, {Client_Name}, {Case_Type}, {Official_No}, {Mail_Subject}, {Mail_Date}, {Identifier_Found}
 */
function replaceTokens(template, context) {
  if (!template) return '';
  
  const { caseData, clientData, mailData, extractedIdentifier } = context;
  
  return template
    .replace(/\{Case_No\}/g, caseData?.case_number || '')
    .replace(/\{Client_Name\}/g, clientData?.name || '')
    .replace(/\{Case_Type\}/g, caseData?.case_type || '')
    .replace(/\{Official_No\}/g, caseData?.application_number || '')
    .replace(/\{Mail_Subject\}/g, mailData?.subject || '')
    .replace(/\{Mail_Date\}/g, mailData?.received_at ? new Date(mailData.received_at).toLocaleDateString('he-IL') : '')
    .replace(/\{Identifier_Found\}/g, extractedIdentifier || '');
}

/**
 * Calculate date with offset from base date
 */
function calculateOffsetDate(baseDate, daysOffset) {
  const date = new Date(baseDate);
  date.setDate(date.getDate() + daysOffset);
  return date.toISOString().split('T')[0];
}

/**
 * Find case by identifier value
 */
async function findCaseByIdentifier(base44, targetField, identifierValue) {
  if (!identifierValue) return null;
  
  try {
    const cases = await base44.entities.Case.list('-created_date', 500);
    
    for (const caseItem of cases) {
      // Check by target field type
      if (targetField === 'case_no' && caseItem.case_number === identifierValue) {
        return caseItem;
      }
      if (targetField === 'official_no' && caseItem.application_number === identifierValue) {
        return caseItem;
      }
      
      // Check external_identifiers
      const identifiers = caseItem.external_identifiers || [];
      for (const id of identifiers) {
        if (id.value === identifierValue) {
          return caseItem;
        }
      }
      
      // Fallback: check case_number and application_number
      if (caseItem.case_number === identifierValue || caseItem.application_number === identifierValue) {
        return caseItem;
      }
    }
    
    return null;
  } catch (e) {
    console.error('Error finding case:', e);
    return null;
  }
}

/**
 * Check if mail matches catch_config
 */
function matchesCatchConfig(mail, catchConfig) {
  if (!catchConfig) return false;
  
  // Check senders
  if (catchConfig.senders && catchConfig.senders.length > 0) {
    const senderEmail = (mail.sender_email || '').toLowerCase();
    const matchesSender = catchConfig.senders.some(sender => {
      const pattern = sender.toLowerCase().trim();
      return senderEmail.includes(pattern);
    });
    if (!matchesSender) return false;
  }
  
  // Check subject_contains
  if (catchConfig.subject_contains) {
    const subject = (mail.subject || '').toLowerCase();
    if (!subject.includes(catchConfig.subject_contains.toLowerCase())) return false;
  }
  
  // Check body_contains
  if (catchConfig.body_contains) {
    const body = (mail.body_plain || mail.body_html || '').toLowerCase();
    if (!body.includes(catchConfig.body_contains.toLowerCase())) return false;
  }
  
  return true;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { mail_id } = await req.json();
    
    if (!mail_id) {
      return Response.json({ error: 'mail_id is required' }, { status: 400 });
    }

    // Fetch mail
    const mails = await base44.entities.Mail.filter({ id: mail_id });
    if (!mails || mails.length === 0) {
      return Response.json({ error: 'Mail not found' }, { status: 404 });
    }
    const mail = mails[0];

    // Skip if already processed
    if (mail.processing_status === 'processed' || mail.processing_status === 'triaged') {
      return Response.json({ message: 'Mail already processed', mail_id });
    }

    await base44.entities.Mail.update(mail_id, { processing_status: 'processing' });

    // === PHASE 1: CATCH ===
    let automationRules = [];
    try {
      automationRules = await base44.entities.AutomationRule.filter({ is_active: true });
    } catch (e) {
      console.log('No AutomationRule entity');
    }

    let matchedRule = null;
    for (const rule of automationRules) {
      if (matchesCatchConfig(mail, rule.catch_config)) {
        matchedRule = rule;
        break;
      }
    }

    if (!matchedRule) {
      await base44.entities.Mail.update(mail_id, { processing_status: 'pending' });
      return Response.json({ message: 'No matching rule', mail_id, status: 'pending' });
    }

    // === PHASE 2: MAP (Anchor-based extraction) ===
    let extractedIdentifier = null;
    let extractedTargetField = null;
    let relatedCase = null;
    let relatedClient = null;

    const mapConfigs = matchedRule.map_config || [];
    
    // Prepare text sources
    const textSources = {
      subject: mail.subject || '',
      body: mail.body_plain || mail.body_html || '',
      attachment: ''
    };

    // Extract PDF text if needed
    const needsAttachment = mapConfigs.some(m => m.source === 'attachment');
    if (needsAttachment && mail.attachments?.length > 0) {
      for (const att of mail.attachments) {
        if (att.filename?.toLowerCase().endsWith('.pdf') && att.url) {
          const pdfText = await extractTextFromPdf(att.url);
          textSources.attachment += ' ' + pdfText;
        }
      }
    }

    // Run extraction rules
    for (const mapRow of mapConfigs) {
      const sourceText = textSources[mapRow.source] || '';
      const value = extractByAnchor(sourceText, mapRow.anchor_text);
      
      if (value) {
        extractedIdentifier = value;
        extractedTargetField = mapRow.target_field;
        
        // Find case
        relatedCase = await findCaseByIdentifier(base44, mapRow.target_field, value);
        if (relatedCase) break;
      }
    }

    // Fetch client
    if (relatedCase?.client_id) {
      const clients = await base44.entities.Client.filter({ id: relatedCase.client_id });
      if (clients?.length > 0) relatedClient = clients[0];
    }

    // === PHASE 3: ACTIONS (Token-based) ===
    const actionBundle = matchedRule.action_bundle || {};
    const tokenContext = {
      caseData: relatedCase,
      clientData: relatedClient,
      mailData: mail,
      extractedIdentifier
    };

    const executionResults = [];
    const mailDate = mail.received_at || new Date().toISOString();

    // Billing
    if (actionBundle.billing?.enabled) {
      try {
        const description = replaceTokens(actionBundle.billing.description_template, tokenContext) || `עיבוד מייל: ${mail.subject}`;
        await base44.entities.TimeEntry.create({
          case_id: relatedCase?.id || '',
          description,
          hours: actionBundle.billing.hours || 0.25,
          date_worked: new Date().toISOString().split('T')[0],
          is_billable: true
        });
        executionResults.push({ action: 'billing', status: 'success' });
      } catch (e) {
        executionResults.push({ action: 'billing', status: 'error', error: e.message });
      }
    }

    // Create Alert / Deadline
    if (actionBundle.create_alert?.enabled) {
      try {
        const message = replaceTokens(actionBundle.create_alert.message_template, tokenContext);
        const dueDate = calculateOffsetDate(mailDate, actionBundle.create_alert.days_offset || 7);
        
        await base44.entities.Deadline.create({
          case_id: relatedCase?.id || '',
          deadline_type: actionBundle.create_alert.alert_type === 'deadline' ? 'custom' : 'office_action_response',
          description: message,
          due_date: dueDate,
          status: 'pending',
          is_critical: actionBundle.create_alert.alert_type === 'urgent'
        });
        executionResults.push({ action: 'create_alert', status: 'success' });
      } catch (e) {
        executionResults.push({ action: 'create_alert', status: 'error', error: e.message });
      }
    }

    // Create Task for review
    const taskData = {
      mail_id,
      case_id: relatedCase?.id || null,
      client_id: relatedClient?.id || null,
      task_type: 'review_document',
      title: `עיבוד מייל: ${mail.subject || 'ללא נושא'}`,
      description: `שולח: ${mail.sender_name || mail.sender_email}\nחוק תואם: ${matchedRule.name}\nמזהה שנמצא: ${extractedIdentifier || 'לא נמצא'}`,
      status: 'awaiting_approval',
      priority: mail.priority || 'medium',
      assigned_to_email: user.email,
      extracted_data: {
        rule_id: matchedRule.id,
        rule_name: matchedRule.name,
        extracted_identifier: extractedIdentifier,
        target_field: extractedTargetField,
        execution_results: executionResults,
        inferred_case: relatedCase ? { id: relatedCase.id, case_number: relatedCase.case_number, title: relatedCase.title } : null,
        inferred_client: relatedClient ? { id: relatedClient.id, name: relatedClient.name } : null
      }
    };

    const createdTask = await base44.entities.Task.create(taskData);

    // Update mail
    await base44.entities.Mail.update(mail_id, {
      processing_status: 'triaged',
      task_id: createdTask.id,
      related_case_id: relatedCase?.id || null,
      related_client_id: relatedClient?.id || null,
      matched_rule_id: matchedRule.id,
      auto_triaged: true
    });

    return Response.json({
      success: true,
      mail_id,
      task_id: createdTask.id,
      matched_rule: matchedRule.name,
      extracted_identifier: extractedIdentifier,
      related_case: relatedCase?.case_number || null,
      actions_executed: executionResults.length
    });

  } catch (error) {
    console.error('Error processing mail:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});