/**
 * Plays a Webex call recording from a client's Calls tab, without the CRM ever storing audio.
 *
 * POST { call_log_id } (an admin's or ops session) → finds that call's recording on Webex and returns
 * Webex's own short-lived download link, which the browser plays directly. The recording is
 * matched by the call's session id (call_log.webex_session_id is that id, base64-encoded),
 * preferring the recording owned by the agent on that leg; once found, its id is saved on the
 * call_log row so the next play skips the search. If Webex has deleted it, it says so.
 *
 * POST { action: "refresh" } (the service role, sent daily by webex-call-event) → renews the
 * Webex token.
 *
 * Webex access: the Easytel CRM Service App's token, kept in private.webex_token through the
 * webex_token_* functions and renewed with its refresh token. Webex returns a fresh refresh
 * token on each renewal, so the stored one is used first; WEBEX_REFRESH_TOKEN (secret) seeds
 * it the first time, and is tried again if the stored one stops working (paste a new one there
 * after regenerating tokens on the developer portal).
 *
 * Secrets: WEBEX_CLIENT_ID, WEBEX_CLIENT_SECRET, WEBEX_REFRESH_TOKEN.
 * Service App scopes needed: spark-admin:recordings_read, spark-compliance:recordings_read.
 * Deployed with verify_jwt on.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const db = createClient(Deno.env.get('SUPABASE_URL')!, SERVICE_KEY, { auth: { persistSession: false } });
const WEBEX = 'https://webexapis.com/v1';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

class NotSetUp extends Error {}

// ---- Webex token -------------------------------------------------------------------------

async function renew(refreshToken: string) {
  const res = await fetch(`${WEBEX}/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: Deno.env.get('WEBEX_CLIENT_ID') ?? '',
      client_secret: Deno.env.get('WEBEX_CLIENT_SECRET') ?? '',
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) throw new Error(`token renewal refused (${res.status})`);
  const t = await res.json();
  const at = (secs?: number) => (secs ? new Date(Date.now() + secs * 1000).toISOString() : null);
  const save = await db.rpc('webex_token_save', {
    p_access: t.access_token,
    p_access_exp: at(t.expires_in),
    p_refresh: t.refresh_token ?? null,
    p_refresh_exp: at(t.refresh_token_expires_in),
  });
  if (save.error) throw new Error(`token save failed: ${save.error.message}`);
  console.log(JSON.stringify({ did: 'token-renewed', access_until: at(t.expires_in), refresh_until: at(t.refresh_token_expires_in) }));
  return t.access_token as string;
}

/** A working access token, renewing it when it is missing, nearly expired, or `force`d. */
async function webexToken(force = false): Promise<string> {
  if (!Deno.env.get('WEBEX_CLIENT_ID') || !Deno.env.get('WEBEX_CLIENT_SECRET')) throw new NotSetUp();
  const { data, error } = await db.rpc('webex_token_get');
  if (error) throw new Error(error.message);
  const row = (data as { access_token: string | null; access_expires_at: string | null; refresh_token: string | null }[])[0];
  const fresh = row?.access_token && row.access_expires_at && Date.parse(row.access_expires_at) > Date.now() + 3600_000;
  if (fresh && !force) return row.access_token!;

  const seed = Deno.env.get('WEBEX_REFRESH_TOKEN') ?? '';
  const candidates = [...new Set([row?.refresh_token, seed].filter((x): x is string => !!x))];
  if (!candidates.length) throw new NotSetUp();
  let last: unknown;
  for (const rt of candidates) {
    try {
      return await renew(rt);
    } catch (e) {
      last = e;
    }
  }
  throw last;
}

async function webexGet(path: string, token: string) {
  return await fetch(path.startsWith('http') ? path : `${WEBEX}${path}`, { headers: { Authorization: `Bearer ${token}` } });
}

// ---- Matching a call to its recording ----------------------------------------------------

/** Webex ids come plain or base64'd ("ciscospark://us/PEOPLE/<uuid>"); compare on the last part. */
function idKey(id: string | null | undefined): string {
  if (!id) return '';
  let s = id;
  try {
    const decoded = atob(id);
    if (/^[\x20-\x7e]+$/.test(decoded)) s = decoded;
  } catch {
    // not base64: already plain
  }
  return s.split('/').pop()!.toLowerCase();
}

type Rec = { id: string; ownerId?: string; serviceType?: string; serviceData?: { callSessionId?: string } };

