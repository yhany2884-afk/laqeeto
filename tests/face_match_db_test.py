"""Tests the face-match DB policy (record_face_match / face_match_target) on the live project with a temporary technician.
LAQEETO_DB_PASSWORD_FILE=... python3 tests/face_match_db_test.py   (cleans up after itself)"""
import atexit, json, os, re, secrets, subprocess, sys, urllib.request, urllib.error, uuid
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import cleanup
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
cfg = open(os.path.join(ROOT, 'js/config.js')).read()
URL = re.search(r"SUPABASE_URL = '([^']+)'", cfg).group(1); ANON = re.search(r"SUPABASE_ANON_KEY = '([^']+)'", cfg).group(1)
PREFIX = f'lqtest-fm-{secrets.token_hex(3)}-'
atexit.register(lambda: cleanup.purge(PREFIX + '%@example.com', audit=True, verbose=False))
res = []
def ok(n, c, x=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n, '' if c else x, flush=True)
def call(method, path, token=None, body=None, raw=None, ctype='application/json'):
    h = {'apikey': ANON, 'Authorization': 'Bearer ' + (token or ANON), 'Content-Type': ctype}
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    try:
        with urllib.request.urlopen(urllib.request.Request(URL + path, data=data, method=method, headers=h), timeout=60) as r:
            t = r.read(); return r.status, (json.loads(t) if t else None)
    except urllib.error.HTTPError as e: return e.code, e.read()[:200]
sql = lambda q: cleanup.sql(q)
PW = 'Fm-' + uuid.uuid4().hex
code, j = call('POST', '/auth/v1/signup', body={'email': PREFIX + 'tech@example.com', 'password': PW, 'data': {'name': 'فني مطابقة', 'role': 'technician', 'shop_name': 'محل', 'governorate': 'القاهرة', 'address': 'x'}})
tok, uid = j['access_token'], j['user']['id']
jpg = bytes.fromhex('ffd8ffe000104a46494600010100000100010000ffd9')
paths = []
for n in ('id', 'selfie', 'shot'):
    p = f'{uid}/{uuid.uuid4()}.jpg'; call('POST', f'/storage/v1/object/tech-docs/{p}', tok, raw=jpg, ctype='image/jpeg'); paths.append('tech-docs/' + p)
code, _ = call('POST', '/rest/v1/rpc/submit_technician_documents', tok, {'p_id_photo': paths[0], 'p_selfie': paths[1], 'p_selfie_method': 'live-camera', 'p_device_shot': paths[2]})
ok('technician submitted documents', code in (200, 204), code)
row = lambda: json.loads(sql(f"select json_build_object('st', tech_status, 'fm', tech_face_match, 'by', tech_reviewed_by_name) from public.profiles where id = '{uid}'"))
ok('face match reset to pending on submit', row()['fm'] == {'status': 'pending'}, row())
# API roles cannot call the service-only functions
for fn, args in [('record_face_match', {'p_user': uid, 'p_id_photo': paths[0], 'p_selfie': paths[1], 'p_result': {'status': 'match', 'score': 0.99, 'faceSize': {'id': 200, 'selfie': 300}}}),
                 ('face_match_target', {'p_user': uid})]:
    code, _ = call('POST', f'/rest/v1/rpc/{fn}', tok, args); ok(f'technician cannot call {fn}', code in (401, 403, 404), code)
    code, _ = call('POST', f'/rest/v1/rpc/{fn}', None, args); ok(f'anon cannot call {fn}', code in (401, 403, 404), code)
ok('technician still pending (no self-approval)', row()['st'] == 'pending')
def rec(result, idp=None, sp=None):
    r = json.dumps(result).replace("'", "''")
    return json.loads(sql(f"set role service_role; select public.record_face_match('{uid}', '{idp or paths[0]}', '{sp or paths[1]}', '{r}'::jsonb)"))
ok('service role can read targets', json.loads(sql(f"set role service_role; select public.face_match_target('{uid}')"))['id_photo'] == paths[0])
ok('stale result (documents changed) is ignored', rec({'status': 'match', 'score': 0.9, 'faceSize': {'id': 200, 'selfie': 300}}, idp='tech-docs/x/old.jpg') == {'stale': True} and row()['st'] == 'pending')
r = rec({'status': 'match', 'score': 0.42, 'faceSize': {'id': 200, 'selfie': 300}, 'model': 't'})
ok('weak match stored, not auto-approved', r['auto_approved'] is False and row()['st'] == 'pending' and row()['fm']['score'] == 0.42, row())
r = rec({'status': 'match', 'score': 0.8, 'faceSize': {'id': 25, 'selfie': 300}, 'model': 't'})
ok('strong score but tiny ID face → manual review', r['auto_approved'] is False and row()['st'] == 'pending')
r = rec({'status': 'no_match', 'score': 0.1, 'faceSize': {'id': 200, 'selfie': 300}, 'model': 't'})
ok('no match → stays pending (never auto-rejected)', r['auto_approved'] is False and row()['st'] == 'pending')
try: rec({'status': 'approved'}); ok('unknown status rejected', False)
except subprocess.CalledProcessError: ok('unknown status rejected', True)
except Exception as e: ok('unknown status rejected', 'bad result' in str(e), str(e))
r = rec({'status': 'match', 'score': 0.66, 'faceSize': {'id': 120, 'selfie': 300}, 'model': 't'})
ok('clear match → auto-approved', r['auto_approved'] is True and row()['st'] == 'approved' and row()['by'] == 'مطابقة الوجه (تلقائي)', row())
audit = sql(f"select string_agg(action, '|') from public.audit_log where meta->>'target_user' = '{uid}'")
ok('audit log has face-match entries + auto approval', 'مطابقة الوجه' in audit and 'اعتماد فني تلقائي' in audit, audit)
r = rec({'status': 'match', 'score': 0.9, 'faceSize': {'id': 120, 'selfie': 300}, 'model': 't'})
ok('re-check of an approved tech does not re-approve/log approval again', r['auto_approved'] is False)
print(f'\n{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
