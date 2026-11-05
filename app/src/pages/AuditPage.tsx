import { useQueryClient } from '@tanstack/react-query';
import { useAuditLog } from '../hooks/useAuditLog';
import {
  auditDiff,
  auditSubject,
  EMPTY_LOOKUPS,
  type AuditChange,
  type AuditLookups,
} from '../lib/auditView';
import type { AuditLog } from '../lib/db.types';
import { fmtDateTime } from '../lib/format';

function Change({ c }: { c: AuditChange }) {
  return (
    <div className="audit-change">
      {c.label}:{' '}
      {c.kind === 'diff' ? (
        <>
          <span className="audit-old">{c.from}</span> → <span className="audit-new">{c.to}</span>
        </>
      ) : c.kind === 'value' ? (
        <span className="audit-new">{c.to}</span>
      ) : (
        <em>{c.kind === 'set' ? 'set' : 'changed'}</em>
      )}
    </div>
  );
}

function Entry({ a, lookups }: { a: AuditLog; lookups: AuditLookups }) {
  const changes = auditDiff(a, lookups);
  const subject = auditSubject(a);
  return (
    <div className="audit-item">
      <div className="audit-dot" />
      <div className="audit-text">
        <strong>{a.user_email || 'System'}</strong> {a.action} a <strong>{a.table_name}</strong>{' '}
        record {subject ? `(${subject})` : ''}
        {changes.length > 0 && (
          <div className="audit-changes">
            {changes.map((c, i) => (
              <Change c={c} key={`${c.label}-${i}`} />
            ))}
          </div>
        )}
      </div>
      <div className="audit-time">{fmtDateTime(a.created_at)}</div>
    </div>
  );
}

export function AuditPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error } = useAuditLog();

  const entries = data?.entries ?? [];
  const lookups = data?.lookups ?? EMPTY_LOOKUPS;

  return (
    <div className="page active" id="page-audit">
      <div className="card">
        <div className="card-head">
          <h3>Audit log</h3>
          <button
            className="btn btn-sm"
            onClick={() => void queryClient.invalidateQueries({ queryKey: ['audit'] })}
          >
            <i className="ti ti-refresh" /> Refresh
          </button>
        </div>
        <div className="card-body" id="audit-list">
          {entries.length ? (
            entries.map((a) => <Entry a={a} lookups={lookups} key={a.id} />)
          ) : (
            <div className="empty">
              <i className="ti ti-history" />
              <p>
                {isLoading
                  ? 'Loading...'
                  : isError
                    ? `Error loading audit log: ${(error as Error).message}`
                    : 'No activity yet.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
