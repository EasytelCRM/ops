import { fmtDateTime } from '../../../lib/format';
import { useProfiles } from '../../../hooks/useClients';
import type { CallLog } from '../../../lib/db.types';

/** 95 → "1:35". A call still going (or whose end Webex never reported) shows a dash. */
const length = (s: number | null) =>
  s === null ? '—' : `${Math.floor(s / 60)}:${String(Math.max(0, s) % 60).padStart(2, '0')}`;

/** Answered Webex calls from this client's numbers. Admin-only. */
export function CallsTab({ calls }: { calls: CallLog[] }) {
  const { data: profiles = [] } = useProfiles();
  const who = (c: CallLog) =>
    profiles.find((p) => p.id === c.profile_id)?.full_name ?? 'Someone not linked to Webex yet';

  if (!calls.length)
    return (
      <div className="empty">
        <i className="ti ti-phone" />
        <p>No answered calls logged yet.</p>
      </div>
    );

  return (
    <div>
      {calls.map((c) => (
        <div className="job-card" key={c.id}>
          <div className="job-body">
            <div className="job-title" style={{ fontSize: 14 }}>
              <i className="ti ti-phone-incoming" /> Answered by {who(c)}
            </div>
            <div className="job-meta">
              <span>
                <i className="ti ti-calendar" style={{ fontSize: 11 }} /> {fmtDateTime(c.answered_at)}
              </span>
              <span>
                <i className="ti ti-clock" style={{ fontSize: 11 }} /> {length(c.duration_s)}
              </span>
              <span style={{ fontFamily: "'DM Mono',monospace" }}>
                <i className="ti ti-phone" style={{ fontSize: 11 }} /> {c.number ?? 'Withheld'}
                {c.caller_name ? ` · ${c.caller_name}` : ''}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
