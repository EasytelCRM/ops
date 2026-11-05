import { hasUnsavedWork } from '../../lib/unsavedWork';
import { useModal } from '../../state/ModalProvider';
import { useToast } from '../../state/ToastProvider';

/** Shown once a newer deploy is found and an automatic reload would have lost work. */
export function UpdateBar({ onReload }: { onReload: () => void }) {
  const toast = useToast();
  const { isModalOpen, confirmDiscard } = useModal();

  const click = async () => {
    if (isModalOpen) {
      toast('Finish or close the open form first, then reload', 'warn');
      return;
    }
    if (hasUnsavedWork() && !(await confirmDiscard('Reloading will lose your unsaved changes. Reload anyway?')))
      return;
    onReload();
  };

  return (
    <div className="update-bar">
      <i className="ti ti-refresh" />
      <span>A new version of the CRM is available. Save your work, then reload.</span>
      <button className="btn btn-primary btn-sm" onClick={() => void click()}>
        Reload
      </button>
    </div>
  );
}
