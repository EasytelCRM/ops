import { sb } from './supabase';
import type { Profile } from './db.types';

/**
 * Tells someone a job has landed on them, through the `send-assignment-email` Edge
 * Function. That function is not deployed yet, which is why this never throws: an
 * assignment must still save when the mail does not go out.
 */
export async function sendAssignmentEmail(
  job: { title: string | null; type: string | null; due_date: string | null },
  assignee: Profile | undefined,
  clientName: string,
  assignedBy: string | null | undefined,
) {
  try {
    if (!assignee) return;
    await sb.functions.invoke('send-assignment-email', {
      body: {
        to: assignee.email,
        assignee_name: assignee.full_name,
        job_title: job.title,
        job_type: job.type,
        client_name: clientName || 'Unknown',
        due_date: job.due_date,
        assigned_by: assignedBy,
      },
    });
  } catch (e) {
    console.warn('Email notification failed:', e);
  }
}
