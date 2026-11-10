import { useEffect, useMemo, useState } from 'react';
import { useCallStats, type Period } from '../../hooks/useCallStats';
import type { CallStatsRow, CallStatus } from '../../lib/db.types';

/** 3725 → "01:02:05", the way the old PeakAmplify board showed talk time. */
export function hms(total: number) {
  const s = Math.max(0, Math.floor(total));
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
}

/** "3:12", for how long the current call has been going. */
const mmss = (secs: number) => {
  const s = Math.max(0, Math.floor(secs));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const STATUS: Record<CallStatus, { label: string; badge: string }> = {
  on_call: { label: 'On a call', badge: 'badge-green' },
  ringing: { label: 'Ringing', badge: 'badge-amber' },
  dialling: { label: 'Dialling', badge: 'badge-blue' },
  idle: { label: 'Idle', badge: 'badge-gray' },
};

/** Ticks once a second, so live call timers move between refreshes. */
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function StatusBadge({ row, now, big }: { row: CallStatsRow; now: number; big: boolean }) {
  const s = STATUS[row.status] ?? STATUS.idle;
  const since = row.status === 'on_call' && row.status_since ? mmss((now - Date.parse(row.status_since)) / 1000) : '';
  return (
    <span className={`badge ${s.badge}`} style={big ? { fontSize: 'clamp(15px, 1.1vw, 44px)', padding: '0.3em 0.8em' } : undefined}>
      {s.label}
      {since && ` · ${since}`}
    </span>
  );
}

/**
 * The sales team's numbers for a period: team totals, then one row per person, busiest
 * first. `big` is the wallboard size, readable across the room.
 */
export function CallStatsBoard({ period, big = false }: { period: Period; big?: boolean }) {
  const { data: rows = [], isLoading, error } = useCallStats(period);
  const now = useNow();

  const sorted = useMemo(
    () => rows.slice().sort((a, b) => b.total_talk_s - a.total_talk_s || a.name.localeCompare(b.name)),
    [rows],
  );
  const team = useMemo(
    () =>
      rows.reduce(
        (t, r) => ({
          out: t.out + r.out_calls,
          outTalk: t.outTalk + r.out_talk_s,
          inn: t.inn + r.in_calls,
          inTalk: t.inTalk + r.in_talk_s,
          park: t.park + r.park_pickups,
          talk: t.talk + r.total_talk_s,
        }),
        { out: 0, outTalk: 0, inn: 0, inTalk: 0, park: 0, talk: 0 },
      ),
    [rows],
  );

  // Wallboard sizes follow the screen width, so a 1080p or 4K TV is filled the same way
  const th = big ? { fontSize: 'clamp(14px, 1vw, 40px)', padding: '0.8vw 1rem' } : undefined;
  const td = big ? { fontSize: 'clamp(22px, 1.7vw, 68px)', padding: '1.1vw 1rem' } : undefined;
  const num = { ...td, textAlign: 'right' as const, fontFamily: "'DM Mono',monospace" };
  const thNum = { ...th, textAlign: 'right' as const };
  const value = big ? { fontSize: 'clamp(40px, 3.6vw, 140px)' } : undefined;
  const label = big ? { fontSize: 'clamp(12px, 0.9vw, 36px)' } : undefined;
  const sub = big ? { fontSize: 'clamp(13px, 1vw, 40px)' } : undefined;

  if (error)
    return (
      <div className="empty">
        <i className="ti ti-alert-circle" />
        <p>Couldn't load call stats: {(error as Error).message}</p>
      </div>
    );

  return (
    <>
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label" style={label}>Outbound calls</div>
          <div className="stat-value" style={value}>{team.out}</div>
          <div className="stat-sub" style={sub}>{hms(team.outTalk)} talk</div>
        </div>
        <div className="stat-card">
          <div className="stat-label" style={label}>Inbound calls</div>
          <div className="stat-value" style={value}>{team.inn}</div>
          <div className="stat-sub" style={sub}>{hms(team.inTalk)} talk</div>
        </div>
        <div className="stat-card">
          <div className="stat-label" style={label}>Park pickups</div>
          <div className="stat-value" style={value}>{team.park}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label" style={label}>Total talk time</div>
          <div className="stat-value" style={value}>{hms(team.talk)}</div>
        </div>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={th}>Agent</th>
                <th style={th}>Status</th>
                <th style={thNum}>Out calls</th>
                <th style={thNum}>Out talk</th>
                <th style={thNum}>In calls</th>
                <th style={thNum}>In talk</th>
                <th style={thNum}>Park pickups</th>
                <th style={thNum}>Total talk</th>
              </tr>
            </thead>
            <tbody>
              {sorted.length ? (
                sorted.map((r) => (
                  <tr key={r.webex_person_id}>
                    <td style={{ ...td, fontWeight: 500 }}>{r.name}</td>
                    <td style={td}>
                      <StatusBadge row={r} now={now} big={big} />
                    </td>
                    <td style={num}>{r.out_calls}</td>
                    <td style={num}>{hms(r.out_talk_s)}</td>
                    <td style={num}>{r.in_calls}</td>
                    <td style={num}>{hms(r.in_talk_s)}</td>
                    <td style={num}>{r.park_pickups}</td>
                    <td style={{ ...num, fontWeight: 600 }}>{hms(r.total_talk_s)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8}>
                    <div className="empty">
                      <i className={`ti ${isLoading ? 'ti-refresh' : 'ti-users'}`} />
                      <p>{isLoading ? 'Loading...' : 'Nobody is on the sales team yet. Use Manage team to add people.'}</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
