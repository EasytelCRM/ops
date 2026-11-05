import { useNavigate } from 'react-router-dom';
import { PortingStatusBadge } from '../../Badges';
import { TicketLink } from '../../Links';
import { fmtDate } from '../../../lib/format';
import { isAdminOrOps } from '../../../lib/roles';
import { useAuth } from '../../../state/AuthProvider';
import type { Porting } from '../../../lib/db.types';

export function PortingTab({
  ports,
  clientId,
  onDelete,
}: {
  ports: Porting[];
  clientId: string;
  onDelete: (id: string) => void;
}) {
  const { profile } = useAuth();
  const navigate = useNavigate();

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
        {isAdminOrOps(profile) && (
          <button className="btn btn-primary btn-sm" onClick={() => navigate(`/porting?new=${clientId}`)}>
            <i className="ti ti-plus" /> Log port
          </button>
        )}
      </div>
      {ports.length ? (
        ports.map((p) => (
          <div
            className="job-card"
            key={p.id}
            style={{ cursor: 'pointer' }}
            onClick={() => navigate(`/porting?id=${p.id}`)}
          >
            <PortingStatusBadge status={p.status} />
            <div className="job-body">
              <div className="job-title job-link">
                {p.phone_numbers}
                <TicketLink url={p.ticket_url} />
              </div>
              <div className="job-meta">
                <span>
                  <i className="ti ti-building" style={{ fontSize: 11 }} /> {p.losing_carrier}
                </span>
                {p.port_date && (
                  <span>
                    <i className="ti ti-calendar" style={{ fontSize: 11 }} /> {fmtDate(p.port_date)}
                    {p.port_time ? ` ${p.port_time.slice(0, 5)}` : ''}
                  </span>
                )}
              </div>
            </div>
            {isAdminOrOps(profile) && (
              <button
                className="btn btn-sm btn-danger hover-del"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(p.id);
                }}
              >
                <i className="ti ti-trash" />
              </button>
            )}
          </div>
        ))
      ) : (
        <div className="empty">
          <i className="ti ti-phone-outgoing" />
          <p>No porting tickets yet.</p>
        </div>
      )}
    </div>
  );
}