async function findRecording(
  call: { webex_session_id: string | null; webex_person_id: string | null; answered_at: string; ended_at: string | null },
  token: string,
): Promise<string | null> {
  const session = idKey(call.webex_session_id);
  if (!session) return null;
  const answered = Date.parse(call.answered_at);
  const end = call.ended_at ? Date.parse(call.ended_at) : answered + 4 * 3600_000;
  const from = new Date(answered - 15 * 60_000).toISOString();
  const to = new Date(Math.min(end + 15 * 60_000, Date.now())).toISOString();

  // Every recording made around the call
  const items: Rec[] = [];
  let next: string | null = `/admin/convergedRecordings?from=${from}&to=${to}&max=100`;
  for (let page = 0; next && page < 5; page++) {
    const res = await webexGet(next, token);
    if (!res.ok) throw new Error(`recording list refused (${res.status})`);
    items.push(...((await res.json()).items ?? []));
    next = res.headers.get('link')?.match(/<([^>]+)>;\s*rel="next"/)?.[1] ?? null;
  }

  // The list may leave out serviceData; then read it from each recording's details
  for (const r of items.filter((r) => !r.serviceData && (!r.serviceType || r.serviceType === 'calling')).slice(0, 25)) {
    const res = await webexGet(`/convergedRecordings/${r.id}`, token);
    if (res.ok) r.serviceData = (await res.json()).serviceData;
  }

  const sameCall = items.filter((r) => idKey(r.serviceData?.callSessionId) === session);
  const agent = idKey(call.webex_person_id);
  return (sameCall.find((r) => idKey(r.ownerId) === agent) ?? sameCall[0])?.id ?? null;
}

// ---- Handler ------------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return reply(405, { error: 'POST only' });

  let body: { action?: string; call_log_id?: string };
  try {
    body = await req.json();
  } catch {
    return reply(400, { error: 'Bad request' });
  }
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');

  try {
    // The daily renewal, from webex-call-event
    if (body.action === 'refresh') {
      if (jwt !== SERVICE_KEY) return reply(403, { error: 'Not allowed' });
      await webexToken(true);
      return reply(200, { ok: true });
    }

    // Playing a recording: admins and ops, the same people who see the Calls tab
    const { data: who } = await db.auth.getUser(jwt);
    if (!who?.user) return reply(401, { error: 'Sign in again and retry' });
    const { data: me } = await db.from('profiles').select('role, active').eq('id', who.user.id).single();
    if (!['admin', 'ops'].includes(me?.role ?? '') || me?.active === false)
      return reply(403, { error: 'Only admins and ops can play recordings' });

    if (!body.call_log_id) return reply(400, { error: 'Which call?' });
    const { data: call } = await db
      .from('call_log')
      .select('id, webex_session_id, webex_person_id, answered_at, ended_at, recording_id')
      .eq('id', body.call_log_id)
      .single();
    if (!call) return reply(404, { error: 'Call not found' });

    const token = await webexToken();
    let recId: string | null = call.recording_id;
    if (!recId) {
      recId = await findRecording(call, token);
      if (!recId) {
        const justEnded = !call.ended_at || Date.now() - Date.parse(call.ended_at) < 15 * 60_000;
        return reply(200, {
          status: justEnded ? 'pending' : 'none',
          message: justEnded
            ? 'No recording yet. Webex can take a few minutes after a call ends, so try again shortly.'
            : 'No recording for this call.',
        });
      }
      await db.from('call_log').update({ recording_id: recId }).eq('id', call.id);
    }

    const res = await webexGet(`/convergedRecordings/${recId}`, token);
    if (res.status === 404) return reply(200, { status: 'gone', message: 'Webex no longer has this recording.' });
    if (!res.ok) throw new Error(`recording details refused (${res.status})`);
    const rec = await res.json();
    const url = rec.temporaryDirectDownloadLinks?.audioDownloadLink;
    if (!url) return reply(200, { status: 'none', message: 'Webex did not offer a download for this recording.' });
    return reply(200, { status: 'ok', url, expires: rec.temporaryDirectDownloadLinks?.expiration ?? null });
  } catch (e) {
    if (e instanceof NotSetUp) return reply(503, { error: 'Recordings are not set up yet (Webex token missing).' });
    console.error('call-recording failed', e instanceof Error ? e.message : String(e));
    return reply(502, { error: `Webex: ${e instanceof Error ? e.message : 'failed'}` });
  }
});
