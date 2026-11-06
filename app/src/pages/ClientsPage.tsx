import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ClientSvcBadges } from '../components/Badges';
import { CRED_FIELDS } from '../lib/creds';
import { fmtDate } from '../lib/format';
import { isAdmin, isAdminOrOps } from '../lib/roles';
import { useAuth } from '../state/AuthProvider';
import { useClients, type ClientListRow } from '../hooks/useClients';
import { useClientActions } from '../components/clients/useClientActions';

type Filter = 'active' | 'cancelled' | 'hardware' | 'all';
type SortKey = 'company' | 'account';

const FILTERS: { f: Filter; label: string }[] = [
  { f: 'active', label: 'Active' },
  { f: 'cancelled', label: 'Cancelled' },
  { f: 'hardware', label: 'Hardware only' },
  { f: 'all', label: 'All' },
];

const HEADING: Record<Filter, string> = {
  active: 'Active',
  cancelled: 'Cancelled',
  hardware: 'Hardware only',
  all: 'All',
};

export function ClientsPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { data: clients = [], isLoading } = useClients();
  const { openClientModal, deleteClient } = useClientActions();

  // A search handed over by the call bar ("Search clients" for an unknown caller). It rides on
  // the router's location state rather than ?q=, so callers' numbers stay out of the URL.
  const location = useLocation();
  const handedQ = (location.state as { q?: string } | null)?.q;
  const [q, setQ] = useState(handedQ ?? '');
  useEffect(() => {
    if (handedQ !== undefined) setQ(handedQ);
  }, [handedQ, location.key]);
  // Cancelled accounts have clients.cancelled_date set; the list shows everyone by default
  const [filter, setFilter] = useState<Filter>('all');
  // Clicking the Company or Account # title sorts by it; clicking it again reverses.
  const [sort, setSort] = useState<{ key: SortKey; dir: number }>({ key: 'company', dir: 1 });

  const setClientSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: -s.dir } : { key, dir: 1 }));

  const query = q.toLowerCase();

  const rows = useMemo(() => {
    // Credentials are searched too (e.g. an IP); only the matching field's name is shown, never its text
    // Phone numbers match with spaces ignored on both sides ("0402 298 388")
    const qDigits = query.replace(/\s/g, '');
    const basicHit = (c: ClientListRow) =>
      c.company.toLowerCase().includes(query) ||
      (c.account_number ?? '').toLowerCase().includes(query) ||
      (!!qDigits && (c.phone ?? '').replace(/\s/g, '').includes(qDigits));
    const credHit = (c: ClientListRow) =>
      CRED_FIELDS.find((cf) => (c[cf.col] ?? '').toString().toLowerCase().includes(query));
    // Contacts match on name or email, and on phone/mobile
    const contactHit = (c: ClientListRow) =>
      (c.client_contacts ?? []).find(
        (ct) =>
          (ct.name ?? '').toLowerCase().includes(query) ||
          (ct.email ?? '').toLowerCase().includes(query) ||
          (!!qDigits && [ct.phone, ct.mobile].some((n) => (n ?? '').replace(/\s/g, '').includes(qDigits))),
      );

    const inFilter = (c: ClientListRow) =>
      filter === 'all'
        ? true
        : filter === 'hardware'
          ? !!c.hardware_only
          : (filter === 'cancelled') === !!c.cancelled_date;

    const matched = clients.filter(
      (c) => inFilter(c) && (!query || basicHit(c) || contactHit(c) || credHit(c)),
    );

    // Account numbers sort as numbers; clients with no number or a text one ("Camera Only")
    // always go last, by name.
    const byName = (a: ClientListRow, b: ClientListRow) =>
      (a.company || '').localeCompare(b.company || '', undefined, { sensitivity: 'base' });
    const acctNo = (c: ClientListRow) => {
      const m = (c.account_number ?? '').trim().match(/^\d+/);
      return m ? +m[0] : null;
    };
    const { key, dir } = sort;
    return matched.slice().sort(
      key === 'account'
        ? (a, b) => {
            const x = acctNo(a);
            const y = acctNo(b);
            if (x === null || y === null) return x === y ? byName(a, b) : x === null ? 1 : -1;
            return (x - y) * dir || byName(a, b);
          }
        : (a, b) => byName(a, b) * dir,
    );
  }, [clients, query, filter, sort]);

  /** Why a client matched when the match was not in a column on screen. */
  const matchNote = (c: ClientListRow) => {
    if (!query) return null;
    const qDigits = query.replace(/\s/g, '');
    const basic =
      c.company.toLowerCase().includes(query) ||
      (c.account_number ?? '').toLowerCase().includes(query) ||
      (!!qDigits && (c.phone ?? '').replace(/\s/g, '').includes(qDigits));
    if (basic) return null;
    const ct = (c.client_contacts ?? []).find(
      (x) =>
        (x.name ?? '').toLowerCase().includes(query) ||
        (x.email ?? '').toLowerCase().includes(query) ||
        (!!qDigits && [x.phone, x.mobile].some((n) => (n ?? '').replace(/\s/g, '').includes(qDigits))),
    );
    if (ct)
      return (
        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
          <i className="ti ti-user" style={{ fontSize: 11 }} /> Match in contact{' '}
          {ct.name || ct.email || ct.mobile || ct.phone}
        </div>
      );
    const hit = CRED_FIELDS.find((cf) => (c[cf.col] ?? '').toString().toLowerCase().includes(query));
    return hit ? (
      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
        <i className="ti ti-lock" style={{ fontSize: 11 }} /> Match in {hit.label} credentials
      </div>
    ) : null;
  };

  const arrow = (key: SortKey) => (sort.key === key ? (sort.dir > 0 ? '▲' : '▼') : '');

  return (
    <div className="page active" id="page-clients">
      <div className="search-bar">
        <i className="ti ti-search" />
        <input
          type="text"
          placeholder="Search company, account #, phone, IP..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <div className="filter-bar">
        {FILTERS.map(({ f, label }) => (
          <button
            key={f}
            className={`filter-btn${filter === f ? ' active' : ''}`}
            onClick={() => setFilter(f)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="card">
        <div className="card-head">
          <h3>{`${HEADING[filter]} clients (${rows.length})`}</h3>
          <div className="card-head-actions">
            {isAdminOrOps(profile) && (
              <button className="btn btn-primary btn-sm" onClick={() => openClientModal()}>
                <i className="ti ti-plus" /> Add client
              </button>
            )}
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th className="th-sort" onClick={() => setClientSort('company')}>
                  Company <span className="sort-arrow">{arrow('company')}</span>
                </th>
                <th className="th-sort" onClick={() => setClientSort('account')}>
                  Account # <span className="sort-arrow">{arrow('account')}</span>
                </th>
                <th>Phone</th>
                <th>Services</th>
                <th>Sites</th>
                <th>Jobs</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.length ? (
                rows.map((c) => (
                  <tr key={c.id} className="clickable" onClick={() => navigate(`/client/${c.id}`)}>
                    <td>
                      <strong style={{ fontWeight: 500 }}>{c.company}</strong>
                      {c.hardware_only && (
                        <>
                          {' '}
                          <span className="badge badge-purple" title="No recurring billing">
                            Hardware only
                          </span>
                        </>
                      )}
                      {c.cancelled_date && (
                        <>
                          {' '}
                          <span className="badge badge-gray" title={`Cancelled ${fmtDate(c.cancelled_date)}`}>
                            Cancelled
                          </span>
                        </>
                      )}
                      {matchNote(c)}
                    </td>
                    <td style={{ fontFamily: "'DM Mono',monospace", fontSize: 12, color: 'var(--text2)' }}>
                      {c.account_number || '—'}
                    </td>
                    <td style={{ fontFamily: "'DM Mono',monospace", fontSize: 12, color: 'var(--text2)' }}>
                      {c.phone || '—'}
                    </td>
                    <td>
                      <ClientSvcBadges jobs={c.jobs} />
                    </td>
                    <td>{(c.sites ?? []).length}</td>
                    <td>{(c.jobs ?? []).length}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {isAdminOrOps(profile) && (
                          <button
                            className="btn btn-sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              openClientModal(c.id);
                            }}
                          >
                            <i className="ti ti-edit" />
                          </button>
                        )}
                        {isAdmin(profile) && (
                          <button
                            className="btn btn-sm btn-danger"
                            onClick={(e) => {
                              e.stopPropagation();
                              void deleteClient(c.id);
                            }}
                          >
                            <i className="ti ti-trash" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7}>
                    <div className="empty">
                      <i className={`ti ${isLoading ? 'ti-refresh' : 'ti-search'}`} />
                      <p>{isLoading ? 'Loading...' : 'No clients found.'}</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
