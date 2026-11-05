import { useNavigate } from 'react-router-dom';
import { LegacyBadge, StatusBadge, TypeBadge, svcLabel } from '../../Badges';
import { TicketLink } from '../../Links';
import { fmtDate } from '../../../lib/format';
import { jobKindOf } from '../../../lib/jobs';
import { isAdmin, isAdminOrOps } from '../../../lib/roles';
import { useAuth } from '../../../state/AuthProvider';
import type { ProfileJob } from '../../../hooks/useClients';

export function JobsTab({
  jobs,
  clientId,
  onDelete,
}: {
  jobs: ProfileJob[];
  clientId: string;
  onDelete: (id: string) => void;
}) {
  const { profile } = useAuth();
  const navigate = useNavigate();

  // The job panes land in Phase 3; the id travels as a search param so the link
  // survives a refresh once those pages read it.
  const openJob = (j: ProfileJob) => navigate(`/${jobKindOf(j)}?id=${j.id}`);

  return (
    <div>
      {/* Techs log service tickets only; installs are admin/ops */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginBottom: 10 }}>
        {isAdminOrOps(profile) && (
          <button className="btn btn-primary btn-sm" onClick={() => navigate(`/installs?new=${clientId}`)}>
            <i className="ti ti-tool" /> Log install
          </button>
        )}
        <button className="btn btn-primary btn-sm" onClick={() => navigate(`/service?new=${clientId}`)}>
          <i className="ti ti-headset" /> Log service
        </button>
      </div>
      {jobs.length ? (
        jobs.map((j) => (
          <div className="job-card" key={j.id}>
            <TypeBadge type={j.type} />
            <div className="job-body">
              <div className="job-title job-link" onClick={() => openJob(j)}>
                {j.type === 'New Install' ? svcLabel(j) : j.title}
                <TicketLink url={j.ticket_url} />
              </div>
              <div className="job-meta">
                {j.sites?.name && <span>{j.sites.name}</span>}
                <LegacyBadge legacy={j.legacy} />
                <StatusBadge status={j.status} />
                {j.profiles?.full_name && (
                  <span>
                    <i className="ti ti-user" style={{ fontSize: 11 }} /> {j.profiles.full_name}
                  </span>
                )}
                {j.due_date && (
                  <span>
                    <i className="ti ti-calendar" style={{ fontSize: 11 }} /> {fmtDate(j.due_date)}
                  </span>
                )}
              </div>
            </div>
            {j.type === 'New Install'
              ? j.approval_date && <div className="job-cost">{fmtDate(j.approval_date)}</div>
              : j.cost != null && j.cost !== 0 && <div className="job-cost">${Number(j.cost).toFixed(2)}</div>}
            {isAdmin(profile) && (
              <button className="btn btn-sm btn-danger hover-del" onClick={() => onDelete(j.id)}>
                <i className="ti ti-trash" />
              </button>
            )}
          </div>
        ))
      ) : (
        <div className="empty">
          <i className="ti ti-tool" />
          <p>No jobs yet.</p>
        </div>
      )}
    </div>
  );
}
