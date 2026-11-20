import { clientName } from '../lib/clientName';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AFTER_HOURS_QUEUE,
  QUEUE_PERIODS,
  queueRange,
  useQueueCalls,
  type QueuePeriod,
} from '../hooks/useQueueCalls';
import { hms } from '../components/callstats/CallStatsBoard';
import { fmtDateTime, localYmd } from '../lib/format';
import type { QueueCall, QueueCallOutcome } from '../lib/db.types';

/** 95 → "1:35"; unknown shows a dash. */
const mmss = (s: number | null) =>
  s === null ? '—' : `${Math.floor(Math.max(0, s) / 60)}:${String(Math.max(0, s) % 60).padStart(2, '0')}`;

const OUTCOME: Record<QueueCallOutcome, { label: string; badge: string }> = {
  answered: { label: 'Answered', badge: 'badge-green' },
  missed: { label: 'Missed', badge: 'badge-red' },
  ringing: { label: 'Ringing', badge: 'badge-amber' },
};

const num = { textAlign: 'right' as const, fontVariantNumeric: 'tabular-nums' as const };

/** "Thu 19 Nov, 5:00 pm", for the window a period covers. */
const fmtEdge = (d: Date) =>
  `${d.toLocaleDateString('en-AU', { weekday: 'short' })} ${d.getDate()} ${d.toLocaleDateString('en-AU', { month: 'short' })}, ` +
  d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' });

function Caller({ c }: { c: QueueCall }) {
  return (
    <>
      <div style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>{c.caller_number ?? 'Withheld'}</div>
      {c.clients.length > 0 && (
        <div style={{ fontSize: 12 }}>
          {c.clients.map((cl, i) => (
            <span key={cl.id}>
              {i > 0 && ', '}
              <Link to={`/client/${cl.id}`}>{clientName(cl)}</Link>
            </span>
          ))}
        </div>
      )}
    </>
  );
}

/**
 * Calls to the "Easytel After Hours" Webex queue, for admins: totals, who answered, and every
 * call with the caller, wait and talk time. From Webex call events, so a caller who hangs up
 * before any phone rings isn't seen.
 */
