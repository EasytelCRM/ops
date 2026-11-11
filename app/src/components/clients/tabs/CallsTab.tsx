import { useState } from 'react';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { fmtDateTime } from '../../../lib/format';
import { sb } from '../../../lib/supabase';
import { useProfiles } from '../../../hooks/useClients';
import type { CallLog } from '../../../lib/db.types';

/** 95 → "1:35". A call still going (or whose end Webex never reported) shows a dash. */
const length = (s: number | null) =>
  s === null ? '—' : `${Math.floor(s / 60)}:${String(Math.max(0, s) % 60).padStart(2, '0')}`;

type Playback =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'ready'; url: string }
  | { state: 'message'; text: string };

/**
 * One call card with an inline play button for its Webex recording. The `call-recording` Edge
 * Function finds it and hands back Webex's own short-lived link; the audio streams from Webex and
 * nothing is saved in the CRM.
 */
function CallCard({ call: c, who }: { call: CallLog; who: string }) {
  const [p, setP] = useState<Playback>({ state: 'idle' });
  const out = c.direction === 'out';

  const load = async () => {
    setP({ state: 'loading' });
    try {
      const { data, error } = await sb.functions.invoke('call-recording', { body: { call_log_id: c.id } });
      if (error) {
        const msg =
          error instanceof FunctionsHttpError
            ? ((await error.context.json().catch(() => null)) as { error?: string } | null)?.error
            : null;
        throw new Error(msg || error.message);
      }
      if (data?.status === 'ok' && data.url) setP({ state: 'ready', url: data.url });
      else setP({ state: 'message', text: data?.message ?? 'No recording for this call.' });
    } catch (e) {
      setP({ state: 'message', text: `Couldn't load the recording: ${(e as Error).message}` });
    }
  };

  return (
    <div className="job-card" style={{ marginBottom: 0, flexWrap: 'wrap' }}>
      <div className="job-body">
        <div className="job-title" style={{ fontSize: 14 }}>
          <i className={`ti ${out ? 'ti-phone-outgoing' : 'ti-phone-incoming'}`} />{' '}
          {out ? 'Called by' : 'Answered by'} {who}
        </div>
        <div className="job-meta">
          <span>
            <i className="ti ti-calendar" style={{ fontSize: 11 }} /> {fmtDateTime(c.answered_at)}
          </span>
          <span>
            <i className="ti ti-clock" style={{ fontSize: 11 }} /> {length(c.duration_s)}
          </span>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>
            <i className="ti ti-phone" style={{ fontSize: 11 }} /> {c.number ?? 'Withheld'}
            {c.caller_name && c.caller_name !== c.number ? ` · ${c.caller_name}` : ''}
          </span>
        </div>
        {p.state === 'message' && (
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 6 }}>{p.text}</div>
        )}
      </div>
      {p.state !== 'ready' && (
        <button
          className="btn btn-sm btn-icon"
          title={p.state === 'loading' ? 'Finding recording…' : 'Play recording'}
          aria-label="Play recording"
          disabled={p.state === 'loading'}
          onClick={() => void load()}
        >
          <i
            className={`ti ${p.state === 'loading' ? 'ti-loader-2' : 'ti-player-play'}`}
            style={p.state === 'loading' ? { animation: 'spin 0.8s linear infinite' } : undefined}
          />
        </button>
      )}
      {p.state === 'ready' && (
        <audio controls autoPlay src={p.url} style={{ width: '100%', height: 36 }} />
      )}
    </div>
  );
}

/** Answered Webex calls with this client's numbers, both ways, with their recordings. Admins and ops. */
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
    // Up to 3 columns; drops to 2 or 1 when a column would be under 240px wide.
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(max(240px, calc((100% - 16px) / 3)), 1fr))',
        gap: 8,
        alignItems: 'start',
      }}
    >
      {calls.map((c) => (
        <CallCard key={c.id} call={c} who={who(c)} />
      ))}
    </div>
  );
}
