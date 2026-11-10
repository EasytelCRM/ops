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
 * Plays the call's Webex recording. The `call-recording` Edge Function finds it and hands back
 * Webex's own short-lived link; the audio streams from Webex and nothing is saved in the CRM.
 */
function Recording({ call }: { call: CallLog }) {
  const [p, setP] = useState<Playback>({ state: 'idle' });

  const load = async () => {
    setP({ state: 'loading' });
    try {
      const { data, error } = await sb.functions.invoke('call-recording', { body: { call_log_id: call.id } });
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

  if (p.state === 'ready')
    return (
      <audio controls autoPlay src={p.url} style={{ width: '100%', height: 36, marginTop: 8 }} />
    );
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
      <button className="btn btn-sm" disabled={p.state === 'loading'} onClick={() => void load()}>
        <i className="ti ti-player-play" /> {p.state === 'loading' ? 'Finding recording…' : 'Play recording'}
      </button>
      {p.state === 'message' && <span style={{ fontSize: 12, color: 'var(--text3)' }}>{p.text}</span>}
    </div>
  );
}

/** Answered Webex calls with this client's numbers, both ways, with their recordings. Admin-only. */
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
      {calls.map((c) => {
        const out = c.direction === 'out';
        return (
          <div className="job-card" key={c.id}>
            <div className="job-body">
              <div className="job-title" style={{ fontSize: 14 }}>
                <i className={`ti ${out ? 'ti-phone-outgoing' : 'ti-phone-incoming'}`} />{' '}
                {out ? 'Called by' : 'Answered by'} {who(c)}
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
              <Recording call={c} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
