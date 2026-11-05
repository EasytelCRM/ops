import { hasUnsavedWork } from '../../lib/unsavedWork';
import { useToast } from '../../state/ToastProvider';

/**
 * Shown once a newer deploy is found and an automatic reload would have lost work.
 *
 * TODO (Phase 1): once the modal system lands, swap the warning toast for the
 * confirmDiscard() prompt the single-file app used, so the user can choose to
 * reload and lose the unsaved work.
 */
export function UpdateBar({ onReload }: { onReload: () => void }) {
  const toast = useToast();

  const click = () => {
    if (hasUnsavedWork()) {
      toast('Finish or close the open form first, then reload', 'warn');
      return;
    }
    onReload();
  };

  return (
    <div className="update-bar">
      <i className="ti ti-refresh" />
      <span>A new version of the CRM is available. Save your work, then reload.</span>
      <button className="btn btn-primary btn-sm" onClick={click}>
        Reload
      </button>
    </div>
  );
}
