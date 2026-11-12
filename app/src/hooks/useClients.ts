import { useQuery } from '@tanstack/react-query';
import { sb } from '../lib/supabase';
import { fetchAll } from '../lib/fetchAll';
import { CLIENT_JOBS } from '../components/Badges';
import type {
  Client,
  ClientContact,
  ClientNote,
  Complaint,
  Job,
  JobServices,
  Porting,
  Profile,
  Site,
} from '../lib/db.types';

/** A clients-list row: the client plus the counts and badges the table shows. */
export type ClientListRow = Client & {
  sites: { id: string }[] | null;
  client_contacts: Pick<ClientContact, 'name' | 'phone' | 'mobile' | 'email'>[] | null;
  jobs: JobServices[] | null;
};

const LIST_SELECT = `*,sites(id),client_contacts(name,phone,mobile,email),${CLIENT_JOBS}`;

export function useClients() {
  return useQuery({
    queryKey: ['clients'],
    queryFn: () =>
      fetchAll<ClientListRow>(() =>
        sb.from('clients').select(LIST_SELECT).order('company') as never,
      ),
  });
}

/** Everyone, for the "(edited) by" tooltips and the assignment dropdowns. */
export function useProfiles() {
  return useQuery({
    queryKey: ['profiles'],
    queryFn: async () => {
      const { data, error } = await sb.from('profiles').select('*').order('full_name');
      if (error) throw error;
      return (data ?? []) as Profile[];
    },
    staleTime: 5 * 60_000,
  });
}

export type ProfileJob = Job & {
  sites: { name: string } | null;
  profiles: { full_name: string } | null;
};

export type ProfileComplaint = Complaint & { profiles: { full_name: string } | null };

export interface ClientProfileData {
  client: Client;
  sites: Site[];
  jobs: ProfileJob[];
  ports: Porting[];
  complaints: ProfileComplaint[];
  contacts: ClientContact[];
}

/**
 * The whole profile in one unit, as the single-file app loaded it — six requests in
 * parallel, refreshed together. Complaints are admin + ops only; RLS returns nothing to
 * a technician anyway, so it is not asked for.
 */
export function useClientProfile(id: string | undefined, canSeeComplaints: boolean) {
  return useQuery({
    queryKey: ['client', id, canSeeComplaints],
    enabled: !!id,
    queryFn: async (): Promise<ClientProfileData> => {
      const [client, sites, jobs, ports, complaints, contacts] = await Promise.all([
        sb.from('clients').select('*').eq('id', id!).single(),
        sb
          .from('sites')
          .select('*')
          .eq('client_id', id!)
          .order('is_primary', { ascending: false })
          .order('created_at', { ascending: true }),
        sb
          .from('jobs')
          .select('*,sites(name),profiles!jobs_assigned_to_fkey(full_name)')
          .eq('client_id', id!)
          .order('due_date', { ascending: true, nullsFirst: false }),
        sb
          .from('porting')
          .select('*')
          .eq('client_id', id!)
          .order('port_date', { ascending: true, nullsFirst: false }),
        canSeeComplaints
          ? sb
              .from('complaints')
              .select('*,profiles!complaints_assigned_to_fkey(full_name)')
              .eq('client_id', id!)
              .order('open_date', { ascending: false })
          : Promise.resolve({ data: [], error: null }),
        sb.from('client_contacts').select('*').eq('client_id', id!).order('sort', { ascending: true }),
      ]);
      if (client.error) throw client.error;
      return {
        client: client.data as Client,
        sites: (sites.data ?? []) as Site[],
        jobs: (jobs.data ?? []) as unknown as ProfileJob[],
        ports: (ports.data ?? []) as Porting[],
        complaints: (complaints.data ?? []) as unknown as ProfileComplaint[],
        contacts: (contacts.data ?? []) as ClientContact[],
      };
    },
  });
}

export type ClientNoteRow = ClientNote & { profiles: { full_name: string | null } | null };

export function useClientNotes(clientId: string | undefined) {
  return useQuery({
    queryKey: ['clientNotes', clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await sb
        .from('client_notes')
        .select('*,profiles(full_name)')
        .eq('client_id', clientId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ClientNoteRow[];
    },
  });
}
