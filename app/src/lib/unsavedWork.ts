/**
 * Anything an automatic reload would throw away.
 *
 * The single-file app asked one hasUnsavedWork() function, which reached into every
 * dirty flag and textarea by id. Here each editing surface registers its own check as
 * it mounts, so the update bar keeps working as later phases add panes without this
 * file having to know about them.
 */

type UnsavedCheck = () => boolean;

const checks = new Set<UnsavedCheck>();

/** Register a check; call the returned function on unmount. */
export function registerUnsavedCheck(fn: UnsavedCheck): () => void {
  checks.add(fn);
  return () => {
    checks.delete(fn);
  };
}

export const hasUnsavedWork = () => [...checks].some((fn) => fn());
