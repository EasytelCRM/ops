import { useNavigate } from 'react-router-dom';
import { ComplaintStatusBadge } from '../../Badges';
import { fmtDate } from '../../../lib/format';
import { isAdmin } from '../../../lib/roles';
import { useAuth } from '../../../state/AuthProvider';
import type { ProfileComplaint } from '../../../hooks/useClients';

export function ComplaintsTab({
  complaints,
  onDelete,
}: {
  complaints: ProfileComplaint[];
  onDelete: (id: string) => void;
}) {
  const { profile } = useAuth();
  const navigate = useNavigate();

  if (!complaints.length)
    return (
      <div className="empty">
        <i className="ti ti-message-report" />
        <p>No complaints logged.</p>
      </div>
    );

  return (
    <div>
      {complaints.map((c) => (
        <div
          className="job-card"
          key={c.id}
          style={{ cursor: 'pointer' }}
          onClick={() => navigate(`/complaints?id=${c.id}`)}
        >
          <ComplaintStatusBadge status={c.status} />
          <div className="job-body">
            <div className="job-title job-link">{c.complainant || 'No complainant'}</div>
            <div className="job-meta">
              <span>
                <i className="ti ti-file-text" style={{ fontSize: 11 }} /> {c.tio_ref || 'No TIO ref'}
              </span>
              <span>
                <i className="ti ti-calendar" style={{ fontSize: 11 }} /> Opened {fmtDate(c.open_date)}
              </span>
              {c.closed_date && <span>Closed {fmtDate(c.closed_date)}</span>}
              {c.profiles?.full_name && (
                <span>
                  <i className="ti ti-user" style={{ fontSize: 11 }} /> {c.profiles.full_name}
                </span>
              )}
            </div>
          </div>
          {isAdmin(profile) && (
            <button
              className="btn btn-sm btn-danger hover-del"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(c.id);
              }}
            >
              <i className="ti ti-trash" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
