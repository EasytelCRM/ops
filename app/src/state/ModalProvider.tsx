import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

interface ModalEntry {
  id: number;
  node: ReactNode;
  /** Called with the modal's result once it leaves the stack, however it left. */
  settle?: (result: unknown) => void;
  /** Result to settle with if the modal is dismissed rather than answered. */
  dismissResult?: unknown;
}

export interface GoTo {
  label: string;
  go: () => void;
}

interface ModalValue {
  openModal: (node: ReactNode) => void;
  closeModal: () => void;
  confirmDiscard: (msg: string, goTo?: GoTo) => Promise<boolean>;
  isModalOpen: boolean;
}

const ModalContext = createContext<ModalValue>({
  openModal: () => {},
  closeModal: () => {},
  confirmDiscard: async () => true,
  isModalOpen: false,
});

type LocationState = { modalDepth?: number } | null;

/**
 * One history entry per open modal, so the phone back button closes the modal rather
 * than leaving the page — which is what the single-file app did with pushState and
 * history.back(). Here the depth rides on the router's location state, so the router
 * and the modal stack can never disagree about how deep we are.
 */
export function ModalProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [stack, setStack] = useState<ModalEntry[]>([]);
  const nextId = useRef(0);
  const stackRef = useRef(stack);
  stackRef.current = stack;

  const depth = (location.state as LocationState)?.modalDepth ?? 0;

  // History moved (back button, or a navigation away): trim the stack to match it
  // and settle whatever was dropped with its dismiss result.
  useEffect(() => {
    const current = stackRef.current;
    if (current.length <= depth) return;
    const dropped = current.slice(depth);
    setStack(current.slice(0, depth));
    dropped.forEach((e) => e.settle?.(e.dismissResult));
  }, [depth, location.key]);

  const push = useCallback(
    (entry: Omit<ModalEntry, 'id'>) => {
      const id = nextId.current++;
      setStack((s) => [...s, { ...entry, id }]);
      navigate(location.pathname + location.search, {
        state: { ...(location.state as object), modalDepth: depth + 1 },
        replace: false,
      });
    },
    [depth, location.pathname, location.search, location.state, navigate],
  );

  /** Drops the top modal by stepping back through history, which the effect above picks up. */
  const closeModal = useCallback(() => {
    if (!stackRef.current.length) return;
    navigate(-1);
  }, [navigate]);

  const openModal = useCallback((node: ReactNode) => push({ node }), [push]);

  const confirmDiscard = useCallback(
    (msg: string, goTo?: GoTo) =>
      new Promise<boolean>((resolve) => {
        let followAfter = false;
        const settle = (result: unknown) => {
          resolve(result === true);
          if (followAfter) goTo?.go();
        };
        const answer = (ok: boolean, follow = false) => {
          followAfter = follow;
          // Mark the answer, then unwind history; the effect settles the promise once
          // the entry actually leaves, so a caller that navigates next cannot race it.
          setStack((s) => s.map((e, i) => (i === s.length - 1 ? { ...e, dismissResult: ok } : e)));
          navigate(-1);
        };
        push({
          dismissResult: false,
          settle,
          node: (
            <div className="modal" style={{ width: 440 }}>
              <div className="modal-hdr">
                <h3>Unsaved changes</h3>
                <button className="modal-x" onClick={() => answer(false)}>
                  <i className="ti ti-x" />
                </button>
              </div>
              <p style={{ fontSize: 14, color: 'var(--text2)' }}>{msg}</p>
              {goTo && (
                <p style={{ marginTop: '.75rem', fontSize: 13 }}>
                  <span
                    style={{ color: 'var(--accent)', cursor: 'pointer' }}
                    onClick={() => answer(false, true)}
                  >
                    <i className="ti ti-arrow-right" /> Go to it: {goTo.label}
                  </span>
                </p>
              )}
              <div className="modal-ftr">
                <button className="btn" onClick={() => answer(false)}>
                  Keep editing
                </button>
                <button className="btn btn-danger" onClick={() => answer(true)}>
                  Discard
                </button>
              </div>
            </div>
          ),
        });
      }),
    [navigate, push],
  );

  return (
    <ModalContext.Provider value={{ openModal, closeModal, confirmDiscard, isModalOpen: stack.length > 0 }}>
      {children}
      {stack.map((entry) => (
        <div className="modal-overlay" key={entry.id}>
          {entry.node}
        </div>
      ))}
    </ModalContext.Provider>
  );
}

export const useModal = () => useContext(ModalContext);
