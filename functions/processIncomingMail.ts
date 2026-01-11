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
 */
function extractByAnchor(text, anchorText) {
  if (!text || !anchorText) return null;
  try {
    const escapedAnchor = anchorText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
 * Supports direction: 'before' subtracts, 'after' adds
 * Supports unit: 'days' or 'weeks'
 */
function calculateOffsetDate(baseDate, offset, direction = 'after', unit = 'days') {
  const date = new Date(baseDate);
  const multiplier = direction === 'before' ? -1 : 1;
  const days = unit === 'weeks' ? offset * 7 : offset;
  date.setDate(date.getDate() + (days * multiplier));
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
      if (targetField === 'case_no' && caseItem.case_number === identifierValue) return caseItem;
      if (targetField === 'official_no' && caseItem.application_number === identifierValue) return caseItem;
      const identifiers = caseItem.external_identifiers || [];
      for (const id of identifiers) {
        if (id.value === identifierValue) return caseItem;
      }
      if (caseItem.case_number === identifierValue || caseItem.application_number === identifierValue) return caseItem;
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
  if (catchConfig.senders && catchConfig.senders.length > 0) {
    const senderEmail = (mail.sender_email || '').toLowerCase();
    const matchesSender = catchConfig.senders.some(sender => senderEmail.includes(sender.toLowerCase().trim()));
    if (!matchesSender) return false;
  }
  if (catchConfig.subject_contains) {
    const subject = (mail.subject || '').toLowerCase();
    if (!subject.includes(catchConfig.subject_contains.toLowerCase())) return false;
  }
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
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { mail_id } = await req.json();
    if (!mail_id) return Response.json({ error: 'mail_id is required' }, { status: 400 });

    // Fetch mail
    const mails = await base44.entities.Mail.filter({ id: mail_id });
    if (!mails || mails.length === 0) return Response.json({ error: 'Mail not found' }, { status: 404 });
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

    // === PHASE 2: MAP ===
    let extractedIdentifier = null;
    let extractedTargetField = null;
    let relatedCase = null;
    let relatedClient = null;

    const mapConfigs = matchedRule.map_config || [];
    const textSources = {
      subject: mail.subject || '',
      body: mail.body_plain || mail.body_html || '',
      attachment: ''
    };

    const needsAttachment = mapConfigs.some(m => m.source === 'attachment');
    if (needsAttachment && mail.attachments?.length > 0) {
      for (const att of mail.attachments) {
        if (att.filename?.toLowerCase().endsWith('.pdf') && att.url) {
          const pdfText = await extractTextFromPdf(att.url);
          textSources.attachment += ' ' + pdfText;
        }
      }
    }

    for (const mapRow of mapConfigs) {
      const sourceText = textSources[mapRow.source] || '';
      const value = extractByAnchor(sourceText, mapRow.anchor_text);
      if (value) {
        extractedIdentifier = value;
        extractedTargetField = mapRow.target_field;
        relatedCase = await findCaseByIdentifier(base44, mapRow.target_field, value);
        if (relatedCase) break;
      }
    }

    if (relatedCase?.client_id) {
      const clients = await base44.entities.Client.filter({ id: relatedCase.client_id });
      if (clients?.length > 0) relatedClient = clients[0];
    }

    // === PHASE 3: PREPARE ACTIONS ===
    const actionBundle = matchedRule.action_bundle || {};
    const tokenContext = { caseData: relatedCase, clientData: relatedClient, mailData: mail, extractedIdentifier };
    const mailDate = mail.received_at || new Date().toISOString();

    // Build pending actions list for approval or immediate execution
    const pendingActions = [];

    if (actionBundle.billing?.enabled) {
      pendingActions.push({
        type: 'billing',
        params: {
          case_id: relatedCase?.id || '',
          description: replaceTokens(actionBundle.billing.description_template, tokenContext) || `עיבוד מייל: ${mail.subject}`,
          hours: actionBundle.billing.hours || 0.25,
          rate: actionBundle.billing.hourly_rate || 0,
          date_worked: new Date().toISOString().split('T')[0]
        }
      });
    }

    if (actionBundle.create_alert?.enabled) {
      const alertConfig = actionBundle.create_alert;
      pendingActions.push({
        type: 'create_alert',
        params: {
          case_id: relatedCase?.id || '',
          message: replaceTokens(alertConfig.message_template, tokenContext),
          due_date: calculateOffsetDate(mailDate, alertConfig.timing_offset || 7, alertConfig.timing_direction || 'after', alertConfig.timing_unit || 'days'),
          alert_type: alertConfig.alert_type,
          recipients: alertConfig.recipients || []
        }
      });
    }

    if (actionBundle.calendar_event?.enabled) {
      const calConfig = actionBundle.calendar_event;
      pendingActions.push({
        type: 'calendar_event',
        params: {
          title: replaceTokens(calConfig.title_template, tokenContext),
          date: calculateOffsetDate(mailDate, calConfig.timing_offset || 7, calConfig.timing_direction || 'after', calConfig.timing_unit || 'days'),
          attendees: calConfig.attendees || [],
          create_meet_link: calConfig.create_meet_link || false
        }
      });
    }

    if (actionBundle.send_email?.enabled) {
      const emailConfig = actionBundle.send_email;
      pendingActions.push({
        type: 'send_email',
        params: {
          recipients: emailConfig.recipients || [],
          subject: replaceTokens(emailConfig.subject_template, tokenContext),
          body: replaceTokens(emailConfig.body_template, tokenContext)
        }
      });
    }

    if (actionBundle.save_file?.enabled) {
      pendingActions.push({
        type: 'save_file',
        params: {
          path: replaceTokens(actionBundle.save_file.path_template, tokenContext),
          attachments: mail.attachments || []
        }
      });
    }

    // === PHASE 4: APPROVAL FLOW ===
    const requiresApproval = matchedRule.require_approval !== false;
    const approverEmail = matchedRule.approver_email || user.email;

    // Determine task type based on approval requirement
    const taskType = requiresApproval ? 'automation_review' : 'review_document';
    const taskStatus = requiresApproval ? 'awaiting_approval' : 'pending';

    // Create task
    const taskData = {
      mail_id,
      case_id: relatedCase?.id || null,
      client_id: relatedClient?.id || null,
      task_type: taskType,
      title: requiresApproval 
        ? `אישור אוטומציה: ${mail.subject || 'ללא נושא'}`
        : `עיבוד מייל: ${mail.subject || 'ללא נושא'}`,
      description: `שולח: ${mail.sender_name || mail.sender_email}\nחוק תואם: ${matchedRule.name}\nמזהה שנמצא: ${extractedIdentifier || 'לא נמצא'}\n\n${requiresApproval ? 'ממתין לאישור לפני ביצוע הפעולות.' : ''}`,
      status: taskStatus,
      priority: mail.priority || 'medium',
      assigned_to_email: approverEmail,
      approver_email: requiresApproval ? approverEmail : null,
      extracted_data: {
        rule_id: matchedRule.id,
        rule_name: matchedRule.name,
        extracted_identifier: extractedIdentifier,
        target_field: extractedTargetField,
        pending_actions: pendingActions,
        requires_approval: requiresApproval,
        inferred_case: relatedCase ? { id: relatedCase.id, case_number: relatedCase.case_number, title: relatedCase.title } : null,
        inferred_client: relatedClient ? { id: relatedClient.id, name: relatedClient.name } : null
      }
    };

    const createdTask = await base44.entities.Task.create(taskData);

    // If no approval needed, execute actions immediately
    let executionResults = [];
    if (!requiresApproval) {
      for (const action of pendingActions) {
        try {
          if (action.type === 'billing') {
            await base44.entities.TimeEntry.create({
              case_id: action.params.case_id,
              description: action.params.description,
              hours: action.params.hours,
              rate: action.params.rate,
              date_worked: action.params.date_worked,
              is_billable: true
            });
            executionResults.push({ action: 'billing', status: 'success' });
          }
          if (action.type === 'create_alert') {
            await base44.entities.Deadline.create({
              case_id: action.params.case_id,
              deadline_type: action.params.alert_type === 'deadline' ? 'custom' : 'office_action_response',
              description: action.params.message,
              due_date: action.params.due_date,
              status: 'pending',
              is_critical: action.params.alert_type === 'urgent'
            });
            executionResults.push({ action: 'create_alert', status: 'success' });
          }
          // Calendar and Email would need external integrations
        } catch (e) {
          executionResults.push({ action: action.type, status: 'error', error: e.message });
        }
      }
    }

    // Update mail
    await base44.entities.Mail.update(mail_id, {
      processing_status: requiresApproval ? 'triaged' : 'processed',
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
      requires_approval: requiresApproval,
      pending_actions_count: pendingActions.length,
      executed_actions: executionResults.length
    });

  } catch (error) {
    console.error('Error processing mail:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});