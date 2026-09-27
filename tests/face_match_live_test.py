"""Live end-to-end test of the deployed face-match Edge Function with temporary technicians.
LAQEETO_TEST_CREDENTIALS=<admin creds json> LAQEETO_DB_PASSWORD_FILE=... FACE_FIXTURES=<dir with id_*.jpg/selfie_*.jpg> \
  python3 tests/face_match_live_test.py          (purges its accounts, files and audit rows at the end)"""
import atexit, json, os, re, secrets, sys, time, urllib.request, urllib.error, uuid
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import cleanup
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
cfg = open(os.path.join(ROOT, 'js/config.js')).read()
URL = re.search(r"SUPABASE_URL = '([^']+)'", cfg).group(1); ANON = re.search(r"SUPABASE_ANON_KEY = '([^']+)'", cfg).group(1)
FIX = os.environ.get('FACE_FIXTURES', '/workspace/fm')
PREFIX = f'lqtest-fml-{secrets.token_hex(3)}-'
atexit.register(lambda: print('purge', cleanup.purge(PREFIX + '%@example.com', audit=True, verbose=False)))
res = []
def ok(n, c, x=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n, '' if c else x, flush=True)
def call(method, path, token=None, body=None, raw=None, ctype='application/json', timeout=120):
    h = {'apikey': ANON, 'Authorization': 'Bearer ' + (token or ANON), 'Content-Type': ctype}
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    try:
        with urllib.request.urlopen(urllib.request.Request(URL + path, data=data, method=method, headers=h), timeout=timeout) as r:
            t = r.read(); return r.status, (json.loads(t) if t else None)
    except urllib.error.HTTPError as e:
        t = e.read()
        try: return e.code, json.loads(t)
        except Exception: return e.code, t[:300]
creds = json.load(open(os.environ['LAQEETO_TEST_CREDENTIALS']))['admin']
_, a = call('POST', '/auth/v1/token?grant_type=password', body={'email': creds['email'], 'password': creds['password']})
ADMIN = a['access_token']

def make_tech(tag, id_file, selfie_file):
    pw = 'Fm-' + uuid.uuid4().hex
    c, j = call('POST', '/auth/v1/signup', body={'email': f'{PREFIX}{tag}@example.com', 'password': pw,
        'data': {'name': 'فني ' + tag, 'role': 'technician', 'shop_name': 'محل اختبار', 'governorate': 'القاهرة', 'address': 'x'}})
    tok, uid = j['access_token'], j['user']['id']
    paths = []
    for f in (id_file, selfie_file, 'noface.jpg'):
        p = f'{uid}/{uuid.uuid4()}.jpg'
        c, _ = call('POST', f'/storage/v1/object/tech-docs/{p}', tok, raw=open(os.path.join(FIX, f), 'rb').read(), ctype='image/jpeg')
        assert c == 200, c
        paths.append('tech-docs/' + p)
    t_submit = time.time()
    c, _ = call('POST', '/rest/v1/rpc/submit_technician_documents', tok, {'p_id_photo': paths[0], 'p_selfie': paths[1], 'p_selfie_method': 'live-camera', 'p_device_shot': paths[2]})
    assert c in (200, 204), c
    return tok, uid, t_submit
def row(uid): return json.loads(cleanup.sql(f"select json_build_object('st', tech_status, 'fm', tech_face_match, 'by', tech_reviewed_by_name) from public.profiles where id = '{uid}'"))
def fm(tok, body=None):
    t = time.time(); c, j = call('POST', '/functions/v1/face-match', tok, body or {}); return c, j, round(time.time() - t, 2)

# 1. matching pair (the first call after deploy = cold start)
tokA, uidA, t0 = make_tech('match', 'id_obama.jpg', 'selfie_obama.jpg')
c, j, dt = fm(tokA)
print(f'  match call: HTTP {c} in {dt}s -> {j}')
ok('matching pair: function answers 200', c == 200, (c, j))
ok('technician only sees {checked, approved}, no score', isinstance(j, dict) and set(j) == {'checked', 'approved'}, j)
approved_at = None
while time.time() - t0 < 60:
    if row(uidA)['st'] == 'approved': approved_at = time.time(); break
    time.sleep(1)
