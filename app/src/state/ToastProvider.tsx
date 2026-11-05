import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

export type ToastType = 'ok' | 'warn' | 'error';

interface Toast {
  id: number;
  msg: string;
  type: ToastType;
}

const ToastContext = createContext<(msg: string, type?: ToastType) => void>(() => {});

/** Same 3s lifetime and same .toast markup the single-file app appended to <body>. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const toast = useCallback((msg: string, type: ToastType = 'ok') => {
    const id = nextId.current++;
    setToasts((t) => [...t, { id, msg, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3000);
  }, []);

  const icon = (type: ToastType) =>
    type === 'error' ? 'ti-alert-circle' : type === 'warn' ? 'ti-alert-triangle' : 'ti-check';

  return (
    <ToastContext.Provider value={toast}>
      {children}
      {toasts.map((t) => (
        <div className="toast" key={t.id}>
          <i className={`ti ${icon(t.type)}`} /> {t.msg}
        </div>
      ))}
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

/** Lets non-component code (the auth boot sequence) raise a toast. */
export function useToastRef() {
  const toast = useToast();
  return useMemo(() => ({ toast }), [toast]);
}
