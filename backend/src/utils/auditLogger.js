const { createClient } = require('@supabase/supabase-js');

// Helper to get a configured Supabase client using Service Role key
function getDb() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
}

/**
 * Logs an action to the audit_logs table.
 * 
 * @param {string} actionType - 'INCIDENT_REPORTED', 'ALERT_CREATED', 'RESOURCE_ASSIGNED', etc.
 * @param {string|null} userId - The Supabase Auth user ID performing the action (if authenticated).
 * @param {string|null} entityId - The ID of the primary entity involved.
 * @param {object} metadata - Extra contextual details.
 */
async function logAudit(actionType, userId = null, entityId = null, metadata = {}) {
  try {
    const db = getDb();
    const { error } = await db.from('audit_logs').insert({
      action_type: actionType,
      user_id: userId,
      entity_id: entityId,
      metadata: metadata
    });
    
    if (error) {
      console.error(`[AuditLogger] Failed to insert audit log for ${actionType}:`, error.message);
    }
  } catch (err) {
    console.error(`[AuditLogger] Exception during audit logging:`, err.message);
  }
}

module.exports = {
  logAudit
};
