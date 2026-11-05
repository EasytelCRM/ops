import { isActiveStaff } from '../lib/roles';
import type { Profile } from '../lib/db.types';

/**
 * The options inside a "who is this on" dropdown. Deactivated staff are dropped, unless
 * the record is still assigned to one — then they stay, marked, so saving the record
 * does not quietly reassign it.
 */
export function StaffOptions({
  profiles,
  selectedId,
  emptyLabel = '— Unassigned —',
}: {
  profiles: Profile[];
  selectedId: string | null | undefined;
  emptyLabel?: string;
}) {
  return (
    <>
      <option value="">{emptyLabel}</option>
      {profiles
        .filter((u) => isActiveStaff(u) || u.id === selectedId)
        .map((u) => (
          <option key={u.id} value={u.id}>
            {u.full_name}
            {isActiveStaff(u) ? '' : ' (deactivated)'}
          </option>
        ))}
    </>
  );
}
