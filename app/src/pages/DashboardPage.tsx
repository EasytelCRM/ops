import { useNavigate } from 'react-router-dom';
import { StatusBadge, SvcBadges } from '../components/Badges';
import { useDashboardData } from '../hooks/useDashboard';
import {
  dashCompare,
  dashCount,
  dashMonth,
  dashRange,
  dealDate,
  setDashPeriod,
  useDashPeriod,
  type DashPeriod,
  type Deal,
} from '../lib/dashboard';
import { fmtDate, localYmd } from '../lib/format';
import { JOB_SVCS, type JobRow } from '../lib/jobs';

const PERIODS: { p: DashPeriod; label: string }[] = [
  { p: 'month', label: 'This month' },
  { p: 'last', label: 'Last month' },
  { p: 'quarter', label: 'This quarter' },
  { p: 'fy', label: 'Financial year to date' },
];

/** A pending install goes red down the left when it is a week past approval and still undated. */
const overdue = (j: JobRow) =>
  j.status === 'Pending' &&
  !!j.approval_date &&
  Date.now() - new Date(j.approval_date).getTime() > 604800000 &&
  !j.due_date;

function InstallCard({ job, onOpen }: { job: JobRow; onOpen: () => void }) {
  return (
    <div
      className="job-card"
      style={{ cursor: 'pointer', ...(overdue(job) ? { borderLeft: '3px solid var(--red)' } : {}) }}
      onClick={onOpen}
    >
      <div className="job-body">
        <div className="job-title" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {job.clients?.company || 'Unknown'}
          <span style={{ display: 'flex', gap: 4 }}>
            <SvcBadges services={job} sm />
          </span>
        </div>
        <div className="job-meta" />
      </div>
      <div style={{ textAlign: 'right', fontSize: 12, color: 'var(--text2)', flexShrink: 0 }}>
        {job.due_date && <div style={{ color: 'var(--accent)' }}>Due: {fmtDate(job.due_date)}</div>}
        {job.approval_date && <div>Approved: {fmtDate(job.approval_date)}</div>}
      </div>
    </div>
  );
}

