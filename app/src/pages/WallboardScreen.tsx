import { useEffect, useState } from 'react';
import { useAuth } from '../state/AuthProvider';
import { useLiveUpdates } from '../lib/realtime';
import { useUpdateCheck } from '../hooks/useUpdateCheck';
import { WallboardFrame } from '../components/callstats/WallboardFrame';
import type { Period } from '../hooks/useCallStats';

/**
 * All a wallboard login ever sees: the sales call stats at TV size. The database refuses
 * this role everything else, so there is no sidebar or any other page to reach.
 */
export function WallboardScreen() {
  const { signOut } = useAuth();
  const [period, setPeriod] = useState<Period>('today');

  // call_legs changes refresh the board; the other tables' events never reach this login
  useLiveUpdates();

  // Nobody types on a TV, so a new deploy reloads it straight away rather than offering to
  const { newVersion, reloadForUpdate } = useUpdateCheck(true);
  useEffect(() => {
    if (newVersion) reloadForUpdate();
  }, [newVersion, reloadForUpdate]);

  return (
    <WallboardFrame
      period={period}
      onPeriod={setPeriod}
      action={
        <button className="btn btn-sm" onClick={() => void signOut()} title="Sign out of the wallboard">
          <i className="ti ti-logout" />
        </button>
      }
    />
  );
}
