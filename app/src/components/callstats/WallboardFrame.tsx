import { useEffect, useState, type ReactNode } from 'react';
import { PERIODS, type Period } from '../../hooks/useCallStats';
import { CallStatsBoard } from './CallStatsBoard';

/** The clock in the corner, so a frozen screen is obvious from across the room. */
function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 'clamp(22px, 1.7vw, 68px)', color: 'var(--text2)' }}>
      {now.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
    </span>
  );
}

/** Full-screen, TV-sized call stats: shared by the admin "Wallboard view" and the wallboard login. */
export function WallboardFrame({
  period,
  onPeriod,
  action,
}: {
  period: Period;
  onPeriod: (p: Period) => void;
  /** Exit or Sign out, top right. */
  action: ReactNode;
}) {
  const label = PERIODS.find((x) => x.p === period)?.label ?? '';
  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 900, background: 'var(--bg)', overflowY: 'auto', padding: '1.5vw 2vw' }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: '1.25rem',
        }}
      >
        <h1 style={{ fontSize: 'clamp(30px, 2.4vw, 96px)', fontWeight: 500 }}>
          Sales calls <span style={{ color: 'var(--text3)', fontWeight: 300 }}>· {label}</span>
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div className="filter-bar" style={{ margin: 0 }}>
            {PERIODS.map(({ p, label: l }) => (
              <button key={p} className={`filter-btn${period === p ? ' active' : ''}`} onClick={() => onPeriod(p)}>
                {l}
              </button>
            ))}
          </div>
          <Clock />
          {action}
        </div>
      </div>
      <CallStatsBoard period={period} big />
    </div>
  );
}
