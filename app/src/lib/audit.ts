import { sb } from './supabase';

/**
 * Who the audit rows are attributed to. AuthProvider keeps this current so the many
 * call sites do not each have to thread the signed-in user through.
 */
let identity: { id?: string; email?: string } = {};

export function setAuditIdentity(id?: string, email?: string) {
  identity = { id, email };
}

/** Never throws: a failed audit write must not fail the action it was recording. */
export async function logAudit(
  action: 'created' | 'updated' | 'deleted',
  table: string,
  recordId: string,
  oldData: unknown,
  newData: unknown,
) {
  try {
    await sb.from('audit_log').insert({
      user_id: identity.id ?? null,
      user_email: identity.email ?? null,
      action,
      table_name: table,
      record_id: recordId,
      old_data: oldData,
      new_data: newData,
    });
  } catch (e) {
    console.warn('Audit log failed:', e);
  }
}
