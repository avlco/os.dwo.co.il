import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only admins can access this
    if (user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // Get all tasks with manual overrides
    const tasks = await base44.entities.Task.filter({ manual_override: true });
    
    // Get all rules
    const rules = await base44.entities.MailRule.list();
    const rulesMap = {};
    rules.forEach(r => { rulesMap[r.id] = r; });

    // Analyze override patterns
    const overridePatterns = {};

    tasks.forEach(task => {
      const ruleId = task.extracted_data?.rule_id;
      if (!ruleId) return;

      const originalCaseId = task.original_inferred_case_id || task.extracted_data?.inferred_case?.id;
      const finalCaseId = task.case_id;
      
      // Skip if case wasn't changed
      if (originalCaseId === finalCaseId) return;

      const key = `${ruleId}_${finalCaseId}`;
      if (!overridePatterns[key]) {
        overridePatterns[key] = {
          rule_id: ruleId,
          rule_name: rulesMap[ruleId]?.name || 'Unknown Rule',
          target_case_id: finalCaseId,
          count: 0,
          examples: []
        };
      }
      overridePatterns[key].count++;
      if (overridePatterns[key].examples.length < 3) {
        overridePatterns[key].examples.push({
          task_id: task.id,
          mail_subject: task.title,
          original_case: task.extracted_data?.inferred_case?.case_number || null,
        });
      }
    });

    // Convert to array and filter patterns with 2+ occurrences
    const significantPatterns = Object.values(overridePatterns)
      .filter(p => p.count >= 2)
      .sort((a, b) => b.count - a.count);

    // Generate suggestions
    const suggestions = [];

    for (const pattern of significantPatterns) {
      const rule = rulesMap[pattern.rule_id];
      if (!rule) continue;

      // Try to find the target case to extract potential pattern
      const casesData = await base44.entities.Case.filter({ id: pattern.target_case_id });
      const targetCase = casesData?.[0];

      if (targetCase) {
        suggestions.push({
          rule_id: pattern.rule_id,
          rule_name: pattern.rule_name,
          current_subject_regex: rule.catch_config?.subject_regex || '',
          suggested_case_number: targetCase.case_number,
          suggested_regex: `(?:${targetCase.case_number}|${rule.catch_config?.subject_regex || '.*'})`,
          override_count: pattern.count,
          examples: pattern.examples,
          message: `Users have manually linked ${pattern.count} emails to case ${targetCase.case_number} (${targetCase.title}). Consider updating the rule's subject regex.`
        });
      }
    }

    // Calculate overall stats
    const totalTasks = await base44.entities.Task.list('-created_date', 1000);
    const totalOverrides = totalTasks.filter(t => t.manual_override).length;
    const overrideRate = totalTasks.length > 0 
      ? Math.round((totalOverrides / totalTasks.length) * 100) 
      : 0;

    return Response.json({
      success: true,
      stats: {
        total_tasks: totalTasks.length,
        total_overrides: totalOverrides,
        override_rate: overrideRate,
      },
      suggestions: suggestions.slice(0, 10), // Top 10 suggestions
    });

  } catch (error) {
    console.error('Error getting optimization suggestions:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});