export function AfterHoursPage() {
  const [period, setPeriod] = useState<QueuePeriod>('today');
  const [day, setDay] = useState(() => localYmd());
  const { data: calls = [], isLoading, error } = useQueueCalls(AFTER_HOURS_QUEUE, period, day);
  const range = period !== 'day' || /^\d{4}-\d{2}-\d{2}$/.test(day) ? queueRange(period, day) : null;

  const totals = useMemo(() => {
    const answered = calls.filter((c) => c.outcome === 'answered');
    const waits = answered.map((c) => c.wait_s).filter((w): w is number => w !== null);
    return {
      offered: calls.length,
      answered: answered.length,
      missed: calls.filter((c) => c.outcome === 'missed').length,
      avgWait: waits.length ? Math.round(waits.reduce((a, b) => a + b, 0) / waits.length) : null,
      maxWait: waits.length ? Math.max(...waits) : null,
      talk: answered.reduce((t, c) => t + (c.talk_s ?? 0), 0),
    };
  }, [calls]);

  const people = useMemo(() => {
    const by = new Map<string, { name: string; calls: number; talk: number }>();
    for (const c of calls) {
      if (c.outcome !== 'answered' || !c.answered_by) continue;
      const p = by.get(c.answered_by) ?? { name: c.answered_by, calls: 0, talk: 0 };
      p.calls += 1;
      p.talk += c.talk_s ?? 0;
      by.set(c.answered_by, p);
    }
    return [...by.values()].sort((a, b) => b.calls - a.calls || b.talk - a.talk || a.name.localeCompare(b.name));
  }, [calls]);

  const pct = totals.offered ? Math.round((totals.answered / totals.offered) * 100) : null;

  return (
    <div className="page active" id="page-after-hours">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div className="filter-bar">
          {QUEUE_PERIODS.map(({ p, label }) => (
            <button key={p} className={`filter-btn${period === p ? ' active' : ''}`} onClick={() => setPeriod(p)}>
              {label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <label className="lbl" htmlFor="ah-day" style={{ margin: 0 }}>
            Night ending
          </label>
          <input
            id="ah-day"
            className="fi"
            type="date"
            value={day}
            max={localYmd()}
            style={{ width: 'auto', ...(period === 'day' ? { borderColor: 'var(--accent)' } : {}) }}
            onChange={(e) => {
              setDay(e.target.value);
              setPeriod('day');
            }}
          />
        </div>
      </div>
      {range && (
        <div style={{ fontSize: 12, color: 'var(--text3)', margin: '-0.25rem 0 0.75rem' }}>
          <i className="ti ti-moon" style={{ fontSize: 12 }} /> {fmtEdge(range.from)} → {fmtEdge(range.to)}
        </div>
      )}

      {error ? (
        <div className="empty">
          <i className="ti ti-alert-circle" />
          <p>Couldn't load After Hours calls: {(error as Error).message}</p>
        </div>
      ) : (
        <>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-label">Calls</div>
              <div className="stat-value">{totals.offered}</div>
              <div className="stat-sub">to the After Hours queue</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Answered</div>
              <div className="stat-value">{totals.answered}</div>
              <div className="stat-sub">
                {pct === null ? 'no calls' : `${pct}% of calls`} · {hms(totals.talk)} talk
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Missed</div>
              <div className="stat-value" style={totals.missed ? { color: 'var(--red)' } : undefined}>
                {totals.missed}
              </div>
              <div className="stat-sub">rang out or caller hung up</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Average wait</div>
              <div className="stat-value">{mmss(totals.avgWait)}</div>
              <div className="stat-sub">{totals.maxWait === null ? 'answered calls' : `longest ${mmss(totals.maxWait)}`}</div>
            </div>
          </div>

          {people.length > 0 && (
            <div className="card">
              <div className="card-head">
                <h3>Who answered</h3>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Agent</th>
                      <th style={num}>Answered</th>
                      <th style={num}>Talk time</th>
                      <th style={num}>Average call</th>
                    </tr>
                  </thead>
                  <tbody>
                    {people.map((p) => (
                      <tr key={p.name}>
                        <td style={{ fontWeight: 500 }}>{p.name}</td>
                        <td style={num}>{p.calls}</td>
                        <td style={num}>{hms(p.talk)}</td>
                        <td style={num}>{mmss(Math.round(p.talk / p.calls))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="card">
            <div className="card-head">
              <h3>Calls</h3>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Caller</th>
                    <th>Outcome</th>
                    <th>Answered by</th>
                    <th style={num}>Wait</th>
                    <th style={num}>Talk</th>
                    <th style={num}>Rang</th>
                  </tr>
                </thead>
                <tbody>
                  {calls.length ? (
                    calls.map((c) => {
                      const o = OUTCOME[c.outcome] ?? OUTCOME.missed;
                      return (
                        <tr key={c.session_id}>
                          <td style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(c.started_at)}</td>
                          <td>
                            <Caller c={c} />
                          </td>
                          <td>
                            <span className={`badge ${o.badge}`}>{o.label}</span>
                          </td>
                          <td>{c.answered_by ?? '—'}</td>
                          <td style={num}>{mmss(c.wait_s)}</td>
                          <td style={num}>{mmss(c.talk_s)}</td>
                          <td style={num} title="How many people it rang">
                            {c.rang}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={7}>
                        <div className="empty">
                          <i className={`ti ${isLoading ? 'ti-refresh' : 'ti-moon'}`} />
                          <p>{isLoading ? 'Loading...' : 'No After Hours calls in this period.'}</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <p style={{ fontSize: 11, color: 'var(--text3)' }}>
        Each night runs from 5pm on the last weekday to 5pm on the day it ends, so Monday holds the whole weekend;
        tonight's calls show under tomorrow. From Webex call events since 16 Nov 2026. Wait runs from when the queue
        started ringing someone until answered (or until a missed caller gave up). A caller who hangs up before any
        phone rings isn't counted.
      </p>
    </div>
  );
}
