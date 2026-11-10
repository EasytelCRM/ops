/**
 * Invite a team member from the CRM's Users page.
 *
 * Sending an invite needs the service role key, which a browser never has, so the
 * Invite user form posts here instead. Only a signed-in, active admin gets through.
 *
 * The invite email is Supabase Auth's own (same template and mail route as inviting from
 * the dashboard), and its link opens the CRM's set-password screen. The new account's
 * profile row comes from the on_auth_user_created trigger (inactive Tech); because an
 * admin chose this person on purpose, it is then given the picked role and switched on
 * straight away, and the invite is written to the audit log.
 *
 * Deployed with verify_jwt on: the caller's own Supabase session token is required.
 * SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

const ROLES = ['technician', 'ops', 'admin', 'wallboard'];
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return reply(405, { error: 'POST only' });

  // Who is asking: an active admin, by their own session
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: who } = await db.auth.getUser(jwt);
  if (!who?.user) return reply(401, { error: 'Sign in again and retry' });
  const { data: me } = await db.from('profiles').select('role, active, email').eq('id', who.user.id).single();
  if (me?.role !== 'admin' || me.active === false) return reply(403, { error: 'Only an admin can invite people' });

  let body: { email?: string; full_name?: string; role?: string; redirect_to?: string };
  try {
    body = await req.json();
  } catch {
    return reply(400, { error: 'Bad request' });
  }
  const email = (body.email ?? '').trim().toLowerCase();
  const name = (body.full_name ?? '').trim().replace(/\s+/g, ' ');
  const role = body.role ?? '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply(400, { error: 'Enter a valid email address' });
  if (!name || name.length > 60) return reply(400, { error: 'Enter a name (up to 60 characters)' });
  if (!ROLES.includes(role)) return reply(400, { error: 'Pick a role' });

  const { data: existing } = await db.from('profiles').select('id').ilike('email', email).maybeSingle();
  if (existing) return reply(409, { error: `${email} already has a CRM account` });

  // Supabase only follows redirect_to if it is on the project's allowed list; otherwise the Site URL
  const { data: invited, error } = await db.auth.admin.inviteUserByEmail(email, {
    data: { full_name: name },
    redirectTo: body.redirect_to || undefined,
  });
  if (error || !invited?.user) return reply(400, { error: error?.message ?? 'Invite failed' });
  const id = invited.user.id;

  const { error: upErr } = await db.from('profiles').update({ full_name: name, role, active: true }).eq('id', id);
  if (upErr) return reply(500, { error: `Invite sent, but setting the role failed: ${upErr.message}` });

  await db.from('audit_log').insert({
    user_id: who.user.id,
    user_email: me.email,
    action: 'invited',
    table_name: 'profiles',
    record_id: id,
    old_data: {},
    new_data: { name, email, role },
  });

  return reply(200, { id });
});
