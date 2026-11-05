/**
 * Hand-written from the columns index.html actually reads and writes.
 *
 * The Supabase MCP connection in use has no schema read permission, so these are not
 * generated. Once credentials allow it, replace this file with:
 *   npx supabase gen types typescript --project-id leppwkkzuscdobqehhts > src/lib/db.types.ts
 *
 * Tables are added as each page is ported, so this grows phase by phase rather than
 * guessing at columns no code touches yet. Every row type must stay a type alias, not an
 * interface: Supabase's generics require Record<string, unknown>, and only object-literal
 * types get an implicit index signature.
 */

export type Role = 'admin' | 'ops' | 'technician';

export type JobStatus = 'Pending' | 'Incomplete' | 'Complete' | 'Cancelled';
export type JobType = 'New Install' | 'Service';
export type PortingStatus = 'Pending' | 'In Progress' | 'Complete' | 'Cancelled';
export type ComplaintStatus = 'Pending' | 'Closed';

/** The three service ticks, carried by both clients (legacy) and install jobs. */
export type ServiceFlags = {
  svc_internet?: boolean | null;
  svc_webex?: boolean | null;
  svc_nec?: boolean | null;
};

/** What ClientSvcBadges needs off a client's installs. */
export type JobServices = ServiceFlags & {
  type?: string | null;
  status?: string | null;
};

export type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: Role | null;
  created_at: string | null;
  /** Added later than the rest of the table: older rows may not carry the key at all. */
  active?: boolean | null;
  deactivated_at?: string | null;
};

export type Client = ServiceFlags & {
  id: string;
  company: string;
  account_number: string | null;
  phone: string | null;
  email: string | null;
  /** Outright sale, no recurring billing — and so no account number. */
  hardware_only: boolean | null;
  cancelled_date: string | null;
  cred_router: string | null;
  cred_phone_system: string | null;
  cred_other: string | null;
  created_at: string | null;
  created_by?: string | null;
};

export type Site = {
  id: string;
  client_id: string;
  name: string;
  address: string | null;
  created_at: string | null;
};

export type ClientContact = {
  id: string;
  client_id: string;
  name: string | null;
  note: string | null;
  phone: string | null;
  mobile: string | null;
  email: string | null;
  is_primary: boolean | null;
  sort: number | null;
};

export type ClientNote = {
  id: string;
  client_id: string;
  title: string | null;
  text: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string | null;
  updated_by: string | null;
};

export type Job = ServiceFlags & {
  id: string;
  client_id: string;
  site_id: string | null;
  type: string | null;
  title: string | null;
  description: string | null;
  /** The old free-text notes box, superseded by job_notes but still shown as "Earlier notes". */
  job_notes: string | null;
  status: string | null;
  assigned_to: string | null;
  cost: number | null;
  due_date: string | null;
  completed_date: string | null;
  /** Installs only: when the deal was approved. Drives the sales dashboard. */
  approval_date: string | null;
  /** Installs carried over from the old client services: never a deal. */
  legacy: boolean | null;
  ticket_url: string | null;
  created_at: string | null;
  created_by?: string | null;
};

/** One entry in a job's append-only note log. */
export type JobNote = {
  id: string;
  job_id: string;
  text: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string | null;
  updated_by: string | null;
};

export type Porting = {
  id: string;
  client_id: string;
  /** The Assist Portal ticket number; 'TBC' until it is known. */
  phone_numbers: string | null;
  losing_carrier: string | null;
  port_date: string | null;
  port_time: string | null;
  status: string | null;
  notes: string | null;
  ticket_url: string | null;
  created_at: string | null;
  created_by?: string | null;
};

export type Complaint = {
  id: string;
  client_id: string;
  complainant: string | null;
  tio_ref: string | null;
  open_date: string | null;
  closed_date: string | null;
  status: string | null;
  assigned_to: string | null;
  description: string | null;
  created_at: string | null;
  created_by?: string | null;
};

/** One entry in a complaint's append-only note log. */
export type ComplaintNote = {
  id: string;
  complaint_id: string;
  text: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string | null;
  updated_by: string | null;
};

export type AuditLog = {
  id: string;
  user_id: string | null;
  user_email: string | null;
  action: string;
  table_name: string;
  record_id: string | null;
  old_data: unknown;
  new_data: unknown;
  created_at: string;
};

type Table<Row, Ins = Partial<Row>, Upd = Partial<Row>> = {
  Row: Row;
  Insert: Ins;
  Update: Upd;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      profiles: Table<Profile, Partial<Profile> & { id: string }>;
      clients: Table<Client, Partial<Client> & { company: string }>;
      sites: Table<Site, Partial<Site> & { client_id: string; name: string }>;
      client_contacts: Table<ClientContact, Partial<ClientContact> & { client_id: string }>;
      client_notes: Table<ClientNote, Partial<ClientNote> & { client_id: string }>;
      jobs: Table<Job, Partial<Job> & { client_id: string }>;
      job_notes: Table<JobNote, Partial<JobNote> & { job_id: string }>;
      porting: Table<Porting, Partial<Porting> & { client_id: string }>;
      complaints: Table<Complaint, Partial<Complaint> & { client_id: string }>;
      complaint_notes: Table<ComplaintNote, Partial<ComplaintNote> & { complaint_id: string }>;
      audit_log: Table<AuditLog, Partial<AuditLog> & { action: string; table_name: string }>;
    };
    Views: { [_ in never]: never };
    Functions: {
      next_account_number: {
        Args: { series: string };
        Returns: string;
      };
      /** Changes nothing but a profile's display name; admins only. */
      set_display_name: {
        Args: { target: string; new_name: string };
        Returns: null;
      };
      /**
       * Activates, reactivates or deactivates an account. Deactivating also blocks
       * sign-in, signs the user out everywhere, unassigns their open work and writes
       * its own audit entry, and reports how much work it freed.
       */
      set_user_active: {
        Args: { target: string; make_active: boolean };
        Returns: { jobs_unassigned?: number; complaints_unassigned?: number } | null;
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
