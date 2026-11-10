/**
 * Webex call events → CRM screen pop + call log.
 *
 * Webex Calling sends every telephony_calls event in the org here (an org-owned webhook,
 * registered by the Easytel CRM Service App). Two kinds matter:
 *
 *  - An agent ANSWERS an external call (eventType "answered", personality "terminator"):
 *      → a call_log row (admin-only history), and
 *      → a screen_pops row for that agent if webex_users.pop is on; their open CRM tab
 *        picks it up over Realtime and opens the caller's client.
 *    Picking a call up from park counts: Webex sends the colleague their own "answered"
 *    event carrying the original caller's number.
 *  - That leg ENDS (eventType "disconnected") → the call_log row gets ended_at.
 *
 * We trigger on eventType "answered", not state "connected": "connected" repeats when
 * recording starts and when a held call resumes.
 *
 * Separately, every event on an external call — inbound or outbound, from ringing to hang-up —
 * updates that person's leg in call_legs, which feeds the sales call stats wallboard. A leg
 * that starts with the park retrieve code (*88…) is a park pickup. Internal calls are ignored.
 *
 * Deployed with verify_jwt off, because Webex cannot send a Supabase token. Instead Webex
 * signs each request with the webhook's secret (X-Spark-Signature = hex HMAC-SHA1 of the
 * raw body), and anything unsigned or wrongly signed is refused.
 *
 * Secrets: WEBEX_WEBHOOK_SECRET (Supabase → Edge Functions → Secrets).
 * SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SECRET = Deno.env.get('WEBEX_WEBHOOK_SECRET') ?? '';
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});
const enc = new TextEncoder();

type RemoteParty = { name?: string; number?: string; privacyEnabled?: boolean; callType?: string };
type CallEvent = {
  resource?: string;
  actorId?: string;
  data?: {
    eventType?: string;
    personality?: string;
    callId?: string;
    callSessionId?: string;
    remoteParty?: RemoteParty;
    created?: string;
    answered?: string;
    disconnected?: string;
  };
};

async function hmacSha1Hex(key: string, body: string): Promise<string> {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-1' }, false, [
    'sign',
  ]);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(body)));
  return [...sig].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Constant-time compare, so the check does not leak how much of a guess was right. */
function sameHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** +61412969818 → 0412969818. Anything else is kept as its digits. Null when withheld. */
function nationalNumber(p: RemoteParty | undefined): string | null {
  if (!p || p.privacyEnabled || !p.number) return null;
  const d = p.number.replace(/\D/g, '');
  if (!d) return null;
  return d.length === 11 && d.startsWith('61') ? '0' + d.slice(2) : d;
}

async function onAnswered(ev: CallEvent) {
  const d = ev.data!;
  const callId = d.callId;
  const personId = ev.actorId;
  if (!callId || !personId) return;

  const number = nationalNumber(d.remoteParty);
  const callerName = d.remoteParty?.name?.trim() || null;

  const [match, who] = await Promise.all([
    number ? db.rpc('match_caller', { num: number }) : Promise.resolve({ data: [] as string[], error: null }),
    db.from('webex_users').select('profile_id, pop').eq('webex_person_id', personId).maybeSingle(),
  ]);
  if (match.error) console.error('match_caller failed', match.error.message);
  if (who.error) console.error('webex_users lookup failed', who.error.message);
  const clientIds: string[] = (match.data as string[] | null) ?? [];
  const profileId: string | null = who.data?.profile_id ?? null;

  const log = await db.from('call_log').upsert(
    {
      webex_call_id: callId,
      webex_session_id: d.callSessionId ?? null,
      webex_person_id: personId,
      profile_id: profileId,
      number,
      caller_name: callerName,
      client_ids: clientIds,
      answered_at: d.answered ?? new Date().toISOString(),
    },
    { onConflict: 'webex_call_id', ignoreDuplicates: true },
  );
  if (log.error) console.error('call_log insert failed', log.error.message);

  if (profileId && who.data?.pop) {
    const pop = await db.from('screen_pops').upsert(
      { profile_id: profileId, webex_call_id: callId, number, caller_name: callerName, client_ids: clientIds },
      { onConflict: 'webex_call_id,profile_id', ignoreDuplicates: true },
    );
    if (pop.error) console.error('screen_pops insert failed', pop.error.message);
  }

  console.log(
    JSON.stringify({
      did: 'answered',
      mapped: !!profileId,
      pop: !!(profileId && who.data?.pop),
      withheld: !number,
      matches: clientIds.length,
    }),
  );

  // Screen pops are only needed for the moment of the call; keep the table small.
  const old = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const clean = await db.from('screen_pops').delete().lt('created_at', old);
  if (clean.error) console.error('screen_pops cleanup failed', clean.error.message);
}