export function DashboardPage() {
  const navigate = useNavigate();
  const period = useDashPeriod();
  const { data, isLoading } = useDashboardData();

  const deals = data?.deals ?? [];
  const openInstalls = data?.openInstalls ?? [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const r = dashRange(period, today);
  const won = dashCount(deals, r.from, r.to);
  const cmp = dashCompare(won.length, dashCount(deals, r.prevFrom, r.prevTo), r.prevLabel, r.prevFrom);

  const pending = openInstalls.filter((j) => j.status === 'Pending');
  const incomplete = openInstalls.filter((j) => j.status === 'Incomplete');
  const fy = dashRange('fy', today);

  // Last 12 months, this one included; months inside the selected period are highlighted
  const months = Array.from(
    { length: 12 },
    (_, i) => new Date(today.getFullYear(), today.getMonth() - 11 + i, 1),
  );
  const counts = months.map(
    (mo) => dashCount(deals, mo, new Date(mo.getFullYear(), mo.getMonth() + 1, 0)).length,
  );
  const max = Math.max(1, ...counts);
  const inSel = (mo: Date) =>
    mo >= new Date(r.from.getFullYear(), r.from.getMonth(), 1) && mo <= r.to;

  const recent = [...deals]
    .sort(
      (a, b) =>
        dealDate(b).localeCompare(dealDate(a)) || (b.created_at || '').localeCompare(a.created_at || ''),
    )
    .slice(0, 8);

  const openInstall = (id: string) => navigate(`/installs?id=${id}`);

  return (
    <div className="page active" id="page-dashboard">
      <div className="filter-bar">
        {PERIODS.map((x) => (
          <button
            key={x.p}
            className={`filter-btn${period === x.p ? ' active' : ''}`}
            onClick={() => setDashPeriod(x.p)}
          >
            {x.label}
          </button>
        ))}
      </div>

      <div className="stats-grid dash-kpis">
        <div className="stat-card">
          <div className="stat-label">Deals won · {r.label}</div>
          <div className="stat-value">{isLoading ? '—' : won.length}</div>
          <div className={`stat-sub${cmp.cls ? ` ${cmp.cls}` : ''}`}>{isLoading ? '' : cmp.text}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">In progress</div>
          <div className="stat-value">{isLoading ? '—' : pending.length + incomplete.length}</div>
          <div className="stat-sub">
            {pending.length} pending · {incomplete.length} incomplete
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Financial year to date</div>
          <div className="stat-value">{isLoading ? '—' : dashCount(deals, fy.from, fy.to).length}</div>
          <div className="stat-sub">Since {fmtDate(localYmd(fy.from))}</div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Deals per month</h3>
          <span style={{ fontSize: 12, color: 'var(--text3)' }}>Last 12 months</span>
        </div>
        <div className="card-body">
          <div className="dash-chart">
            {months.map((mo, i) => (
              <div
                className="dash-bar-col"
                key={mo.toISOString()}
                title={`${mo.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })}: ${counts[i]} deal${counts[i] === 1 ? '' : 's'}`}
              >
                <span className="dash-bar-n">{counts[i] || ''}</span>
                <div
                  className={`dash-bar${inSel(mo) ? ' hi' : ''}`}
                  style={{ height: Math.round((counts[i] / max) * 130) }}
                />
                <span className="dash-bar-m">{dashMonth(mo, 'short')}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="dash-split">
        <div className="card">
          <div className="card-head">
            <h3>Services sold</h3>
            <span style={{ fontSize: 12, color: 'var(--text3)' }}>{r.label}</span>
          </div>
          <div className="card-body">
            {/* A deal can include several services, so the shares can add up to more than 100% */}
            {won.length ? (
              JOB_SVCS.map(([col, label]) => {
                const n = won.filter((j: Deal) => j[col]).length;
                const pct = Math.round((n / won.length) * 100);
                return (
                  <div className="dash-svc" key={col}>
                    <div className="dash-svc-top">
                      <span>{label}</span>
                      <span>
                        {n} · {pct}%
                      </span>
                    </div>
                    <div className="dash-svc-track">
                      <div className="dash-svc-fill" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="empty" style={{ padding: '1rem 0' }}>
                <p>No deals in this period.</p>
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h3>Recent deals</h3>
            <button className="btn btn-sm" onClick={() => navigate('/installs')}>
              View all
            </button>
          </div>
          <div>
            {recent.length ? (
              recent.map((j) => (
                <div className="dash-deal" key={j.id} onClick={() => openInstall(j.id)}>
                  <div className="dash-deal-co">
                    {j.clients?.company || 'Unknown'}
                    <span style={{ display: 'flex', gap: 4 }}>
                      <SvcBadges services={j} sm />
                    </span>
                  </div>
                  <span className="dash-deal-date">{fmtDate(dealDate(j))}</span>
                  <StatusBadge status={j.status} />
                </div>
              ))
            ) : (
              <div className="empty">
                <i className="ti ti-tool" />
                <p>No deals yet.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3 style={{ color: '#c8a03c' }}>Pending Installs</h3>
          <button className="btn btn-sm" onClick={() => navigate('/installs')}>
            View all
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {isLoading ? (
            <div className="empty" style={{ gridColumn: '1/-1' }}>
              <i className="ti ti-refresh" style={{ animation: 'spin 1s linear infinite' }} />
              <p>Loading...</p>
            </div>
          ) : pending.length ? (
            pending.map((j) => <InstallCard key={j.id} job={j} onOpen={() => openInstall(j.id)} />)
          ) : (
            <div className="empty" style={{ gridColumn: '1/-1' }}>
              <i className="ti ti-tool" />
              <p>No pending installs.</p>
            </div>
          )}
        </div>
      </div>

      {incomplete.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-head">
            <h3 style={{ color: '#c47844' }}>Incomplete Installs</h3>
          </div>
          <div>
            {incomplete.map((j) => (
              <InstallCard key={j.id} job={j} onOpen={() => openInstall(j.id)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
