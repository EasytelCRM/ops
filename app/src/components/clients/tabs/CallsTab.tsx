import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, MouseEvent } from 'react';
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
  | { state: 'ready' }
  | { state: 'message'; text: string };

/** The recording playing right now, on any card, so starting another one stops it. */
let active: HTMLAudioElement | null = null;

/**
 * One call card with an inline mini player for its Webex recording. The `call-recording` Edge
 * Function finds it and hands back Webex's own short-lived link; the audio streams from Webex and
 * nothing is saved in the CRM. While a recording is playing the details line becomes a progress bar
 * you can click to skip; pausing brings the details back and play carries on from the same spot.
 */
function CallCard({ call: c, who }: { call: CallLog; who: string }) {
  const [p, setP] = useState<Playback>({ state: 'idle' });
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);
  const audio = useRef<HTMLAudioElement | null>(null);
  const out = c.direction === 'out';

  // Stop the audio if the card goes away (another tab, another client).
  useEffect(
    () => () => {
      audio.current?.pause();
      if (active === audio.current) active = null;
    },
    [],
  );

  const start = (a: HTMLAudioElement) => {
    if (active && active !== a) active.pause();
    active = a;
    a.play().catch((e: Error) => setP({ state: 'message', text: `Couldn't play the recording: ${e.message}` }));
  };

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
      if (data?.status !== 'ok' || !data.url) {
        setP({ state: 'message', text: data?.message ?? 'No recording for this call.' });
        return;
      }
      const a = new Audio(data.url);
      a.onplay = () => setPlaying(true);
      a.onpause = () => setPlaying(false);
      a.ontimeupdate = () => setPos(a.currentTime);
      a.onloadedmetadata = () => setDur(a.duration);
      a.onended = () => {
        a.currentTime = 0;
        setPos(0);
      };
      a.onerror = () => setP({ state: 'message', text: "Couldn't play the recording." });
      audio.current = a;
      setP({ state: 'ready' });
      start(a);
    } catch (e) {
      setP({ state: 'message', text: `Couldn't load the recording: ${(e as Error).message}` });
    }
  };

  const toggle = () => {
    const a = audio.current;
    if (p.state === 'ready' && a) {
      if (playing) a.pause();
      else start(a);
    } else void load();
  };

  // Webex streams don't always say how long they are; fall back to the call's own length.
  const total = Number.isFinite(dur) && dur > 0 ? dur : (c.duration_s ?? 0);
  const seek = (to: number) => {
    const a = audio.current;
    if (!a || !total) return;
    a.currentTime = Math.min(Math.max(0, to), total);
    setPos(a.currentTime);
  };
  const onBarClick = (e: MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    seek(((e.clientX - r.left) / r.width) * total);
  };
  const onBarKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowRight') seek(pos + 5);
    else if (e.key === 'ArrowLeft') seek(pos - 5);
    else return;
    e.preventDefault();
  };

  const showBar = p.state === 'ready' && playing;
  const pct = total ? Math.min(100, (pos / total) * 100) : 0;
  const time = { fontSize: 11, color: 'var(--text3)', fontVariantNumeric: 'tabular-nums' } as const;

  return (
    <div className="job-card" style={{ marginBottom: 0, ...(showBar && { borderColor: 'var(--accent)' }) }}>
      <div className="job-body">
        <div className="job-title" style={{ fontSize: 14 }}>
          <i className={`ti ${out ? 'ti-phone-outgoing' : 'ti-phone-incoming'}`} />{' '}
          {out ? 'Called by' : 'Answered by'} {who}
        </div>
        {showBar ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <span style={time}>{length(Math.floor(pos))}</span>
            <div
              role="slider"
              tabIndex={0}
              aria-label="Recording position"
              aria-valuemin={0}
              aria-valuemax={Math.round(total)}
              aria-valuenow={Math.round(pos)}
              aria-valuetext={`${length(Math.floor(pos))} of ${length(Math.round(total))}`}
              onClick={onBarClick}
              onKeyDown={onBarKey}
              style={{ flex: 1, padding: '6px 0', cursor: 'pointer' }}
            >
              <div style={{ height: 4, borderRadius: 2, background: 'var(--border2)', position: 'relative' }}>
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: `${pct}%`,
                    borderRadius: 2,
                    background: 'var(--accent)',
                  }}
                />
              </div>
            </div>
            <span style={time}>{length(Math.round(total))}</span>
          </div>
        ) : (
          <div className="job-meta" style={{ alignItems: 'baseline' }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text2)' }}>
              <i className="ti ti-calendar" style={{ fontSize: 12 }} /> {fmtDateTime(c.answered_at)}
            </span>
            <span>
              <i className="ti ti-clock" style={{ fontSize: 11 }} /> {length(c.duration_s)}
            </span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>
              <i className="ti ti-phone" style={{ fontSize: 11 }} /> {c.number ?? 'Withheld'}
              {c.caller_name && c.caller_name !== c.number ? ` · ${c.caller_name}` : ''}
            </span>
          </div>
        )}
        {p.state === 'message' && (
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 6 }}>{p.text}</div>
        )}
      </div>
      <button
        className="btn btn-sm btn-icon"
        title={p.state === 'loading' ? 'Finding recording…' : playing ? 'Pause' : 'Play recording'}
        aria-label={playing ? 'Pause recording' : 'Play recording'}
        disabled={p.state === 'loading'}
        onClick={toggle}
        style={showBar ? { background: 'var(--accent-light)', color: 'var(--accent-text)' } : undefined}
      >
        <i
          className={`ti ${p.state === 'loading' ? 'ti-loader-2' : playing ? 'ti-player-pause' : 'ti-player-play'}`}
          style={p.state === 'loading' ? { animation: 'spin 0.8s linear infinite' } : undefined}
        />
      </button>
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
