import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { useToast } from './ToastProvider';

export type SyncStatus = 'ok' | 'syncing' | 'error';

interface SyncValue {
  status: SyncStatus;
  retry: () => void;
}

const SyncContext = createContext<SyncValue>({ status: 'ok', retry: () => {} });

/**
 * The single-file app called setSyncStatus() by hand at the top and bottom of every
 * load function. Here it is derived from the query cache instead, which covers every
 * fetch automatically — same amber dot, same 10s watchdog, same click-to-retry.
 */
export function SyncProvider({ children }: { children: ReactNode }) {
  const fetching = useIsFetching();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [status, setStatus] = useState<SyncStatus>('ok');

  useEffect(() => {
    if (fetching > 0) {
      setStatus('syncing');
      const t = setTimeout(() => {
        setStatus('error');
        toast('Connection lost — click the sync dot to retry', 'error');
      }, 10000);
      return () => clearTimeout(t);
    }
    const failed = queryClient
      .getQueryCache()
      .getAll()
      .some((q) => q.isActive() && q.state.status === 'error');
    setStatus(failed ? 'error' : 'ok');
    return undefined;
  }, [fetching, queryClient, toast]);

  const retry = () => void queryClient.refetchQueries({ type: 'active' });

  return <SyncContext.Provider value={{ status, retry }}>{children}</SyncContext.Provider>;
}

export const useSync = () => useContext(SyncContext);
