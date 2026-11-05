/**
 * Hand-written from the columns index.html actually reads and writes.
 *
 * The Supabase MCP connection in use has no schema read permission, so these are not
 * generated. Once credentials allow it, replace this file with:
 *   npx supabase gen types typescript --project-id leppwkkzuscdobqehhts > src/lib/db.types.ts
 *
 * Tables are added as each page is ported, so this grows phase by phase rather than
 * guessing at columns no code touches yet.
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

/** What clientSvcBadges needs off a client's installs. */
export type JobServices = ServiceFlags & {
  type?: string | null;
  status?: string | null;
};

// Must stay a type alias, not an interface: Supabase's generics require
// Record<string, unknown>, and only object-literal types get an implicit index signature.
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

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Partial<Profile> & { id: string };
        Update: Partial<Profile>;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      next_account_number: {
        Args: { series: string };
        Returns: string;
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
