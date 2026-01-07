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
              // Dynamic rate from client
              let hourlyRate = 0;
              if (client_id) {
                const clients = await base44.entities.Client.filter({ id: client_id });
                if (clients.length > 0 && clients[0].hourly_rate) {
                  hourlyRate = clients[0].hourly_rate;
                }
              }

              const timeEntry = await base44.entities.TimeEntry.create({
                case_id: case_id,
                task_id: task_id,
                description: action.action_label || `רישום שעות מעיבוד מייל`,
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
                description: action.action_label || 'מועד מעיבוד מייל',
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
              title: action.task_title || action.action_label || 'משימה חדשה',
              description: `נוצר מעיבוד מייל`,
              status: 'pending',
              priority: 'medium',
              assigned_to_email: user.email
            });
            executedActions.push({ type: 'create_task', id: newTask.id });
            break;

          case 'attach_document':
            executedActions.push({ type: 'attach_document', status: 'pending_manual' });
            break;

          case 'update_case_status':
            if (case_id && action.new_status) {
              await base44.entities.Case.update(case_id, { status: action.new_status });
              executedActions.push({ type: 'update_case_status', new_status: action.new_status });
            }
            break;

          case 'upload_to_dropbox':
            if (case_id && mail?.attachments?.length > 0 && action.dropbox_folder_path) {
              const cases = await base44.entities.Case.filter({ id: case_id });
              const currentCase = cases.length > 0 ? cases[0] : null;
              let clientName = 'Unknown_Client';
              if (client_id) {
                const clients = await base44.entities.Client.filter({ id: client_id });
                if (clients.length > 0) clientName = clients[0].name;
              }
              
              const folderPath = action.dropbox_folder_path
                .replace(/\{\{client_name\}\}/g, clientName.replace(/[/\\]/g, '_'))
                .replace(/\{\{case_number\}\}/g, currentCase?.case_number || 'Unknown_Case');

              for (const attachment of mail.attachments) {
                console.log(`Dropbox upload: ${attachment.filename} to ${folderPath}`);
                executedActions.push({ 
                  type: 'upload_to_dropbox', 
                  filename: attachment.filename, 
                  destination: folderPath,
                  status: 'simulated_success'
                });
              }
            }
            break;
          
          case 'create_calendar_event':
            if (case_id && action.calendar_event_template) {
              const cases = await base44.entities.Case.filter({ id: case_id });
              const currentCase = cases.length > 0 ? cases[0] : null;
              
              const titleTemplate = action.calendar_event_template.title_template || '';
              const descTemplate = action.calendar_event_template.description_template || '';
              
              const eventTitle = titleTemplate
                .replace(/\{\{case_number\}\}/g, currentCase?.case_number || 'N/A')
                .replace(/\{\{mail_subject\}\}/g, mail?.subject || 'N/A');
              
              const eventDescription = descTemplate
                .replace(/\{\{case_number\}\}/g, currentCase?.case_number || 'N/A')
                .replace(/\{\{mail_subject\}\}/g, mail?.subject || 'N/A')
                .replace(/\{\{mail_sender\}\}/g, mail?.sender_name || mail?.sender_email || 'N/A');
              
              console.log(`Calendar event: ${eventTitle}`);
              executedActions.push({ type: 'create_calendar_event', title: eventTitle, description: eventDescription, status: 'simulated_success' });
            }
            break;

          case 'send_email':
            if (mail?.sender_email && action.auto_reply_template) {
              let clientName = mail.sender_name || 'לקוח';
              if (client_id) {
                const clients = await base44.entities.Client.filter({ id: client_id });
                if (clients.length > 0) clientName = clients[0].name;
              }

              const emailBody = action.auto_reply_template
                .replace(/\{\{client_name\}\}/g, clientName)
                .replace(/\{\{mail_subject\}\}/g, mail?.subject || 'פנייתך');
              
              await base44.integrations.Core.SendEmail({
                to: mail.sender_email,
                subject: `Re: ${mail.subject || 'Your Inquiry'}`,
                body: emailBody
              });
              executedActions.push({ type: 'send_email', to: mail.sender_email, status: 'success' });
            }
            break;
        }
      } catch (actionError) {
        errors.push({ action: action.action_type, error: actionError.message });
      }
    }

    // Update task status to completed
    await base44.entities.Task.update(task_id, {
      status: 'completed',
      completed_at: new Date().toISOString(),
      case_id: case_id || task.case_id,
      client_id: client_id || task.client_id
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