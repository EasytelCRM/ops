import { svcLabel } from '../components/Badges';
import type { AuditLog } from './db.types';
import { fmtDateTime } from './format';

/** Field names as the audit log shows them. Anything missing falls back to the column name. */
export const AUDIT_LABELS: Record<string, string> = {
  company: 'Company',
  account_number: 'Account number',
  phone: 'Phone',
  email: 'Email',
  svc_internet: 'Internet service',
  svc_webex: 'Webex service',
  svc_nec: 'NEC service',
  system_credentials: 'System credentials',
  cred_router: 'Router credentials',
  cred_phone_system: 'Phone system credentials',
  cred_other: 'Other credentials',
  title: 'Title',
  type: 'Type',
  status: 'Status',
  client_id: 'Client',
  site_id: 'Site',
  assigned_to: 'Assigned to',
  due_date: 'Scheduled date',
  cost: 'Cost',
  approval_date: 'Approval date',
  description: 'Description',
  job_notes: 'Job notes',
  job_id: 'Job',
  text: 'Text',
  role: 'Role',
  notes: 'Notes',
  phone_numbers: 'Phone numbers',
  ticket_url: 'Ticket link',
  losing_carrier: 'Losing carrier',
  port_date: 'Port date',
  port_time: 'Port time',
  tio_ref: 'TIO reference',
  complainant: 'Complainant',
  open_date: 'Open date',
  closed_date: 'Closed date',
  complaint_id: 'Complaint',
  jobs_unassigned: 'Open jobs unassigned',
  complaints_unassigned: 'Open complaints unassigned',
  created_at: 'Created',
  created_by: 'Created by',
  cancelled_date: 'Account cancelled',
  hardware_only: 'Hardware only',
  name: 'Name',
  note: 'Note',
  mobile: 'Mobile',
  is_primary: 'Primary contact',
};

/** Where a column means something different on one table, keyed table → column. */
const AUDIT_TABLE_LABELS: Record<string, Record<string, string>> = {
  sites: { is_primary: 'Primary site' },
};

/** Passwords never appear in the log — only the fact that they moved. */
export const AUDIT_SENSITIVE = new Set([
  'system_credentials',
  'cred_router',
  'cred_phone_system',
  'cred_other',
]);

/** Empty, null and missing all count as the same value, so clearing an empty field is not a change. */
const auditNorm = (v: unknown) =>
  v === null || v === undefined || v === '' ? '' : typeof v === 'boolean' ? v : String(v);

/** Just enough of a job to name it in the log. */
export interface AuditJobLite {
  id: string;
  type: string | null;
  title: string | null;
  svc_internet?: boolean | null;
  svc_webex?: boolean | null;
  svc_nec?: boolean | null;
  clients: { company: string | null } | null;
}

/**
 * The names behind the ids the audit rows store. The single-file app read these off its
 * module-level allClients / allProfiles / allJobs / allComplaints.
 */
export interface AuditLookups {
  clients: Record<string, string>;
  profiles: Record<string, string>;
  jobs: Record<string, string>;
  complaints: Record<string, string>;
}

export const EMPTY_LOOKUPS: AuditLookups = { clients: {}, profiles: {}, jobs: {}, complaints: {} };

export const jobLabel = (j: AuditJobLite) =>
  `${j.clients?.company || 'Unknown'} · ${j.type === 'New Install' ? svcLabel(j) : j.title || '—'}`;

export function fmtAuditVal(key: string, val: unknown, look: AuditLookups): string {
  if (val === null || val === undefined || val === '') return '(empty)';
  if (typeof val === 'boolean') return val ? 'On' : 'Off';
  const id = String(val);
  if (key === 'client_id') return look.clients[id] || id;
  if (key === 'assigned_to' || key === 'created_by') return look.profiles[id] || id;
  if (key === 'created_at') return fmtDateTime(id);
  if (key === 'job_id') return look.jobs[id] || id;
  if (key === 'complaint_id') return look.complaints[id] || id;
  if (Array.isArray(val)) return val.join(', ') || '(empty)';
  return String(val);
}

export interface AuditChange {
  label: string;
  /** 'diff' shows old → new; 'value' shows the new value alone; the others stand in for a secret. */
  kind: 'diff' | 'value' | 'changed' | 'set';
  from?: string;
  to?: string;
}

const asRecord = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' ? (v as Record<string, unknown>) : {};

/** The field-level diff under an entry: what changed on an update, what was filled in on a create. */
export function auditDiff(a: AuditLog, look: AuditLookups): AuditChange[] {
  const rows: AuditChange[] = [];
  const newD = asRecord(a.new_data);
  const label = (k: string) =>
    AUDIT_TABLE_LABELS[a.table_name]?.[k] || AUDIT_LABELS[k] || k;

  if (a.action === 'updated') {
    const oldD = asRecord(a.old_data);
    for (const k of Object.keys(newD)) {
      if (auditNorm(oldD[k]) === auditNorm(newD[k])) continue;
      if (AUDIT_SENSITIVE.has(k)) rows.push({ label: label(k), kind: 'changed' });
      else
        rows.push({
          label: label(k),
          kind: 'diff',
          from: fmtAuditVal(k, oldD[k], look),
          to: fmtAuditVal(k, newD[k], look),
        });
    }
  } else if (a.action === 'created' || a.action === 'invited') {
    for (const k of Object.keys(newD)) {
      const v = newD[k];
      // A create lists what was actually filled in, not every blank column
      if (
        v === null ||
        v === undefined ||
        v === '' ||
        (typeof v === 'boolean' && !v) ||
        (Array.isArray(v) && !v.length)
      )
        continue;
      if (AUDIT_SENSITIVE.has(k)) rows.push({ label: label(k), kind: 'set' });
      else rows.push({ label: label(k), kind: 'value', to: fmtAuditVal(k, v, look) });
    }
  } else if (a.action === 'deactivated') {
    for (const k of ['jobs_unassigned', 'complaints_unassigned'])
      rows.push({ label: label(k), kind: 'value', to: String(newD[k] ?? 0) });
  }
  return rows;
}

/** The record's own name, when the entry carried one. */
export function auditSubject(a: AuditLog): string | null {
  const d = asRecord(a.new_data);
  const v = d.title || d.company || d.name;
  return typeof v === 'string' && v ? v : null;
}
