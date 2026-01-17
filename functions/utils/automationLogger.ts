// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

export interface AutomationLog {
  rule_id: string;
  rule_name: string;
  mail_id: string;
  mail_subject: string;
  execution_status: 'started' | 'completed' | 'failed' | 'rolled_back';
  actions_summary: {
    total: number;
    success: number;
    failed: number;
    pending_approval: number;
  };
  execution_time_ms: number;
  error_message?: string;
  metadata: Record<string, any>;
}

/**
 * שמירת לוג ביצוע אוטומציה
 */
export async function logAutomationExecution(log: AutomationLog) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  try {
    const { error } = await supabase
      .from('AutomationLog')
      .insert({
        rule_id: log.rule_id,
        rule_name: log.rule_name,
        mail_id: log.mail_id,
        mail_subject: log.mail_subject,
        execution_status: log.execution_status,
        actions_summary: log.actions_summary,
        execution_time_ms: log.execution_time_ms,
        error_message: log.error_message,
        metadata: log.metadata,
        executed_at: new Date().toISOString(),
      });
    
    if (error) {
      console.error('[AutoLogger] Failed to save log:', error);
    }
  } catch (error) {
    console.error('[AutoLogger] Exception in logAutomationExecution:', error);
  }
}

/**
 * עדכון סטטוס החוק (success rate, last execution)
 */
export async function updateRuleStats(ruleId: string, success: boolean) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  try {
    // שלוף נתונים נוכחיים
    const { data: rule } = await supabase
      .from('AutomationRule')
      .select('metadata')
      .eq('id', ruleId)
      .single();
    
    const metadata = rule?.metadata || {};
    const stats = metadata.stats || {
      total_executions: 0,
      successful_executions: 0,
      failed_executions: 0,
      last_execution: null,
      success_rate: 0,
    };
    
    // עדכן סטטיסטיקות
    stats.total_executions += 1;
    if (success) {
      stats.successful_executions += 1;
    } else {
      stats.failed_executions += 1;
    }
    stats.success_rate = (stats.successful_executions / stats.total_executions) * 100;
    stats.last_execution = new Date().toISOString();
    
    // שמור בחזרה
    await supabase
      .from('AutomationRule')
      .update({
        metadata: {
          ...metadata,
          stats,
        },
      })
      .eq('id', ruleId);
    
    console.log(`[AutoLogger] Updated stats for rule ${ruleId}: ${stats.success_rate.toFixed(1)}% success rate`);
  } catch (error) {
    console.error('[AutoLogger] Failed to update rule stats:', error);
  }
}

/**
 * שליפת היסטוריית ביצועים לחוק
 */
export async function getRuleExecutionHistory(ruleId: string, limit = 50) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  const { data, error } = await supabase
    .from('AutomationLog')
    .select('*')
    .eq('rule_id', ruleId)
    .order('executed_at', { ascending: false })
    .limit(limit);
  
  if (error) {
    console.error('[AutoLogger] Failed to fetch execution history:', error);
    return [];
  }
  
  return data || [];
}
