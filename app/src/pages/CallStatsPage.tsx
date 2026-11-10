import { useEffect, useState } from 'react';
import { PERIODS, type Period } from '../hooks/useCallStats';
import { CallStatsBoard } from '../components/callstats/CallStatsBoard';
import { ManageTeamModal } from '../components/callstats/ManageTeamModal';
import { WallboardFrame } from '../components/callstats/WallboardFrame';
import { useModal } from '../state/ModalProvider';

/** Sales call stats from Webex, for admins. "Wallboard view" shows it full screen at TV size. */
export function CallStatsPage() {
  const { openModal } = useModal();
  const [period, setPeriod] = useState<Period>('today');
  const [wall, setWall] = useState(false);

  // Leaving browser full screen with Esc also leaves the wallboard view
  useEffect(() => {
    if (!wall) return;
    const onChange = () => {
      if (!document.fullscreenElement) setWall(false);
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, [wall]);

  const enterWall = () => {
    setWall(true);
    void document.documentElement.requestFullscreen?.().catch(() => {});
  };
  const exitWall = () => {
    setWall(false);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  };

  if (wall)
    return (
      <WallboardFrame
        period={period}
        onPeriod={setPeriod}
        action={
          <button className="btn btn-sm" onClick={exitWall}>
            <i className="ti ti-arrows-minimize" /> Exit wallboard
          </button>
        }
      />
    );

  return (
    <div className="page active" id="page-call-stats">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
        <div className="filter-bar">
          {PERIODS.map(({ p, label }) => (
            <button key={p} className={`filter-btn${period === p ? ' active' : ''}`} onClick={() => setPeriod(p)}>
              {label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-sm" onClick={() => openModal(<ManageTeamModal />)}>
            <i className="ti ti-users" /> Manage team
          </button>
          <button className="btn btn-primary btn-sm" onClick={enterWall}>
            <i className="ti ti-device-tv" /> Wallboard view
          </button>
        </div>
      </div>
      <CallStatsBoard period={period} />
      <p style={{ fontSize: 11, color: 'var(--text3)' }}>
        From Webex call events since the stats were switched on. Counts answered external calls only; talk time runs
        from answer to hang-up, hold included.
      </p>
    </div>
  );
}
