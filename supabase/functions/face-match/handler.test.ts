// deno test -A supabase/functions/face-match/handler.test.ts
// FACE_FIXTURES=<dir> must contain the two OpenCV Zoo models and test photos (see README "Face match"); otherwise
// the model-dependent tests are skipped and only the auth/permission logic is tested.
import { assert, assertEquals } from 'jsr:@std/assert@1';
import { createHandler } from './handler.ts';
import type { Ort } from './face.ts';

const FIX = Deno.env.get('FACE_FIXTURES') || '';
const has = (f: string) => { try { Deno.statSync(`${FIX}/${f}`); return true; } catch { return false; } };
const haveModels = !!FIX && has('face_detection_yunet_2023mar.onnx') && has('face_recognition_sface_2021dec_int8.onnx');
const read = (f: string) => Deno.readFileSync(`${FIX}/${f}`);
let ortNode: Ort | null = null;
async function realOrt() { ortNode ??= (await import('npm:onnxruntime-node@1.20.1')) as unknown as Ort; return ortNode; }

type Prof = { id: string; role: string; tech_status: string | null };
const U: Record<string, string> = {
  admin: '00000000-0000-4000-8000-000000000001', tech: '00000000-0000-4000-8000-000000000002', approved: '00000000-0000-4000-8000-000000000003',
  owner: '00000000-0000-4000-8000-000000000004', other: '00000000-0000-4000-8000-000000000005',
};

function world(opts: { id?: string; selfie?: string; rateLimited?: boolean } = {}) {
  const profiles: Record<string, Prof> = {
    [U.admin]: { id: U.admin, role: 'admin', tech_status: null },
    [U.tech]: { id: U.tech, role: 'technician', tech_status: 'pending' },
    [U.other]: { id: U.other, role: 'technician', tech_status: 'pending' },
    [U.approved]: { id: U.approved, role: 'technician', tech_status: 'approved' },
    [U.owner]: { id: U.owner, role: 'owner', tech_status: null },
  };
  const tokens: Record<string, string> = { 'jwt-admin': U.admin, 'jwt-tech': U.tech, 'jwt-approved': U.approved, 'jwt-owner': U.owner };
  const calls: { rpc: string; args: Record<string, unknown> }[] = [];
  const files: Record<string, Uint8Array> = {};
  if (haveModels) {
    files['ml-models/face_detection_yunet_2023mar.onnx'] = read('face_detection_yunet_2023mar.onnx');
    files['ml-models/face_recognition_sface_2021dec_int8.onnx'] = read('face_recognition_sface_2021dec_int8.onnx');
    for (const u of [U.tech, U.other]) {
      files[`tech-docs/${u}/id.jpg`] = read(opts.id ?? 'id_obama.jpg');
      files[`tech-docs/${u}/selfie.jpg`] = read(opts.selfie ?? 'selfie_obama.jpg');
    }
  }
  const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input)); const h = new Headers(init?.headers);
    const svc = h.get('Authorization') === 'Bearer SERVICE';
    if (url.pathname === '/auth/v1/user') {
      const uid = tokens[(h.get('Authorization') || '').slice(7)];
      return uid ? Response.json({ id: uid }) : new Response('bad jwt', { status: 401 });
    }
    if (!svc) return new Response('forbidden', { status: 403 });
    if (url.pathname === '/rest/v1/profiles') {
      const id = url.searchParams.get('id')!.replace('eq.', '');
      return Response.json(profiles[id] ? [profiles[id]] : []);
    }
    if (url.pathname.startsWith('/rest/v1/rpc/')) {
      const fn = url.pathname.split('/').pop()!; const args = JSON.parse(String(init?.body));
      calls.push({ rpc: fn, args });
      if (fn === 'face_match_target') {
        if (opts.rateLimited) return Response.json({ code: 'P0001', hint: 'rate_limited' }, { status: 400 });
        return Response.json({ id_photo: `tech-docs/${args.p_user}/id.jpg`, selfie: `tech-docs/${args.p_user}/selfie.jpg`, tech_status: 'pending' });
      }
      if (fn === 'record_face_match') {
        const r = args.p_result; const auto = r.status === 'match' && r.score >= 0.5;
        return Response.json({ ...r, auto_approved: auto, checked_at: 'now' });
      }
    }
    if (url.pathname.startsWith('/storage/v1/object/')) {
      const key = url.pathname.slice('/storage/v1/object/'.length);
      return files[key] ? new Response(files[key] as BodyInit) : new Response('not found', { status: 404 });
    }
    return new Response('unexpected ' + url.pathname, { status: 500 });
  }) as typeof fetch;
  return { calls, fetch: fakeFetch };
}
const mk = (w: ReturnType<typeof world>, getOrt: (d: (n: string) => Promise<Uint8Array>) => Promise<Ort | null> = realOrt) =>
  createHandler({ supabaseUrl: 'https://proj.supabase.co', serviceKey: 'SERVICE', fetch: w.fetch, getOrt });
