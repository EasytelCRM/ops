import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../state/AuthProvider';
import { isAdminOrOps } from '../lib/roles';
import { useClientNotes, useClientProfile } from '../hooks/useClients';
import { useClientCalls } from '../hooks/useCalls';
import { ProfileCard } from '../components/clients/ProfileCard';
import { useClientActions } from '../components/clients/useClientActions';
import { useRecordDeletes } from '../components/clients/useRecordDeletes';
import { ClientNotesTab } from '../components/clients/tabs/ClientNotesTab';
import { CredsTab } from '../components/clients/tabs/CredsTab';
import { JobsTab } from '../components/clients/tabs/JobsTab';
import { PortingTab } from '../components/clients/tabs/PortingTab';
import { ComplaintsTab } from '../components/clients/tabs/ComplaintsTab';
import { SitesTab } from '../components/clients/tabs/SitesTab';
import { CallsTab } from '../components/clients/tabs/CallsTab';

type Tab = 'notes' | 'jobs' | 'creds' | 'porting' | 'complaints' | 'sites' | 'calls';

export function ClientProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const canSeeComplaints = isAdminOrOps(profile);
  const { data, isLoading, error } = useClientProfile(id, canSeeComplaints);
  const { data: notes = [] } = useClientNotes(id);
  // The Webex call log is admins and ops only (RLS enforces it; this only hides the tab)
  const canSeeCalls = isAdminOrOps(profile);
  const { data: calls = [] } = useClientCalls(id, canSeeCalls);
  const { openClientModal, openSiteModal, deleteClient, deleteSite } = useClientActions();
  const { deleteJob, deletePorting, deleteComplaint } = useRecordDeletes(id);
  const [tab, setTab] = useState<Tab>('notes');

  if (isLoading || !data)
    return (
      <div className="page active" id="page-client-profile">
        <div className="empty">
          <i className={`ti ${error ? 'ti-alert-circle' : 'ti-refresh'}`} />
          <p>{error ? `Error loading profile: ${(error as Error).message}` : 'Loading...'}</p>
        </div>
      </div>
    );

  const tabs: { k: Tab; icon: string; label: string; count?: number }[] = [
    { k: 'notes', icon: 'ti-notes', label: 'Notes', count: notes.length },
    { k: 'jobs', icon: 'ti-tool', label: 'Jobs', count: data.jobs.length },
    { k: 'creds', icon: 'ti-lock', label: 'Credentials' },
    { k: 'porting', icon: 'ti-phone-outgoing', label: 'Porting', count: data.ports.length },
    ...(canSeeComplaints
      ? [
          {
            k: 'complaints' as Tab,
            icon: 'ti-message-report',
            label: 'Complaints',
            count: data.complaints.length,
          },
        ]
      : []),
    { k: 'sites', icon: 'ti-map-pin', label: 'Sites', count: data.sites.length },
    ...(canSeeCalls ? [{ k: 'calls' as Tab, icon: 'ti-phone', label: 'Calls', count: calls.length }] : []),
  ];

  // Every panel stays mounted and is hidden with display, as the single-file app did:
  // it is what lets a half-typed note survive a trip to another tab.
  const panel = (k: Tab, display: 'block' | 'flex' = 'block') =>
    ({ display: tab === k ? display : 'none' }) as const;

  return (
    <div className="page active" id="page-client-profile">
      <div className="profile-layout">
        <div>
          <ProfileCard
            data={data}
            onEdit={() => openClientModal(data.client.id)}
            onDelete={() => void deleteClient(data.client.id)}
          />
        </div>
        <div>
          <div className="tabs">
            {tabs.map((t) => (
              <div
                key={t.k}
                className={`tab${tab === t.k ? ' active' : ''}`}
                onClick={() => setTab(t.k)}
              >
                <i className={`ti ${t.icon}`} style={{ fontSize: 15 }} /> {t.label}
                {t.count !== undefined && <span className="tab-count">{t.count}</span>}
              </div>
            ))}
          </div>

          <div style={panel('notes', 'flex')}>
            <ClientNotesTab clientId={data.client.id} />
          </div>
          <div style={panel('creds')}>
            <CredsTab client={data.client} />
          </div>
          <div style={panel('jobs')}>
            <JobsTab jobs={data.jobs} clientId={data.client.id} onDelete={(jid) => void deleteJob(jid)} />
          </div>
          <div style={panel('porting')}>
            <PortingTab
              ports={data.ports}
              clientId={data.client.id}
              onDelete={(pid) => void deletePorting(pid)}
            />
          </div>
          {canSeeComplaints && (
            <div style={panel('complaints')}>
              <ComplaintsTab complaints={data.complaints} onDelete={(cid) => void deleteComplaint(cid)} />
            </div>
          )}
          <div style={panel('sites')}>
            <SitesTab
              sites={data.sites}
              onAdd={() => openSiteModal(data.client.id)}
              onEdit={(s) => openSiteModal(data.client.id, s)}
              onDelete={(sid) => void deleteSite(sid, data.client.id)}
            />
          </div>
          {canSeeCalls && (
            <div style={panel('calls')}>
              <CallsTab calls={calls} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
