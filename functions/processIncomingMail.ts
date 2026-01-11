import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import pdf from 'npm:pdf-parse@1.1.1';

/**
 * Parse PDF content from URL and extract text
 * @param {string} fileUrl - URL of the PDF file
 * @returns {Promise<string>} - Extracted text content
 */
async function extractTextFromPdf(fileUrl) {
  try {
    const response = await fetch(fileUrl);
    if (!response.ok) {
      console.error('Failed to fetch PDF:', response.status);
      return '';
    }
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
 * Extract identifier from text using anchor text pattern
 * @param {string} text - The text to search in
 * @param {string} anchorText - The anchor pattern (can include {VALUE} placeholder)
 * @returns {string|null} - Extracted value or null
 */
function extractIdentifier(text, anchorText) {
  if (!text || !anchorText) return null;
  
  try {
    // If anchor contains {VALUE}, use it as a template
    if (anchorText.includes('{VALUE}')) {
      // Escape special regex chars except {VALUE}
      const escaped = anchorText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = escaped.replace('\\{VALUE\\}', '([\\w\\d\\-\\/]+)');
      const regex = new RegExp(pattern, 'i');
      const match = text.match(regex);
      return match ? match[1].trim() : null;
    }
    
    // Otherwise, look for number after anchor text
    const escapedAnchor = anchorText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escapedAnchor + '\\s*[:#]?\\s*([\\w\\d\\-\\/]+)', 'i');
    const match = text.match(regex);
    return match ? match[1].trim() : null;
  } catch (e) {
    console.error('Error extracting identifier:', e);
    return null;
  }
}

/**
 * Find case by external identifier
 * @param {object} base44 - SDK client
 * @param {string} identifierType - Type of identifier (e.g., "IL_Official_No")
 * @param {string} identifierValue - The value to search for
 * @returns {object|null} - Found case or null
 */
async function findCaseByExternalIdentifier(base44, identifierType, identifierValue) {
  if (!identifierValue) return null;
  
  try {
    // Fetch all cases (in production, you'd want server-side filtering)
    const cases = await base44.entities.Case.list('-created_date', 500);
    
    for (const caseItem of cases) {
      const identifiers = caseItem.external_identifiers || [];
      for (const id of identifiers) {
        // Match by type if specified, or just by value
        if (identifierType) {
          if (id.type === identifierType && id.value === identifierValue) {
            return caseItem;
          }
        } else if (id.value === identifierValue) {
          return caseItem;
        }
      }
      
      // Also check case_number and application_number as fallback
      if (caseItem.case_number === identifierValue || 
          caseItem.application_number === identifierValue) {
        return caseItem;
      }
    }
    
    return null;
  } catch (e) {
    console.error('Error finding case by identifier:', e);
    return null;
  }
}

/**
 * Check if mail matches AutomationRule catch_config
 */
function matchesCatchConfig(mail, catchConfig) {
  if (!catchConfig) return false;
  
  // Check senders array
  if (catchConfig.senders && catchConfig.senders.length > 0) {
    const senderEmail = (mail.sender_email || '').toLowerCase().trim();
    const matchesSender = catchConfig.senders.some(sender => {
      const pattern = sender.toLowerCase().trim();
      return senderEmail.includes(pattern) || senderEmail === pattern;
    });
    if (!matchesSender) return false;
  }
  
  // Check subject_match
  if (catchConfig.subject_match) {
    const subject = (mail.subject || '').toLowerCase();
    const pattern = catchConfig.subject_match.toLowerCase();
    if (!subject.includes(pattern)) return false;
  }
  
  // Check attachment_text_match (simplified - checks attachment filenames)
  if (catchConfig.attachment_text_match) {
    const attachments = mail.attachments || [];
    const pattern = catchConfig.attachment_text_match.toLowerCase();
    const matchesAttachment = attachments.some(att => 
      (att.filename || '').toLowerCase().includes(pattern)
    );
    if (!matchesAttachment && attachments.length > 0) {
      // If has attachments but none match, fail
      // (could be enhanced to check actual attachment content)
    }
  }
  
  return true;
}

/**
 * Check if mail matches legacy MailRule catch_config
 */
function matchesLegacyCatchConfig(mail, catchConfig) {
  if (!catchConfig) return false;
  
  // Check sender pattern
  if (catchConfig.sender_pattern) {
    const senderPattern = catchConfig.sender_pattern.toLowerCase().trim();
    const senderEmail = (mail.sender_email || '').toLowerCase().trim();
    if (senderPattern.includes('@')) {
      if (senderEmail !== senderPattern) return false;
    } else {
      if (!senderEmail.includes(senderPattern)) return false;
    }
  }
  
  // Check subject_contains
  if (catchConfig.subject_contains) {
    const subject = (mail.subject || '').toLowerCase();
    const pattern = catchConfig.subject_contains.toLowerCase();
    if (!subject.includes(pattern)) return false;
  }
  
  // Check body keywords
  if (catchConfig.body_keywords && catchConfig.body_keywords.length > 0) {
    const bodyText = (mail.body_plain || mail.body_html || '').toLowerCase();
    const hasKeyword = catchConfig.body_keywords.some(keyword => 
      bodyText.includes(keyword.toLowerCase())
    );
    if (!hasKeyword) return false;
  }
  
  // Check attachments requirement
  if (catchConfig.has_attachments) {
    if (!mail.attachments || mail.attachments.length === 0) return false;
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

    // Fetch the mail
    const mails = await base44.entities.Mail.filter({ id: mail_id });
    if (!mails || mails.length === 0) {
      return Response.json({ error: 'Mail not found' }, { status: 404 });
    }
    const mail = mails[0];

    // Skip if already processed
    if (mail.processing_status === 'processed' || mail.processing_status === 'triaged') {
      return Response.json({ message: 'Mail already processed', mail_id });
    }

    // Update mail status to processing
    await base44.entities.Mail.update(mail_id, { processing_status: 'processing' });

    // === PHASE 1: CATCH - Load and match rules ===
    
    // Load new AutomationRules (sorted by priority)
    let automationRules = [];
    try {
      const allAutomationRules = await base44.entities.AutomationRule.filter({ is_active: true });
      automationRules = allAutomationRules.sort((a, b) => (a.priority || 10) - (b.priority || 10));
    } catch (e) {
      console.log('AutomationRule entity not available, using legacy rules only');
    }
    
    // Load legacy MailRules as fallback
    let legacyRules = [];
    try {
      legacyRules = await base44.entities.MailRule.filter({ is_active: true });
    } catch (e) {
      console.log('MailRule entity not available');
    }

    let matchedRule = null;
    let ruleType = null; // 'automation' or 'legacy'
    let extractedIdentifier = null;
    let identifierType = null;

    // Try matching AutomationRules first (by priority)
    for (const rule of automationRules) {
      if (matchesCatchConfig(mail, rule.catch_config)) {
        matchedRule = rule;
        ruleType = 'automation';
        break;
      }
    }

    // Fallback to legacy MailRules
    if (!matchedRule) {
      for (const rule of legacyRules) {
        if (matchesLegacyCatchConfig(mail, rule.catch_config)) {
          matchedRule = rule;
          ruleType = 'legacy';
          break;
        }
      }
    }

    // If no rule matched, mark as pending and exit
    if (!matchedRule) {
      await base44.entities.Mail.update(mail_id, { processing_status: 'pending' });
      return Response.json({ 
        message: 'No matching rule found', 
        mail_id,
        status: 'pending'
      });
    }

    // === PHASE 2: MAP - Extract identifier and find case ===
    
    let relatedCase = null;
    let relatedClient = null;

    if (ruleType === 'automation' && matchedRule.map_config) {
      const mapConfig = matchedRule.map_config;
      
      // Determine source text
      let sourceText = '';
      switch (mapConfig.source) {
        case 'subject':
          sourceText = mail.subject || '';
          break;
        case 'body':
          sourceText = mail.body_plain || mail.body_html || '';
          break;
        case 'attachment':
          // Parse PDF attachments to extract text
          const attachments = mail.attachments || [];
          const pdfAttachments = attachments.filter(a => 
            (a.filename || '').toLowerCase().endsWith('.pdf') && a.url
          );
          
          for (const att of pdfAttachments) {
            const pdfText = await extractTextFromPdf(att.url);
            if (pdfText) {
              sourceText += ' ' + pdfText;
            }
          }
          
          // Fallback to filenames if no PDF content
          if (!sourceText.trim()) {
            sourceText = attachments.map(a => a.filename).join(' ');
          }
          break;
        default:
          sourceText = mail.subject || '';
      }
      
      // Extract identifier using anchor text
      if (mapConfig.anchor_text) {
        extractedIdentifier = extractIdentifier(sourceText, mapConfig.anchor_text);
        identifierType = mapConfig.identifier_type;
      }
      
      // Find case by external identifier
      if (extractedIdentifier) {
        relatedCase = await findCaseByExternalIdentifier(base44, identifierType, extractedIdentifier);
      }
    } else {
      // Legacy extraction - simple case number regex
      const caseNumberRegex = /(?:case|תיק|מס[\'׳]?|no\.?)\s*[:#]?\s*(\d{4,})/i;
      const caseMatch = (mail.subject || '').match(caseNumberRegex);
      if (caseMatch) {
        extractedIdentifier = caseMatch[1];
        // Try to find case by case_number
        const cases = await base44.entities.Case.filter({ case_number: extractedIdentifier });
        if (cases && cases.length > 0) {
          relatedCase = cases[0];
        }
      }
    }

    // Fetch related client if case found
    if (relatedCase && relatedCase.client_id) {
      const clients = await base44.entities.Client.filter({ id: relatedCase.client_id });
      if (clients && clients.length > 0) {
        relatedClient = clients[0];
      }
    }

    // === PHASE 3: DESPATCH - Prepare actions ===
    
    let suggestedActions = [];
    let requiresApproval = true;

    if (ruleType === 'automation' && matchedRule.action_bundle) {
      const bundle = matchedRule.action_bundle;
      let actionIndex = 0;
      
      if (bundle.create_task) {
        suggestedActions.push({
          id: `action_${actionIndex++}`,
          action_type: 'create_task',
          action_label: 'יצירת משימה',
          selected: true
        });
      }
      
      if (bundle.log_time) {
        suggestedActions.push({
          id: `action_${actionIndex++}`,
          action_type: 'log_time',
          action_label: 'רישום שעות',
          hours: 0.25,
          selected: true
        });
      }
      
      if (bundle.dropbox_path) {
        suggestedActions.push({
          id: `action_${actionIndex++}`,
          action_type: 'upload_to_dropbox',
          action_label: 'העלאה ל-Dropbox',
          dropbox_folder_path: bundle.dropbox_path,
          selected: true
        });
      }
      
      if (bundle.email_template_id) {
        suggestedActions.push({
          id: `action_${actionIndex++}`,
          action_type: 'send_email',
          action_label: 'שליחת מייל',
          email_template_id: bundle.email_template_id,
          selected: true
        });
      }
    } else if (ruleType === 'legacy') {
      // Use legacy despatch_config
      suggestedActions = (matchedRule.despatch_config || []).map((action, index) => ({
        id: `action_${index}`,
        ...action,
        selected: true
      }));
      requiresApproval = matchedRule.approval_required !== false;
    }

    // Calculate estimated time saved
    const timeSavedMinutes = suggestedActions.length * 5;

    // Create task
    const taskData = {
      mail_id: mail_id,
      case_id: relatedCase?.id || null,
      client_id: relatedClient?.id || null,
      task_type: 'review_document',
      title: `Mail Processing: ${mail.subject || 'No Subject'}`,
      description: `Email from: ${mail.sender_name || mail.sender_email}\nSubject: ${mail.subject}\n\nMatched rule: ${matchedRule.name}`,
      status: requiresApproval ? 'awaiting_approval' : 'pending',
      priority: mail.priority || 'medium',
      assigned_to_email: user.email,
      manual_override: false,
      time_saved_minutes: timeSavedMinutes,
      original_inferred_case_id: relatedCase?.id || null,
      original_inferred_client_id: relatedClient?.id || null,
      extracted_data: {
        rule_id: matchedRule.id,
        rule_name: matchedRule.name,
        rule_type: ruleType,
        extracted_identifier: extractedIdentifier,
        identifier_type: identifierType,
        suggested_actions: suggestedActions,
        inferred_case: relatedCase ? {
          id: relatedCase.id,
          case_number: relatedCase.case_number,
          title: relatedCase.title
        } : null,
        inferred_client: relatedClient ? {
          id: relatedClient.id,
          name: relatedClient.name
        } : null
      }
    };

    const createdTask = await base44.entities.Task.create(taskData);

    // Update mail with task reference and status
    await base44.entities.Mail.update(mail_id, {
      processing_status: 'triaged',
      task_id: createdTask.id,
      related_case_id: relatedCase?.id || null,
      related_client_id: relatedClient?.id || null,
      inferred_case_id: relatedCase?.id || null,
      inferred_confidence: relatedCase ? 0.9 : 0,
      auto_triaged: true,
      matched_rule_id: matchedRule.id
    });

    return Response.json({
      success: true,
      mail_id,
      task_id: createdTask.id,
      matched_rule: matchedRule.name,
      rule_type: ruleType,
      extracted_identifier: extractedIdentifier,
      identifier_type: identifierType,
      related_case: relatedCase?.case_number || null,
      suggested_actions_count: suggestedActions.length
    });

  } catch (error) {
    console.error('Error processing mail:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});