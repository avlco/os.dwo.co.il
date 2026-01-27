// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

export interface RollbackAction {
  action_type: string;
  action_id?: string;
  rollback_data: Record<string, any>;
  executed: boolean;
}

/**
 * מנהל Rollback - שומר פעולות שבוצעו כדי לבטל במקרה של כישלון
 */
export class RollbackManager {
  private actions: RollbackAction[] = [];
  private supabase;
  
  constructor() {
    this.supabase = createClient(supabaseUrl, supabaseServiceKey);
  }
  
  /**
   * רישום פעולה שבוצעה
   */
  registerAction(action: RollbackAction) {
    this.actions.push(action);
    console.log(`[Rollback] Registered: ${action.action_type} (ID: ${action.action_id || 'N/A'})`);
  }
  
  /**
   * ביטול כל הפעולות שבוצעו
   */
  async rollbackAll(): Promise<void> {
    console.log(`[Rollback] 🔄 Starting rollback of ${this.actions.length} action(s)`);
    
    let successCount = 0;
    let failCount = 0;
    
    // בצע rollback בסדר הפוך (LIFO)
    for (let i = this.actions.length - 1; i >= 0; i--) {
      const action = this.actions[i];
      
      if (!action.executed) {
        console.log(`[Rollback] ⏭️ Skipping ${action.action_type} (not executed)`);
        continue;
      }
      
      try {
        await this.rollbackSingleAction(action);
        successCount++;
        console.log(`[Rollback] ✅ Rolled back: ${action.action_type}`);
      } catch (error) {
        failCount++;
        console.error(`[Rollback] ❌ Failed to rollback ${action.action_type}:`, error);
      }
    }
    
    console.log(`[Rollback] 🏁 Complete: ${successCount} successful, ${failCount} failed`);
  }
  
  /**
   * ביטול פעולה בודדת
   */
  private async rollbackSingleAction(action: RollbackAction): Promise<void> {
    switch (action.action_type) {
      case 'create_task':
        await this.rollbackTask(action);
        break;
      
      case 'billing':
        await this.rollbackTimeEntry(action);
        break;
      
      case 'create_alert':
        await this.rollbackActivity(action);
        break;
      
      case 'calendar_event':
        await this.rollbackCalendarEvent(action);
        break;
      
      case 'send_email':
        // לא ניתן לבטל מייל שנשלח - רק לתעד
        console.log(`[Rollback] ⚠️ Cannot rollback sent email`);
        break;
      
      case 'save_file':
        await this.rollbackDropboxUpload(action);
        break;
      
      default:
        console.log(`[Rollback] ⚠️ Unknown action type: ${action.action_type}`);
    }
  }
  
  private async rollbackTask(action: RollbackAction) {
    if (!action.action_id) return;
    
    const { error } = await this.supabase
      .from('Task')
      .delete()
      .eq('id', action.action_id);
    
    if (error) throw error;
  }
  
  private async rollbackTimeEntry(action: RollbackAction) {
    if (!action.action_id) return;
    
    const { error } = await this.supabase
      .from('TimeEntry')
      .delete()
      .eq('id', action.action_id);
    
    if (error) throw error;
  }
  
  private async rollbackActivity(action: RollbackAction) {
    if (!action.action_id) return;
    
    const { error } = await this.supabase
      .from('Activity')
      .delete()
      .eq('id', action.action_id);
    
    if (error) throw error;
  }
  
  private async rollbackCalendarEvent(action: RollbackAction) {
    // TODO: מחק אירוע מ-Google Calendar
    console.log(`[Rollback] TODO: Delete calendar event ${action.action_id}`);
  }
  
  private async rollbackDropboxUpload(action: RollbackAction) {
    // TODO: מחק קבצים מ-Dropbox
    console.log(`[Rollback] TODO: Delete Dropbox files at ${action.rollback_data.path}`);
  }
}