rA = row(uidA)
total = round(approved_at - t0, 2) if approved_at else None
print(f'  submit -> approved: {total}s (cold start included); engine={rA["fm"].get("engine")} compare_ms={rA["fm"].get("ms")} score={rA["fm"].get("score")} faces={rA["fm"].get("faceSize")}')
ok('matching pair auto-approved within 60 s', approved_at is not None, rA)
ok('approved by the automatic check', rA['by'] == 'مطابقة الوجه (تلقائي)', rA)

# 2. non-matching pair (warm)
tokB, uidB, t1 = make_tech('nomatch', 'id_biden.jpg', 'selfie_obama.jpg')
c, j, dtB = fm(tokB)
print(f'  non-match call: HTTP {c} in {dtB}s -> {j}')
rB = row(uidB)
ok('non-matching pair stays pending', c == 200 and j.get('approved') is False and rB['st'] == 'pending', (c, j, rB))
ok('non-matching result stored as no_match with a score', rB['fm'].get('status') == 'no_match' and isinstance(rB['fm'].get('score'), (int, float)), rB)
c, prof = call('GET', f'/rest/v1/profiles?id=eq.{uidB}&select=tech_status,tech_face_match', ADMIN)
ok('admin sees the score via the API', c == 200 and prof and 'score' in (prof[0].get('tech_face_match') or {}), (c, prof))
c, full, dtAdm = fm(ADMIN, {'user_id': uidB})
ok('admin re-run returns the full result with score', c == 200 and 'score' in json.dumps(full), (c, full))
print(f'  admin re-run: {dtAdm}s score={full.get("result", full).get("score") if isinstance(full, dict) else full}')

# 3. self-approval attempts by the pending technician B
c, _ = call('PATCH', f'/rest/v1/profiles?id=eq.{uidB}', tokB, {'tech_status': 'approved'})
ok('tech cannot set own tech_status', row(uidB)['st'] == 'pending', c)
c, _ = call('PATCH', f'/rest/v1/profiles?id=eq.{uidB}', tokB, {'tech_face_match': {'status': 'match', 'score': 0.99}})
ok('tech cannot write own face-match result', row(uidB)['fm'].get('status') == 'no_match', c)
c, _ = call('POST', '/rest/v1/rpc/record_face_match', tokB, {'p_user': uidB, 'p_id_photo': 'x', 'p_selfie': 'y', 'p_result': {'status': 'match', 'score': 0.99, 'faceSize': {'id': 200, 'selfie': 300}}})
ok('tech cannot call record_face_match', c in (401, 403, 404) and row(uidB)['st'] == 'pending', c)
c, j, _ = fm(tokB, {'user_id': uidA, 'status': 'match', 'score': 0.99, 'auto_approved': True})
ok('forged body ignored: tech still pending, no score leaked', row(uidB)['st'] == 'pending' and 'score' not in json.dumps(j), (c, j))
c, j, _ = fm(tokA)
ok('already-approved tech cannot call the check', c == 403, (c, j))
c, j, _ = fm(None)
ok('anonymous call rejected', c in (401, 403), (c, j))

# 4. no face in the selfie -> manual review
tokC, uidC, _ = make_tech('noface', 'id_obama.jpg', 'noface.jpg')
c, j, dtC = fm(tokC)
rC = row(uidC)
ok('selfie without a face stays pending', rC['st'] == 'pending' and rC['fm'].get('status') in ('no_face', 'no_face_selfie', 'error') , rC)
print(f'  no-face call: {dtC}s status={rC["fm"].get("status")}')
print(json.dumps({'cold_call_s': dt, 'submit_to_approved_s': total, 'warm_call_s': dtB, 'admin_rerun_s': dtAdm, 'engine': rA['fm'].get('engine'),
                  'match': {k: rA['fm'].get(k) for k in ('score', 'faceSize', 'ms')}, 'nomatch': {k: rB['fm'].get(k) for k in ('score', 'faceSize', 'ms')}}, ensure_ascii=False))
print(f'\n{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
