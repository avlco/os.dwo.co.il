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

    // Fetch active mail rules sorted by priority
    const rules = await base44.entities.MailRule.filter({ is_active: true });
    const sortedRules = rules.sort((a, b) => (a.priority || 10) - (b.priority || 10));

    let matchedRule = null;
    let extractedCaseNumber = null;

    // Try to match rules
    for (const rule of sortedRules) {
      const catchConfig = rule.catch_config || {};
      let matches = true;

      // Check sender pattern
      if (catchConfig.sender_pattern) {
        try {
          const senderRegex = new RegExp(catchConfig.sender_pattern, 'i');
          if (!senderRegex.test(mail.sender_email || '')) {
            matches = false;
          }
        } catch (e) {
          console.log('Invalid sender regex:', catchConfig.sender_pattern);
          matches = false;
        }
      }

      // Check subject regex and extract case number
      if (matches && catchConfig.subject_regex) {
        try {
          const subjectRegex = new RegExp(catchConfig.subject_regex, 'i');
          const match = (mail.subject || '').match(subjectRegex);
          if (match) {
            extractedCaseNumber = match[1] || match[0];
          } else {
            matches = false;
          }
        } catch (e) {
          console.log('Invalid subject regex:', catchConfig.subject_regex);
          matches = false;
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

    // Try to find related case
    let relatedCase = null;
    let relatedClient = null;

    if (extractedCaseNumber && matchedRule.auto_link_case) {
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

    // Create task with awaiting_approval status
    const taskData = {
      mail_id: mail_id,
      case_id: relatedCase?.id || null,
      client_id: relatedClient?.id || null,
      task_type: 'review_document',
      title: `עיבוד מייל: ${mail.subject || 'ללא נושא'}`,
      description: `מייל מאת: ${mail.sender_name || mail.sender_email}\nנושא: ${mail.subject}\n\nחוק שהתאים: ${matchedRule.name}`,
      status: matchedRule.approval_required ? 'awaiting_approval' : 'pending',
      priority: mail.priority || 'medium',
      assigned_to_email: user.email,
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
      inferred_confidence: relatedCase ? 0.9 : 0
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