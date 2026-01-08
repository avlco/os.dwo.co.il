import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

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

    // Fetch active mail rules (process in order of arrival/creation)
    const rules = await base44.entities.MailRule.filter({ is_active: true });

    let matchedRule = null;
    let extractedCaseNumber = null;

    // Try to match rules
    for (const rule of rules) {
      const catchConfig = rule.catch_config || {};
      let matches = true;

      // Check sender pattern - exact match or contains check (case insensitive)
      if (catchConfig.sender_pattern) {
        const senderPattern = catchConfig.sender_pattern.toLowerCase().trim();
        const senderEmail = (mail.sender_email || '').toLowerCase().trim();
        // Match if sender contains the pattern OR if pattern contains @, do exact match
        if (senderPattern.includes('@')) {
          if (senderEmail !== senderPattern) {
            matches = false;
          }
        } else {
          if (!senderEmail.includes(senderPattern)) {
            matches = false;
          }
        }
      }

      // Check subject - simple contains check
      const subjectPattern = catchConfig.subject_contains;
      if (matches && subjectPattern) {
        const subject = (mail.subject || '').toLowerCase();
        const pattern = subjectPattern.toLowerCase();
        
        // Simple contains check
        if (!subject.includes(pattern)) {
          matches = false;
        }
      }
      
      // Try to extract case number from subject (always attempt)
      if (matches) {
        try {
          const caseNumberRegex = /(?:case|תיק|מס[\'׳]?|no\.?)\s*[:#]?\s*(\d{4,})/i;
          const caseMatch = (mail.subject || '').match(caseNumberRegex);
          if (caseMatch) {
            extractedCaseNumber = caseMatch[1];
          }
        } catch (e) {
          // Ignore regex errors
        }
      }

      // Check body keywords
      if (matches && catchConfig.body_keywords && catchConfig.body_keywords.length > 0) {
        const bodyText = (mail.body_plain || mail.body_html || '').toLowerCase();
        const hasKeyword = catchConfig.body_keywords.some(keyword => 
          bodyText.includes(keyword.toLowerCase())
        );
        if (!hasKeyword) {
          matches = false;
        }
      }

      // Check attachments requirement
      if (matches && catchConfig.has_attachments) {
        if (!mail.attachments || mail.attachments.length === 0) {
          matches = false;
        }
      }

      if (matches) {
        matchedRule = rule;
        break;
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

    // Try to find related case based on extracted case number
    let relatedCase = null;
    let relatedClient = null;

    if (extractedCaseNumber) {
      const cases = await base44.entities.Case.filter({ case_number: extractedCaseNumber });
      if (cases && cases.length > 0) {
        relatedCase = cases[0];
        // Fetch related client
        if (relatedCase.client_id) {
          const clients = await base44.entities.Client.filter({ id: relatedCase.client_id });
          if (clients && clients.length > 0) {
            relatedClient = clients[0];
          }
        }
      }
    }

    // Prepare suggested actions from despatch_config
    const suggestedActions = (matchedRule.despatch_config || []).map((action, index) => ({
      id: `action_${index}`,
      ...action,
      selected: true // Default to selected
    }));

    // Calculate estimated time saved (5 minutes per suggested action)
    const timeSavedMinutes = suggestedActions.length * 5;

    // Create task with awaiting_approval status
    const taskData = {
      mail_id: mail_id,
      case_id: relatedCase?.id || null,
      client_id: relatedClient?.id || null,
      task_type: 'review_document',
      title: `Mail Processing: ${mail.subject || 'No Subject'}`,
      description: `Email from: ${mail.sender_name || mail.sender_email}\nSubject: ${mail.subject}\n\nMatched rule: ${matchedRule.name}`,
      status: matchedRule.approval_required ? 'awaiting_approval' : 'pending',
      priority: mail.priority || 'medium',
      assigned_to_email: user.email,
      manual_override: false,
      time_saved_minutes: timeSavedMinutes,
      original_inferred_case_id: relatedCase?.id || null,
      original_inferred_client_id: relatedClient?.id || null,
      extracted_data: {
        rule_id: matchedRule.id,
        rule_name: matchedRule.name,
        extracted_case_number: extractedCaseNumber,
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
      extracted_case_number: extractedCaseNumber,
      related_case: relatedCase?.case_number || null,
      suggested_actions_count: suggestedActions.length
    });

  } catch (error) {
    console.error('Error processing mail:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});