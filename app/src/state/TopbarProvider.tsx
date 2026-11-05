import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

type Cta = ReactNode;

interface TopbarValue {
  cta: Cta;
  setCta: (c: Cta) => void;
}

const TopbarContext = createContext<TopbarValue>({ cta: null, setCta: () => {} });

/**
 * Holds the topbar's right-hand action, which the single-file app wrote into
 * #topbar-cta from showPage(). Each page declares its own with useTopbarCta().
 */
export function TopbarProvider({ children }: { children: ReactNode }) {
  const [cta, setCta] = useState<Cta>(null);
  return <TopbarContext.Provider value={{ cta, setCta }}>{children}</TopbarContext.Provider>;
}

export const useTopbar = () => useContext(TopbarContext);

/** Publish this page's topbar action for as long as the page is mounted. */
export function useTopbarCta(cta: Cta, deps: unknown[] = []) {
  const { setCta } = useTopbar();
  useEffect(() => {
    setCta(cta);
    return () => setCta(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
