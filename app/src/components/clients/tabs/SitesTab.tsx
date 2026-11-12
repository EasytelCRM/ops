import { isAdmin, isAdminOrOps } from '../../../lib/roles';
import { useAuth } from '../../../state/AuthProvider';
import type { Site } from '../../../lib/db.types';

/** Sites arrive primary first (useClientProfile orders them), then oldest first. */
export function SitesTab({
  sites,
  onAdd,
  onEdit,
  onDelete,
  onMakePrimary,
}: {
  sites: Site[];
  onAdd: () => void;
  onEdit: (s: Site) => void;
  onDelete: (id: string) => void;
  onMakePrimary: (s: Site) => void;
}) {
  const { profile } = useAuth();
  const canEdit = isAdminOrOps(profile);
  // Not guessed from age: some clients relocated and keep the old address for records
  const noPrimary = sites.length > 0 && !sites.some((s) => s.is_primary);

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: noPrimary ? 'space-between' : 'flex-end',
          gap: 8,
          marginBottom: 10,
        }}
      >
        {noPrimary && (
          <span className="site-detail">
            <i className="ti ti-info-circle" style={{ fontSize: 12 }} /> No primary site set
          </span>
        )}
        {canEdit && (
          <button className="btn btn-primary btn-sm" onClick={onAdd}>
            <i className="ti ti-plus" /> Add site
          </button>
        )}
      </div>
      {sites.length ? (
        sites.map((s) => (
          <div className="site-card" key={s.id}>
            <div className="site-body">
              <div className="site-name">
                {s.name}
                {s.is_primary && (
                  <span className="badge badge-blue badge-sm" style={{ marginLeft: 6 }}>
                    Primary
                  </span>
                )}
              </div>
              {s.address && (
                <div className="site-detail">
                  <i className="ti ti-map-pin" style={{ fontSize: 12 }} /> {s.address}
                </div>
              )}
            </div>
            {canEdit && (
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                {!s.is_primary && (
                  <button className="btn btn-sm" title="Make primary site" onClick={() => onMakePrimary(s)}>
                    <i className="ti ti-star" /> Make primary
                  </button>
                )}
                <button className="btn btn-sm" onClick={() => onEdit(s)}>
                  <i className="ti ti-edit" />
                </button>
                {isAdmin(profile) && (
                  <button className="btn btn-sm btn-danger" onClick={() => onDelete(s.id)}>
                    <i className="ti ti-trash" />
                  </button>
                )}
              </div>
            )}
          </div>
        ))
      ) : (
        <div className="empty">
          <i className="ti ti-map-pin" />
          <p>No sites yet.</p>
        </div>
      )}
    </div>
  );
}
