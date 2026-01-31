/**
 * Batch Permissions Helper
 * Checks if a user is authorized to edit/view approval batches
 */

/**
 * Check if user can edit this batch
 * @param {object} batch - ApprovalBatch object
 * @param {object} user - Current user object from useAuth()
 * @returns {boolean} - true if user can edit
 */
export function canEditBatch(batch, user) {
  if (!batch || !user) {
    return false;
  }

  // Admin/Partner/Super Admin can always edit
  const adminRoles = ['admin', 'partner', 'super_admin'];
  if (adminRoles.includes(user.role)) {
    return true;
  }

  // Owner (creator) can edit their own batches
  if (batch.user_id === user.id) {
    return true;
  }

  // Approver can edit
  const currentUserEmail = (user.email || '').trim().toLowerCase();
  const batchApprover = (batch.approver_email || '').trim().toLowerCase();
  
  if (batchApprover && batchApprover === currentUserEmail) {
    return true;
  }

  // Case lawyer - handled server-side
  // (too complex to check here, requires fetching case data)
  
  return false;
}

/**
 * Check if user can view this batch (read-only)
 * Currently same as edit permissions, but kept separate for future flexibility
 * @param {object} batch - ApprovalBatch object
 * @param {object} user - Current user object
 * @returns {boolean}
 */
export function canViewBatch(batch, user) {
  // For now, same as edit permissions
  // In future, might allow wider access (e.g., all team members can view)
  return canEditBatch(batch, user);
}
