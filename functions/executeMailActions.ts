import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { task_id, selected_actions, case_id, client_id } = await req.json();
    
    if (!task_id) {
      return Response.json({ error: 'task_id is required' }, { status: 400 });
    }

    // Fetch the task
    const tasks = await base44.entities.Task.filter({ id: task_id });
    if (!tasks || tasks.length === 0) {
      return Response.json({ error: 'Task not found' }, { status: 404 });
    }
    const task = tasks[0];

    // Fetch the original mail if mail_id is available
    const mail = task.mail_id ? (await base44.entities.Mail.filter({ id: task.mail_id }))[0] : null;

    const executedActions = [];
    const errors = [];

    // Execute each selected action
    for (const action of (selected_actions || [])) {
      try {
        switch (action.action_type) {
          case 'log_time':
            if (action.hours && case_id) {
              const clients = await base44.entities.Client.filter({ id: client_id });
              const client = clients.length > 0 ? clients[0] : null;
              const hourlyRate = client?.hourly_rate || 0;

              const timeEntry = await base44.entities.TimeEntry.create({
                case_id: case_id,
                task_id: task_id,
                description: action.action_label || `Time logged from mail processing`,
                hours: action.hours,
                rate: hourlyRate,
                is_billable: true,
                date_worked: new Date().toISOString().split('T')[0],
                billed: false
              });
              executedActions.push({ type: 'log_time', id: timeEntry.id, hours: action.hours, rate: hourlyRate });
            }
            break;

          case 'create_deadline':
            if (case_id) {
              const dueDate = new Date();
              dueDate.setDate(dueDate.getDate() + (action.days_offset || 30));
              
              const deadline = await base44.entities.Deadline.create({
                case_id: case_id,
                deadline_type: action.deadline_type || 'custom',
                description: action.action_label || 'Deadline from mail processing',
                due_date: dueDate.toISOString().split('T')[0],
                status: 'pending',
                is_critical: false,
                assigned_to_email: user.email
              });
              executedActions.push({ type: 'create_deadline', id: deadline.id });
            }
            break;

          case 'create_task':
            const newTask = await base44.entities.Task.create({
              case_id: case_id || null,
              client_id: client_id || null,
              task_type: action.task_type || 'custom',
              title: action.task_title || action.action_label || 'New Task',
              description: `Created from mail processing`,
              status: 'pending',
              priority: 'medium',
              assigned_to_email: user.email
            });
            executedActions.push({ type: 'create_task', id: newTask.id });
            break;

          case 'attach_document':
            // Document attachment would need file handling - mark as executed
            executedActions.push({ type: 'attach_document', status: 'pending_manual' });
            break;

          case 'upload_to_dropbox':
            if (case_id && mail?.attachments?.length > 0 && action.dropbox_folder_path) {
              const cases = await base44.entities.Case.filter({id: case_id});
              const currentCase = cases.length > 0 ? cases[0] : null;
              const clients = await base44.entities.Client.filter({id: client_id});
              const client = clients.length > 0 ? clients[0] : null;
              
              const folderPath = action.dropbox_folder_path
                .replace('{{client_name}}', client?.name || 'Unknown')
                .replace('{{case_number}}', currentCase?.case_number || 'Unknown');

              for (const attachment of mail.attachments) {
                console.log(`Dropbox upload: ${attachment.filename} to ${folderPath}`);
                executedActions.push({ 
                  type: 'upload_to_dropbox', 
                  filename: attachment.filename, 
                  destination: folderPath,
                  status: 'simulated'
                });
              }
            }
            break;
          
          case 'create_calendar_event':
            if (case_id && action.calendar_event_template) {
              const cases = await base44.entities.Case.filter({id: case_id});
              const currentCase = cases.length > 0 ? cases[0] : null;
              
              const eventTitle = (action.calendar_event_template.title_template || '')
                .replace('{{case_number}}', currentCase?.case_number || 'N/A')
                .replace('{{mail_subject}}', mail?.subject || 'N/A');
              
              const eventDescription = (action.calendar_event_template.description_template || '')
                .replace('{{case_number}}', currentCase?.case_number || 'N/A')
                .replace('{{mail_subject}}', mail?.subject || 'N/A');
              
              console.log(`Calendar event: ${eventTitle}`);
              executedActions.push({ type: 'create_calendar_event', title: eventTitle, status: 'simulated' });
            }
            break;

          case 'send_email':
            if (mail?.sender_email && action.auto_reply_template) {
              const clients = await base44.entities.Client.filter({id: client_id});
              const client = clients.length > 0 ? clients[0] : null;

              const emailBody = action.auto_reply_template
                .replace('{{client_name}}', client?.name || mail.sender_name || 'Client')
                .replace('{{mail_subject}}', mail?.subject || 'Your inquiry');
              
              await base44.integrations.Core.SendEmail({
                to: mail.sender_email,
                subject: `Re: ${mail.subject || 'Your Inquiry'}`,
                body: emailBody
              });
              executedActions.push({ type: 'send_email', to: mail.sender_email, status: 'success' });
            }
            break;

          case 'update_case_status':
            if (case_id && action.new_status) {
              await base44.entities.Case.update(case_id, { status: action.new_status });
              executedActions.push({ type: 'update_case_status', new_status: action.new_status });
            }
            break;

          case 'create_invoice_draft':
            if (client_id) {
              const clients = await base44.entities.Client.filter({ id: client_id });
              const client = clients.length > 0 ? clients[0] : null;
              
              // Extract amount from mail if available
              const extractedAmount = task.extracted_data?.amount || 0;
              
              const invoiceNumber = `INV-${Date.now()}`;
              const invoice = await base44.entities.Invoice.create({
                invoice_number: invoiceNumber,
                client_id: client_id,
                issued_date: new Date().toISOString().split('T')[0],
                due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                currency: 'ILS',
                subtotal: extractedAmount,
                tax_rate: 17,
                tax_amount: extractedAmount * 0.17,
                total: extractedAmount * 1.17,
                status: 'draft',
                paid_amount: 0,
                line_items: case_id ? [{
                  case_id: case_id,
                  description: action.invoice_description || `Legal services - ${mail?.subject || 'General'}`,
                  quantity: 1,
                  unit_price: extractedAmount,
                  amount: extractedAmount
                }] : [],
                notes: `Auto-generated from mail processing: ${mail?.subject || ''}`
              });
              executedActions.push({ 
                type: 'create_invoice_draft', 
                id: invoice.id, 
                invoice_number: invoiceNumber,
                amount: extractedAmount 
              });
            }
            break;
        }
      } catch (actionError) {
        errors.push({ action: action.action_type, error: actionError.message });
      }
    }

    // Build execution log from executed actions
    const executionLog = executedActions.map(action => ({
      action_type: action.type,
      status: action.status || 'success',
      executed_at: new Date().toISOString(),
      result_id: action.id,
      result_url: action.dropbox_url || action.calendar_link || null,
      details: action
    }));

    // Add errors to log
    errors.forEach(err => {
      executionLog.push({
        action_type: err.action,
        status: 'error',
        executed_at: new Date().toISOString(),
        error: err.error
      });
    });

    // Update task status to completed with execution log
    const existingExtractedData = task.extracted_data || {};
    await base44.entities.Task.update(task_id, {
      status: 'completed',
      completed_at: new Date().toISOString(),
      case_id: case_id || task.case_id,
      client_id: client_id || task.client_id,
      extracted_data: {
        ...existingExtractedData,
        execution_log: [
          ...(existingExtractedData.execution_log || []),
          ...executionLog
        ]
      }
    });

    // Update mail status to processed
    if (task.mail_id) {
      await base44.entities.Mail.update(task.mail_id, {
        processing_status: 'processed',
        related_case_id: case_id || null,
        related_client_id: client_id || null
      });
    }

    return Response.json({
      success: true,
      task_id,
      executed_actions: executedActions,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    console.error('Error executing actions:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});