// HTTP handler for the face-match Edge Function. All I/O goes through injected deps so it can be unit-tested.
import { compareFaces, loadSessions, MODEL_VERSION, type Ort } from './face.ts';

export type Deps = {
  supabaseUrl: string;
  serviceKey: string;
  fetch: typeof fetch;
  /** Returns the ONNX runtime; `download` reads a file from the private model bucket (e.g. the WASM fallback binary). */
  getOrt: (download: (name: string) => Promise<Uint8Array>) => Promise<Ort | null>;
  modelBucket?: string;
  /** Optional label of the engine actually used (e.g. 'native' / 'wasm'), stored with the result. */
  engineName?: () => string | undefined;
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

export function createHandler(deps: Deps) {
  const { supabaseUrl: URL_, serviceKey: KEY, fetch: f } = deps;
  const svc = { apikey: KEY, Authorization: `Bearer ${KEY}` };
  const bucket = deps.modelBucket ?? 'ml-models';
  let sessions: ReturnType<typeof loadSessions> | null = null;

  async function rpc(fn: string, args: unknown) {
    const r = await f(`${URL_}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { ...svc, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
    const t = await r.text();
    if (!r.ok) throw Object.assign(new Error(`rpc ${fn}: ${r.status} ${t.slice(0, 200)}`), { status: r.status, body: t });
    return t ? JSON.parse(t) : null;
  }
  async function download(path: string) {
    const r = await f(`${URL_}/storage/v1/object/${path}`, { headers: svc });
    if (!r.ok) throw new Error(`download ${r.status}`);
    return new Uint8Array(await r.arrayBuffer());
  }
  async function models(ort: Ort) {
    sessions ??= (async () => {
      const [det, rec] = await Promise.all([download(`${bucket}/face_detection_yunet_2023mar.onnx`), download(`${bucket}/face_recognition_sface_2021dec_int8.onnx`)]);
      return loadSessions(ort, det, rec);
    })();
    try { return await sessions; } catch (e) { sessions = null; throw e; }
  }

  return async function handle(req: Request): Promise<Response> {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);
    const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!jwt) return json({ error: 'unauthorized' }, 401);
    // who is calling (the JWT is verified by Supabase Auth, never trusted blindly)
    const ur = await f(`${URL_}/auth/v1/user`, { headers: { apikey: KEY, Authorization: `Bearer ${jwt}` } });
    if (!ur.ok) return json({ error: 'unauthorized' }, 401);
    const user = await ur.json();
    const pr = await f(`${URL_}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=id,role,tech_status`, { headers: svc });
    const caller = pr.ok ? (await pr.json())[0] : null;
    if (!caller) return json({ error: 'forbidden' }, 403);
    let body: { user_id?: string } = {};
    try { body = await req.json(); } catch { /* empty body */ }
    const isAdmin = caller.role === 'admin';
    const target = isAdmin && body.user_id ? String(body.user_id) : caller.id;
    if (!/^[0-9a-f-]{36}$/i.test(target)) return json({ error: 'bad user_id' }, 400);
    if (!isAdmin && !(caller.role === 'technician' && caller.tech_status === 'pending')) return json({ error: 'forbidden' }, 403);

    let docs;
    try { docs = await rpc('face_match_target', { p_user: target }); } catch (e) {
      const st = (e as { status?: number }).status;
      const limited = /rate_limited|P0001/.test(String((e as { body?: string }).body));
      return json({ error: limited ? 'rate_limited' : 'not_ready' }, limited ? 429 : st === 400 ? 400 : 409);
    }

    let result: Record<string, unknown>;
    const t0 = performance.now();
    try {
      const ort = await deps.getOrt((name) => download(`${bucket}/${name}`));
      if (!ort) throw new Error('face engine unavailable');
      const { det, rec } = await models(ort);
      const [idBytes, selfieBytes] = await Promise.all([download(docs.id_photo), download(docs.selfie)]);
      result = { ...(await compareFaces(ort, det as never, rec as never, idBytes, selfieBytes)), model: MODEL_VERSION };
    } catch (e) {
      console.error('face-match failed', String(e));
      result = { status: 'error', error: String((e as Error).message || e).slice(0, 200), model: MODEL_VERSION };
    }
    result.ms = Math.round(performance.now() - t0);
    if (deps.engineName?.()) result.engine = deps.engineName();
    const saved = await rpc('record_face_match', { p_user: target, p_id_photo: docs.id_photo, p_selfie: docs.selfie, p_result: result, p_actor: caller.id });
    if (saved?.stale) return json({ stale: true }, 409);
    // technicians only learn whether they were approved; the score is for admins
    return json(isAdmin ? saved : { checked: true, approved: !!saved.auto_approved });
  };
}
