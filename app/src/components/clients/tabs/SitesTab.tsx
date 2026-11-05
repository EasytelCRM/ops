import { isAdmin, isAdminOrOps } from '../../../lib/roles';
import { useAuth } from '../../../state/AuthProvider';
import type { Site } from '../../../lib/db.types';

export function SitesTab({
  sites,
  onAdd,
  onEdit,
  onDelete,
}: {
  sites: Site[];
  onAdd: () => void;
  onEdit: (s: Site) => void;
  onDelete: (id: string) => void;
}) {
  const { profile } = useAuth();

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
        {isAdminOrOps(profile) && (
          <button className="btn btn-primary btn-sm" onClick={onAdd}>
            <i className="ti ti-plus" /> Add site
          </button>
        )}
      </div>
      {sites.length ? (
        sites.map((s) => (
          <div className="site-card" key={s.id}>
            <div className="site-body">
              <div className="site-name">{s.name}</div>
              {s.address && (
                <div className="site-detail">
                  <i className="ti ti-map-pin" style={{ fontSize: 12 }} /> {s.address}
                </div>
              )}
            </div>
            {isAdminOrOps(profile) && (
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
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