async function onDisconnected(ev: CallEvent) {
  const d = ev.data!;
  if (!d.callId || !d.answered) return; // never answered on this leg: nothing was logged
  const r = await db
    .from('call_log')
    .update({ ended_at: d.disconnected ?? new Date().toISOString() })
    .eq('webex_call_id', d.callId)
    .is('ended_at', null);
  if (r.error) console.error('call_log end failed', r.error.message);
}

/**
 * Keeps call_legs up to date for the call stats. Events for a leg can arrive in any order;
 * record_call_leg() only ever fills gaps, so a late "received" never undoes an "answered".
 */
async function recordLeg(ev: CallEvent) {
  const d = ev.data!;
  if (!d.callId || !ev.actorId) return;
  // clickToDial is the desk phone ringing to start a click-to-dial; the same leg turns
  // into the originator once it dials out, and that is when it is recorded.
  const direction = d.personality === 'originator' ? 'out' : d.personality === 'terminator' ? 'in' : null;
  if (!direction) return;
  const rp = d.remoteParty;
  const external = rp?.callType === 'external';
  // Picking a call up from park: the leg opens dialling the retrieve code, then connects
  // to the original (external) caller.
  const park = direction === 'in' && /^\*88/.test(rp?.number ?? '');
  if (!external && !park) return;

  const r = await db.rpc('record_call_leg', {
    p_call_id: d.callId,
    p_session_id: d.callSessionId ?? null,
    p_person_id: ev.actorId,
    p_direction: direction,
    p_park: park,
    p_remote: external ? nationalNumber(rp) : null,
    p_created: d.created ?? null,
    p_answered: d.answered ?? null,
    p_ended: d.eventType === 'disconnected' ? (d.disconnected ?? new Date().toISOString()) : null,
  });
  if (r.error) console.error('record_call_leg failed', r.error.message);
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('ok');
  if (!SECRET) {
    console.error('WEBEX_WEBHOOK_SECRET is not set');
    return new Response('not configured', { status: 500 });
  }

  const body = await req.text();
  const sent = (req.headers.get('x-spark-signature') ?? '').toLowerCase();
  if (!sent || !sameHex(await hmacSha1Hex(SECRET, body), sent)) {
    console.warn('refused: bad signature');
    return new Response('bad signature', { status: 401 });
  }

  let ev: CallEvent;
  try {
    ev = JSON.parse(body);
  } catch {
    return new Response('ok');
  }

  const d = ev.data;
  const relevant =
    ev.resource === 'telephony_calls' &&
    d?.personality === 'terminator' &&
    d.remoteParty?.callType === 'external';

  // Always answer 200 once the signature is good: Webex can disable a webhook that keeps failing,
  // and a lost pop is better than a dead webhook.
  const popAndLog = async () => {
    if (relevant && d!.eventType === 'answered') await onAnswered(ev);
    else if (relevant && d!.eventType === 'disconnected') await onDisconnected(ev);
  };
  const legs = async () => {
    if (ev.resource === 'telephony_calls' && d) await recordLeg(ev);
  };
  const results = await Promise.allSettled([popAndLog(), legs()]);
  for (const r of results) {
    if (r.status === 'rejected') {
      console.error('handler failed', r.reason instanceof Error ? r.reason.message : String(r.reason));
    }
  }
  return new Response('ok');
});
