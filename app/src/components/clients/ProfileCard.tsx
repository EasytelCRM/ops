import type { ReactNode } from 'react';
import { ClientSvcBadges } from '../Badges';
import { Mail, Tel } from '../Links';
import { fmtDate, initials } from '../../lib/format';
import { isAdmin, isAdminOrOps } from '../../lib/roles';
import { useAuth } from '../../state/AuthProvider';
import type { ClientContact } from '../../lib/db.types';
import type { ClientProfileData } from '../../hooks/useClients';

/** One labelled line on the card; renders nothing when there is no value. */
function Pf({ icon, label, children }: { icon: string; label: string; children?: ReactNode }) {
  if (children === null || children === undefined || children === '') return null;
  return (
    <div className="pf">
      <i className={`ti ${icon}`} />
      <div>
        <div className="pf-label">{label}</div>
        <div className="pf-value">{children}</div>
      </div>
    </div>
  );
}

const ContactName = ({ ct }: { ct: ClientContact }) => (
  <>
    {ct.name || '(no name)'}
    {ct.note && <span style={{ color: 'var(--text3)' }}> · {ct.note}</span>}
  </>
);

/** The dot-separated phone/mobile/email line under a contact's name. */
function ContactSub({ parts }: { parts: ReactNode[] }) {
  if (!parts.length) return null;
  return (
    <div className="pf-contact-sub">
      {parts.map((p, i) => (
        <span key={i}>
          {i > 0 && ' · '}
          {p}
        </span>
      ))}
    </div>
  );
}

export function ProfileCard({
  data,
  onEdit,
  onDelete,
}: {
  data: ClientProfileData;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { profile } = useAuth();
  const { client, sites, jobs, contacts } = data;
  // Only a site someone marked primary: the oldest can be an address the client moved from
  const mainSite = sites.find((s) => s.is_primary);

  // The primary contact sits under Phone/Email (its own phone and email only where they
  // differ from the client's); everyone else is listed under Other contacts.
  const primary = contacts.find((ct) => ct.is_primary);
  const others = contacts.filter((ct) => ct !== primary);

  const primarySub: ReactNode[] = [];
  if (primary?.phone && primary.phone !== client.phone)
    primarySub.push(<Tel value={primary.phone} key="p" />);
  if (primary?.email && primary.email !== client.email)
    primarySub.push(<Mail value={primary.email} key="e" />);

  return (
    <div className="profile-card">
      <div className="profile-avatar">{initials(client.company)}</div>
      <div className="profile-name">{client.company}</div>
      <div className="profile-sub">Business client</div>
      {(client.hardware_only || client.cancelled_date) && (
        <div style={{ margin: '-4px 0 12px', display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {client.hardware_only && (
            <span className="badge badge-purple" title="No recurring billing">
              Hardware only
            </span>
          )}
          {client.cancelled_date && (
            <span className="badge badge-gray">Cancelled · {fmtDate(client.cancelled_date)}</span>
          )}
        </div>
      )}

      <Pf icon="ti-hash" label="Account number">
        {client.account_number}
      </Pf>
      <Pf icon="ti-phone" label="Phone">
        {client.phone}
      </Pf>
      <Pf icon="ti-mail" label="Email">
        {client.email}
      </Pf>

      {primary && (
        <>
          <div className="pf">
            <i className="ti ti-user" />
            <div style={{ minWidth: 0 }}>
              <div className="pf-label">Contact</div>
              <div className="pf-value">
                <ContactName ct={primary} />
              </div>
              <ContactSub parts={primarySub} />
            </div>
          </div>
          {primary.mobile && (
            <Pf icon="ti-device-mobile" label="Mobile">
              <Tel value={primary.mobile} />
            </Pf>
          )}
        </>
      )}

      {others.length > 0 && (
        <div className="pf">
          <i className="ti ti-users" />
          <div style={{ minWidth: 0 }}>
            <div className="pf-label">Other contacts</div>
            {others.map((ct) => (
              <div className="pf-contact" key={ct.id}>
                <div className="pf-value">
                  <ContactName ct={ct} />
                </div>
                <ContactSub
                  parts={[
                    ct.phone ? <Tel value={ct.phone} key="p" /> : null,
                    ct.mobile ? <Tel value={ct.mobile} key="m" /> : null,
                    ct.email ? <Mail value={ct.email} key="e" /> : null,
                  ].filter(Boolean)}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {mainSite?.address && (
        <Pf icon="ti-map-pin" label="Main site">
          {mainSite.address}
        </Pf>
      )}
      <Pf icon="ti-calendar" label="Client since">
        {fmtDate(client.created_at)}
      </Pf>

      <div className="pf">
        <i className="ti ti-apps" />
        <div>
          <div className="pf-label">Services</div>
          <div style={{ marginTop: 4 }}>
            <ClientSvcBadges jobs={jobs} />
          </div>
        </div>
      </div>

      <div className="profile-actions">
        {isAdminOrOps(profile) && (
          <button className="btn btn-sm" onClick={onEdit}>
            <i className="ti ti-edit" /> Edit
          </button>
        )}
        {isAdmin(profile) && (
          <button className="btn btn-sm btn-danger" onClick={onDelete}>
            <i className="ti ti-trash" /> Delete
          </button>
        )}
      </div>
    </div>
  );
}