const post = (jwt: string | null, body: unknown = {}) =>
  new Request('https://fn/face-match', { method: 'POST', headers: jwt ? { Authorization: `Bearer ${jwt}` } : {}, body: JSON.stringify(body) });

Deno.test('CORS preflight and method check', async () => {
  const h = mk(world());
  assertEquals((await h(new Request('https://fn', { method: 'OPTIONS' }))).status, 204);
  assertEquals((await h(new Request('https://fn', { method: 'GET' }))).status, 405);
});
Deno.test('rejects missing or invalid JWT', async () => {
  const h = mk(world());
  assertEquals((await h(post(null))).status, 401);
  assertEquals((await h(post('forged'))).status, 401);
});
Deno.test('owners and approved technicians cannot run it', async () => {
  const w = world(); const h = mk(w);
  assertEquals((await h(post('jwt-owner'))).status, 403);
  assertEquals((await h(post('jwt-approved'))).status, 403);
  assertEquals(w.calls.length, 0);
});
Deno.test('rate limit is reported as 429', async () => {
  const h = mk(world({ rateLimited: true }));
  assertEquals((await h(post('jwt-tech'))).status, 429);
});
Deno.test('engine failure is recorded as error (→ manual review), never approval', async () => {
  const w = world(); const h = mk(w, async () => null);
  const r = await h(post('jwt-tech'));
  assertEquals(r.status, 200);
  assertEquals(await r.json(), { checked: true, approved: false });
  const rec = w.calls.find((c) => c.rpc === 'record_face_match')!;
  assertEquals((rec.args.p_result as { status: string }).status, 'error');
});

Deno.test({ name: 'technician: own documents only, no score leaked, matching faces', ignore: !haveModels, sanitizeResources: false, sanitizeOps: false, fn: async () => {
  const w = world(); const h = mk(w);
  const r = await h(post('jwt-tech', { user_id: U.other })); // tries to target someone else
  const j = await r.json();
  assertEquals(r.status, 200);
  assertEquals(Object.keys(j).sort(), ['approved', 'checked']);
  const rec = w.calls.find((c) => c.rpc === 'record_face_match')!;
  assertEquals(rec.args.p_user, U.tech);
  const res = rec.args.p_result as { status: string; score: number };
  assertEquals(res.status, 'match');
  assert(res.score > 0.5, `score ${res.score}`);
  assertEquals(j.approved, true);
} });
Deno.test({ name: 'admin: can target any technician and sees the score; different person → no_match', ignore: !haveModels, sanitizeResources: false, sanitizeOps: false, fn: async () => {
  const w = world({ id: 'id_biden.jpg', selfie: 'selfie_obama.jpg' }); const h = mk(w);
  const r = await h(post('jwt-admin', { user_id: U.other }));
  const j = await r.json();
  assertEquals(r.status, 200);
  assertEquals(w.calls.find((c) => c.rpc === 'record_face_match')!.args.p_user, U.other);
  assertEquals(j.status, 'no_match');
  assert(j.score < 0.3, `score ${j.score}`);
  assertEquals(j.auto_approved, false);
} });
Deno.test({ name: 'selfie without a face → no_face_selfie', ignore: !haveModels || !has('noface.jpg'), sanitizeResources: false, sanitizeOps: false, fn: async () => {
  const w = world({ selfie: 'noface.jpg' }); const h = mk(w);
  const j = await (await h(post('jwt-admin', { user_id: U.tech }))).json();
  assertEquals(j.status, 'no_face_selfie');
} });
Deno.test({ name: 'two people in the selfie → flagged', ignore: !haveModels || !has('two_people.jpg'), sanitizeResources: false, sanitizeOps: false, fn: async () => {
  const w = world({ selfie: 'two_people.jpg' }); const h = mk(w);
  const j = await (await h(post('jwt-admin', { user_id: U.tech }))).json();
  assertEquals(j.status, 'multiple_faces_selfie');
} });
