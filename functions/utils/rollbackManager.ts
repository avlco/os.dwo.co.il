/**
 * Rollback Manager
 * Tracks created entities and provides rollback capability
 * for transactional integrity in batch operations
 */

export class RollbackManager {
  constructor(base44) {
    this.base44 = base44;
    this.actions = [];
  }
  
  /**
   * Register an action for potential rollback
   * @param {object} action - { type: string, id: string, metadata?: object }
   */
  register(action) {
    this.actions.push(action);
    console.log(`[Rollback] Registered: ${action.type} (ID: ${action.id || 'N/A'})`);
  }
  
  /**
   * Rollback all registered actions in reverse order
   * @returns {Promise<{ success: boolean, errors: object[] }>}
   */
  async rollbackAll() {
    if (this.actions.length === 0) {
      return { success: true, errors: [] };
    }
    
    console.log(`[Rollback] 🔄 Rolling back ${this.actions.length} action(s)`);
    const errors = [];
    
    // Rollback in reverse order (LIFO)
    for (let i = this.actions.length - 1; i >= 0; i--) {
      const action = this.actions[i];
      try {
        await this.rollbackAction(action);
        console.log(`[Rollback] ✅ Rolled back: ${action.type} (${action.id})`);
      } catch (error) {
        console.error(`[Rollback] ❌ Failed: ${action.type}:`, error.message);
        errors.push({ 
          action: action.type, 
          id: action.id, 
          error: error.message 
        });
      }
    }
    
    // Log rollback errors if any
    if (errors.length > 0) {
      try {
        await this.base44.entities.Activity.create({
          activity_type: 'automation_log',
          status: 'failed',
          title: 'Rollback encountered errors',
          description: `Failed to rollback ${errors.length} action(s)`,
          metadata: { 
            errors, 
            timestamp: new Date().toISOString(),
            rollback_attempted: this.actions.length
          }
        });
      } catch (e) {
        console.error('[Rollback] Failed to log rollback errors:', e);
      }
    }
    
    return { 
      success: errors.length === 0, 
      errors 
    };
  }
  
  /**
   * Rollback a single action
   * @param {object} action - The action to rollback
   */
  async rollbackAction(action) {
    if (!action.id) {
      console.log(`[Rollback] Skipping ${action.type}: no ID`);
      return;
    }
    
    switch (action.type) {
      case 'create_task':
        await this.base44.entities.Task.delete(action.id);
        break;
        
      case 'billing':
        await this.base44.entities.TimeEntry.delete(action.id);
        break;
        
      case 'create_alert':
      case 'approval':
        await this.base44.entities.Activity.delete(action.id);
        break;
        
      case 'create_deadline':
        await this.base44.entities.Deadline.delete(action.id);
        break;
        
      case 'calendar_event':
        // Note: Google Calendar events cannot be easily rolled back
        // We would need to call the Google Calendar API to delete
        console.warn(`[Rollback] Calendar event ${action.id} requires manual cleanup`);
        break;
        
      case 'approval_batch':
        // Update batch status to 'cancelled' instead of deleting
        await this.base44.entities.ApprovalBatch.update(action.id, {
          status: 'cancelled',
          cancellation_reason: 'Rolled back due to execution failure'
        });
        break;
        
      default:
        console.warn(`[Rollback] Unknown action type: ${action.type}`);
    }
  }
  
  /**
   * Clear all registered actions (use after successful completion)
   */
  clear() {
    this.actions = [];
  }
  
  /**
   * Get count of registered actions
   */
  get count() {
    return this.actions.length;
  }
}