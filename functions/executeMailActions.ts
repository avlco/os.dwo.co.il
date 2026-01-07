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

    const executedActions = [];
    const errors = [];

    // Execute each selected action
    for (const action of (selected_actions || [])) {
      try {
        switch (action.action_type) {
          case 'log_time':
            if (action.hours && case_id) {
              const timeEntry = await base44.entities.TimeEntry.create({
                case_id: case_id,
                task_id: task_id,
                description: action.action_label || `רישום שעות מעיבוד מייל`,
                hours: action.hours,
                rate: 0,
                is_billable: true,
                date_worked: new Date().toISOString().split('T')[0],
                billed: false
              });
              executedActions.push({ type: 'log_time', id: timeEntry.id, hours: action.hours });
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
            // Document attachment would need file handling - mark as executed
            executedActions.push({ type: 'attach_document', status: 'pending_manual' });
            break;

          case 'update_case_status':
            if (case_id && action.new_status) {
              await base44.entities.Case.update(case_id, { status: action.new_status });
              executedActions.push({ type: 'update_case_status', new_status: action.new_status });
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