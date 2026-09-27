#!/usr/bin/env python3
"""
Laqeeto — attack / authorization test against the live Supabase project (public API only).

Acts as: anonymous visitor, a fresh owner (attacker), a second owner (victim), a fresh technician
(pending -> approved -> suspended by the admin), and the admin. Every check is an attack that must FAIL
(or a legitimate action that must succeed).

  LAQEETO_TEST_CREDENTIALS=/path/outside/repo.json python3 tests/security_attack_test.py

The credentials file (never commit it) must contain:
  {"admin": {"email": "...", "password": "..."}}
Creates throwaway accounts sec-test-<ts>-*@example.com (clean them up afterwards with SQL).
Standard library only. Prints no secrets.
"""
import base64, json, os, re, struct, sys, time, urllib.error, urllib.request, uuid, zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
cfg = open(os.path.join(ROOT, 'js', 'config.js'), encoding='utf-8').read()
URL = re.search(r"SUPABASE_URL = '([^']+)'", cfg).group(1)
ANON = re.search(r"SUPABASE_ANON_KEY = '([^']+)'", cfg).group(1)
CREDS = json.load(open(os.environ['LAQEETO_TEST_CREDENTIALS']))
TS = str(int(time.time()))
TS12 = (TS + str(uuid.uuid4().int))[:12]
results = []

def ok(name, cond, extra=''):
    results.append((name, bool(cond)))
    print(('PASS ' if cond else 'FAIL ') + name + (f'  [{extra}]' if extra and not cond else ''), flush=True)

def png(w=8, h=8):
    raw = zlib.compress(b''.join(b'\x00' + b'\x80\x80\x80' * w for _ in range(h)))
    ch = lambda t, d: struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    return b'\x89PNG\r\n\x1a\n' + ch(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) + ch(b'IDAT', raw) + ch(b'IEND', b'')

def luhn_imei(prefix):
    d = [int(c) for c in prefix]
    s = sum(x if i % 2 == 0 else (x * 2 - 9 if x * 2 > 9 else x * 2) for i, x in enumerate(d))
    return prefix + str((10 - s % 10) % 10)

class C:
    def __init__(self, token=None): self.token = token; self.uid = None
    def call(self, method, path, body=None, raw=None, headers=None):
        h = {'apikey': ANON, 'Authorization': 'Bearer ' + (self.token or ANON)}
        h.update(headers or {})
        data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
        if raw is None and body is not None: h.setdefault('Content-Type', 'application/json')
        req = urllib.request.Request(URL + path, data=data, method=method, headers=h)
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                t = r.read()
                try: return r.status, (json.loads(t) if t else None)
                except ValueError: return r.status, t
        except urllib.error.HTTPError as e:
            t = e.read()
            try: return e.code, json.loads(t)
            except Exception: return e.code, t[:200]
    def rpc(self, fn, args=None): return self.call('POST', f'/rest/v1/rpc/{fn}', args or {})
    def upload(self, bucket, path, data=None, ctype='image/png', extra=None):
        return self.call('POST', f'/storage/v1/object/{bucket}/{path}', raw=data if data is not None else png(), headers={'Content-Type': ctype, **(extra or {})})
    @staticmethod
    def signup(email, pw, meta):
        c = C(); code, j = c.call('POST', '/auth/v1/signup', {'email': email, 'password': pw, 'data': meta})
        assert code == 200 and j.get('access_token'), f'signup failed {code}'
        c.token = j['access_token']; c.uid = j['user']['id']; return c
    @staticmethod
    def login(email, pw):
        c = C(); code, j = c.call('POST', '/auth/v1/token?grant_type=password', {'email': email, 'password': pw})
        assert code == 200, f'login failed {code}'
        c.token = j['access_token']; c.uid = j['user']['id']; return c

denied = lambda code: code in (401, 403) or (code == 400)
PW = 'Sec-' + uuid.uuid4().hex
anon = C()

# ------------------------------------------------------------------ anonymous
print('\n== anonymous (public anon key)')
TABLES = ['profiles', 'reports', 'report_history', 'conversations', 'messages', 'handovers', 'disputes', 'dispute_notes', 'audit_log']
for t in TABLES:
    code, j = anon.call('GET', f'/rest/v1/{t}?select=*&limit=1')
    ok(f'anon cannot read {t}', code in (401, 403), f'HTTP {code}')
code, _ = anon.call('POST', '/rest/v1/audit_log', {'action': 'forged'})
ok('anon cannot insert into audit_log', code in (401, 403), f'HTTP {code}')
for fn in ['technician_check', 'admin_stats', 'admin_review_technician', 'admin_set_role', 'create_handover', 'list_my_conversations', 'log_login']:
    code, _ = anon.rpc(fn, {})
    ok(f'anon cannot call {fn}', code in (401, 403, 404), f'HTTP {code}')
for fn in ['is_admin', 'rate_hit', 'audit', 'client_ip']:
    code, _ = anon.call('POST', f'/rest/v1/rpc/{fn}', {})
    ok(f'private helper {fn} not exposed via API', code in (401, 403, 404), f'HTTP {code}')
code, _ = anon.upload('report-photos', f'{uuid.uuid4()}/x.png')
ok('anon cannot upload to storage', code in (400, 401, 403), f'HTTP {code}')
code, j = anon.call('POST', '/storage/v1/object/list/tech-docs', {'prefix': '', 'limit': 5})
ok('anon cannot list private bucket', code != 200 or j == [], f'HTTP {code}')
code, j = anon.rpc('search_reports', {'q': '356938035643809'})
ok('public search returns only public columns', code == 200 and j and set(j[0]) == {'id', 'brand', 'model', 'color', 'type', 'status', 'active', 'reported_at', 'governorate', 'public_contact', 'is_mine'}, str(code))
ok('public search hides private contact (only public fields)', code == 200 and all('value' not in json.dumps(r['public_contact']) for r in j))
code, j = anon.rpc('search_reports', {'q': '3569'})
ok('public search is exact-match only (no prefix enumeration)', code == 200 and j == [])

# ---------------------------------------------------------------- signup abuse
print('\n== signup privilege escalation')
evil = C.signup(f'sec-test-{TS}-evil@example.com', PW, {'name': 'evil', 'role': 'admin', 'tech_status': 'approved'})
code, prof = evil.call('GET', '/rest/v1/profiles?select=role,tech_status')
ok('signup metadata role=admin is ignored', code == 200 and prof[0]['role'] == 'owner' and prof[0]['tech_status'] is None, str(prof))
evtech = C.signup(f'sec-test-{TS}-evtech@example.com', PW, {'name': 'evtech', 'role': 'technician', 'tech_status': 'approved'})
code, prof = evtech.call('GET', '/rest/v1/profiles?select=role,tech_status')
ok('signup metadata tech_status=approved is ignored (pending)', code == 200 and prof[0]['tech_status'] == 'pending', str(prof))

# --------------------------------------------------------------- owners
print('\n== owner vs owner')
victim = C.signup(f'sec-test-{TS}-victim@example.com', PW, {'name': 'الضحية فلان الفلاني', 'phone': '01011112222'})
att = C.signup(f'sec-test-{TS}-attacker@example.com', PW, {'name': 'مهاجم', 'phone': '01033334444'})
vbox = f'report-photos/{victim.uid}/{uuid.uuid4()}.png'
ok('victim uploads own box photo', victim.upload('report-photos', vbox.split('/', 1)[1])[0] == 200)
imei_v = luhn_imei('35' + TS12)
code, rep = victim.call('POST', '/rest/v1/reports', {'type': 'stolen', 'brand': 'Samsung', 'model': 'SecTest', 'color': 'أسود', 'imei1': imei_v, 'box_photo': vbox,
    'contact': {'phone': {'value': '01011112222', 'public': False}, 'email': {'value': 'victim@example.com', 'public': False}, 'socials': []}},
    headers={'Prefer': 'return=representation'})
ok('victim creates report', code == 201, f'HTTP {code} {rep}')
vrep = rep[0]['id']
code, rows = att.call('GET', f'/rest/v1/reports?id=eq.{vrep}&select=*')
ok('attacker cannot read victim report row', code == 200 and rows == [])
code, rows = att.call('PATCH', f'/rest/v1/reports?id=eq.{vrep}', {'contact': {'phone': {'value': '0100', 'public': True}}}, headers={'Prefer': 'return=representation'})
ok('attacker cannot modify victim report', code in (200, 204, 403) and not rows, f'HTTP {code}')
code, _ = victim.call('PATCH', f'/rest/v1/reports?id=eq.{vrep}', {'status': 'delivered'})
ok('owner cannot set report status directly', code in (401, 403), f'HTTP {code}')
code, _ = att.rpc('set_report_status', {'p_report': vrep, 'p_status': 'found'})
ok('attacker cannot change status of victim report via RPC', denied(code), f'HTTP {code}')
code, _ = att.rpc('create_dispute', {'p_report': vrep, 'p_handover': None, 'p_coercion': False, 'p_description': 'x'})
ok('attacker cannot open dispute on victim report', denied(code), f'HTTP {code}')
code, rows = att.call('PATCH', f'/rest/v1/profiles?id=eq.{victim.uid}', {'name': 'hacked'}, headers={'Prefer': 'return=representation'})
ok('attacker cannot edit victim profile', not rows, f'HTTP {code}')
code, rows = att.call('GET', f'/rest/v1/profiles?id=eq.{victim.uid}&select=*')
ok('attacker cannot read victim profile', code == 200 and rows == [])
for field, val in [('role', 'admin'), ('tech_status', 'approved'), ('email', 'x@example.com'), ('tech_face_match', {'score': 1})]:
    code, _ = att.call('PATCH', f'/rest/v1/profiles?id=eq.{att.uid}', {field: val})
    ok(f'owner cannot change own {field}', code in (401, 403), f'HTTP {code}')
code, _ = att.call('PATCH', f'/rest/v1/profiles?id=eq.{att.uid}', {'name': 'مهاجم ٢', 'phone': '01033334445'})
ok('owner can edit own name/phone', code in (200, 204), f'HTTP {code}')
# report insert tricks
code, j = att.call('POST', '/rest/v1/reports', {'type': 'lost', 'brand': 'X', 'model': 'Y', 'color': 'Z', 'imei1': luhn_imei('86' + TS12), 'box_photo': vbox,
    'contact': {}}, headers={'Prefer': 'return=representation'})
ok("attacker cannot attach victim's photo path to own report", code in (400, 403), f'HTTP {code}')
abox = f'report-photos/{att.uid}/{uuid.uuid4()}.png'; att.upload('report-photos', abox.split('/', 1)[1])
code, j = att.call('POST', '/rest/v1/reports', {'type': 'lost', 'brand': 'X', 'model': 'Y', 'color': 'Z', 'imei1': imei_v, 'box_photo': abox, 'contact': {}})
ok('duplicate active IMEI report rejected', code in (400, 409), f'HTTP {code}')
code, j = att.call('POST', '/rest/v1/reports', {'type': 'lost', 'brand': 'X', 'model': 'Y', 'color': 'Z', 'imei1': '123456789012345', 'box_photo': abox, 'contact': {}})
ok('invalid IMEI (Luhn) rejected by DB', code in (400, 409), f'HTTP {code}')
code, j = att.call('POST', '/rest/v1/reports', {'owner_id': victim.uid, 'status': 'delivered', 'type': 'lost', 'brand': 'X', 'model': 'Y', 'color': 'Z',
    'imei1': luhn_imei('86' + TS12), 'box_photo': abox, 'contact': {}}, headers={'Prefer': 'return=representation'})
ok('owner_id / status cannot be forged on insert', code in (400, 401, 403), f'HTTP {code}')
imei_x = luhn_imei('49' + TS12)
code, j = att.call('POST', '/rest/v1/reports', {'type': 'stolen', 'brand': 'X', 'model': 'XSS', 'color': 'Z', 'imei1': imei_x, 'box_photo': abox,
    'contact': {'phone': {'value': '', 'public': False}, 'email': {'value': '', 'public': False}, 'socials': [{'value': 'javascript:alert(document.cookie)', 'public': True}]}},
    headers={'Prefer': 'return=representation'})
ok('javascript: social link rejected by DB (stored XSS)', code in (400, 403), f'HTTP {code}')
imei_ok = luhn_imei('01' + TS12)
code, j = att.call('POST', '/rest/v1/reports', {'type': 'stolen', 'brand': 'X', 'model': 'Ok', 'color': 'Z', 'imei1': imei_ok, 'box_photo': abox,
    'contact': {'phone': {'value': '', 'public': False}, 'email': {'value': '', 'public': False}, 'socials': [{'value': 'https://facebook.com/someone', 'public': True}]}},
    headers={'Prefer': 'return=representation'})
ok('https social link accepted', code == 201, f'HTTP {code} {j}')
arep = j[0]['id'] if code == 201 else None
if arep:
    code, _ = att.rpc('create_dispute', {'p_report': arep, 'p_handover': None, 'p_coercion': False, 'p_description': 'test', 'p_evidence_link': 'javascript:alert(1)'})
    ok('javascript: evidence link rejected (stored XSS vs admin)', denied(code), f'HTTP {code}')
if arep:
    code, _ = att.call('PATCH', f'/rest/v1/reports?id=eq.{arep}', {'contact': {'socials': [{'value': ' JaVaScRiPt:alert(1)//x.com', 'public': True}]}})
    ok('javascript: link rejected on contact UPDATE too', code in (400, 403), f'HTTP {code}')
    code, _ = att.call('PATCH', f'/rest/v1/reports?id=eq.{arep}', {'contact': {'phone': {'value': '01033334444', 'public': 'yes'}}})
    ok('malformed contact JSON rejected', code in (400, 403), f'HTTP {code}')
code, j = att.call('GET', '/rest/v1/audit_log?select=id&limit=1')
ok('non-admin sees no audit log rows', code == 200 and j == [])
code, _ = att.call('DELETE', '/rest/v1/audit_log?id=gt.0')
ok('non-admin cannot delete audit log', code in (401, 403), f'HTTP {code}')
for fn, args in [('admin_stats', {}), ('admin_review_technician', {'p_user': evtech.uid, 'p_decision': 'approve'}), ('admin_set_role', {'p_user': att.uid, 'p_role': 'admin'}),
                 ('technician_check', {'q': imei_v}), ('create_handover', {'p_report': vrep, 'p_checklist': {}, 'p_device_imei': imei_v, 'p_owner_id_photo': '', 'p_selfie': ''})]:
    code, _ = att.rpc(fn, args)
    ok(f'owner cannot call {fn}', denied(code), f'HTTP {code}')

# storage
print('\n== storage')
code, _ = att.upload('report-photos', f'{victim.uid}/{uuid.uuid4()}.png')
ok("cannot upload into another user's folder", code in (400, 403), f'HTTP {code}')
code, _ = att.upload('report-photos', f'{att.uid}/{uuid.uuid4()}.svg', b'<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>', 'image/svg+xml')
ok('SVG upload rejected (mime allow-list)', code in (400, 403, 415, 422), f'HTTP {code}')
code, _ = att.upload('report-photos', f'{att.uid}/{uuid.uuid4()}.html', b'<script>alert(1)</script>', 'text/html')
ok('HTML upload rejected', code in (400, 403, 415, 422), f'HTTP {code}')
big = f'{att.uid}/{uuid.uuid4()}.png'
code, _ = att.upload('report-photos', big, b'\x89PNG' + b'0' * (5 * 1024 * 1024 + 10))
stored = att.call('POST', f'/storage/v1/object/sign/report-photos/{big}', {'expiresIn': 60})[0] == 200
ok('upload > 5 MB rejected (not stored)', code not in (200, 201) and not stored, f'HTTP {code} stored={stored}')
code, _ = att.upload('report-photos', abox.split('/', 1)[1], extra={'x-upsert': 'true'})
ok('cannot overwrite an existing file (evidence immutable)', code in (400, 403, 409), f'HTTP {code}')
code, _ = att.call('DELETE', f'/storage/v1/object/{abox}')
ok('cannot delete uploaded evidence', code in (400, 403, 404) or (code == 200 and victim.call('POST', f'/storage/v1/object/sign/{abox}', {'expiresIn': 60})[0] != 200), f'HTTP {code}')
code, _ = att.call('POST', f'/storage/v1/object/sign/{vbox}', {'expiresIn': 60})
ok("cannot sign another user's private photo", code != 200, f'HTTP {code}')
code, _ = att.upload('handover-photos', f'{att.uid}/{uuid.uuid4()}.png')
ok('owner cannot upload handover photos', code in (400, 403), f'HTTP {code}')
code, _ = anon.call('GET', f'/storage/v1/object/public/{vbox}')
ok('private photo not reachable via public URL', code != 200, f'HTTP {code}')

# ------------------------------------------------------------ guest privacy
print('\n== guest messaging privacy')
g = C()
code, j = g.rpc('guest_message_owner', {'p_report': vrep, 'p_name': 'ضيف اختبار', 'p_phone': '01055556666', 'p_body': 'لقيت الموبايل'})
ok('guest can message an active report owner', code == 200, f'HTTP {code} {j}')
if code == 200:
    code, conv = g.rpc('guest_get_conversation', {'p_conv': j['conversation_id'], 'p_token': j['token'], 'p_mark': True})
    blob = json.dumps(conv, ensure_ascii=False)
    ok("guest does not learn the owner's real name", 'الضحية' not in blob and 'فلان' not in blob, conv.get('other_name') if isinstance(conv, dict) else conv)
    ok("guest does not learn owner's phone/email", '01011112222' not in blob and 'victim@example.com' not in blob)
    code, _ = g.rpc('guest_get_conversation', {'p_conv': j['conversation_id'], 'p_token': 'wrong', 'p_mark': False})
    ok('guest conversation needs the secret token', denied(code), f'HTTP {code}')
    code, _ = att.rpc('get_conversation', {'p_conv': j['conversation_id']})
    ok('other users cannot read the guest conversation', code == 200 and _ is None, f'HTTP {code}')
    victim.rpc('send_message', {'p_conv': j['conversation_id'], 'p_body': 'شكراً'})
    code, conv = g.rpc('guest_get_conversation', {'p_conv': j['conversation_id'], 'p_token': j['token'], 'p_mark': True})
    blob = json.dumps(conv, ensure_ascii=False)
    ok("owner's reply does not reveal the owner's name to the guest", 'الضحية' not in blob and 'فلان' not in blob)
code, _ = C().call('POST', '/rest/v1/rpc/guest_message_owner', {'p_report': vrep, 'p_name': 'x', 'p_phone': '01055556666', 'p_body': 'spam'},
                   headers={'X-Forwarded-For': '6.6.6.6'})
# rate-limit key must not come from a client-controlled header: 5 msgs/h per phone still applies -> test phone limit
hits = [C().rpc('guest_message_owner', {'p_report': vrep, 'p_name': 'سبام', 'p_phone': '01077778888', 'p_body': f'spam {i}'})[0] for i in range(7)]
ok('guest messages rate-limited per phone (5/h)', hits.count(200) <= 5 and hits[-1] != 200, str(hits))

# --------------------------------------------------------- technicians
print('\n== technician lifecycle')
tdoc = [f'tech-docs/{evtech.uid}/{uuid.uuid4()}.png' for _ in range(3)]
for p in tdoc: evtech.upload('tech-docs', p.split('/', 1)[1])
code, _ = evtech.rpc('submit_technician_documents', {'p_id_photo': vbox, 'p_selfie': tdoc[1], 'p_selfie_method': 'live-camera', 'p_device_shot': tdoc[2]})
ok("tech cannot submit someone else's file as ID photo", denied(code), f'HTTP {code}')
code, _ = evtech.rpc('submit_technician_documents', {'p_id_photo': tdoc[0], 'p_selfie': tdoc[1], 'p_selfie_method': 'live-camera', 'p_device_shot': tdoc[2]})
ok('pending tech can submit own documents', code in (200, 204), f'HTTP {code}')
code, _ = evtech.rpc('admin_review_technician', {'p_user': evtech.uid, 'p_decision': 'approve'})
ok('pending tech cannot approve himself', denied(code), f'HTTP {code}')
code, _ = evtech.call('PATCH', f'/rest/v1/profiles?id=eq.{evtech.uid}', {'tech_status': 'approved'})
ok('pending tech cannot PATCH tech_status', code in (401, 403), f'HTTP {code}')
for col in ['tech_face_match', 'tech_reviewed_by', 'tech_id_photo', 'tech_selfie']:
    code, _ = evtech.call('PATCH', f'/rest/v1/profiles?id=eq.{evtech.uid}', {col: None})
    ok(f'tech cannot PATCH {col}', code in (401, 403), f'HTTP {code}')
code, _ = evtech.rpc('technician_check', {'q': imei_v})
ok('pending tech cannot run technician_check', denied(code), f'HTTP {code}')
code, _ = evtech.upload('handover-photos', f'{evtech.uid}/{uuid.uuid4()}.png')
ok('pending tech cannot upload handover photos', code in (400, 403), f'HTTP {code}')
code, _ = evtech.rpc('message_owner', {'p_report': vrep, 'p_body': 'hi'})
ok('pending tech cannot message owners', denied(code), f'HTTP {code}')
code, _ = evtech.call('POST', f'/storage/v1/object/sign/{tdoc[0]}', {'expiresIn': 60})
ok('tech can sign own documents', code == 200, f'HTTP {code}')

admin = C.login(CREDS['admin']['email'], CREDS['admin']['password'])
code, st = admin.rpc('admin_stats')
ok('admin can read stats', code == 200)
code, _ = admin.call('POST', f'/storage/v1/object/sign/{tdoc[0]}', {'expiresIn': 60})
ok('admin can view tech documents (signed URL)', code == 200, f'HTTP {code}')
code, _ = admin.rpc('admin_review_technician', {'p_user': evtech.uid, 'p_decision': 'approve', 'p_note': 'security test'})
ok('admin approves technician', code in (200, 204), f'HTTP {code}')
evtech = C.login(f'sec-test-{TS}-evtech@example.com', PW)
code, j = evtech.rpc('technician_check', {'q': imei_v})
ok('approved tech can check IMEI', code == 200 and j and j[0]['status'] == 'stolen', f'HTTP {code}')
code, rows = evtech.call('GET', f'/rest/v1/reports?id=eq.{vrep}&select=*')
ok('approved tech still cannot read report rows (owner PII)', code == 200 and rows == [])
code, tconv = evtech.rpc('message_owner', {'p_report': vrep, 'p_body': 'عندي جهاز بنفس الـ IMEI'})
ok('approved tech can message the owner', code == 200, f'HTTP {code}')
if code == 200:
    victim.rpc('send_message', {'p_conv': tconv, 'p_body': 'تمام، هاجي المحل'})
    blob = json.dumps([evtech.call('GET', f'/rest/v1/messages?conversation_id=eq.{tconv}&select=*')[1],
                       evtech.rpc('list_my_conversations')[1], evtech.rpc('get_conversation', {'p_conv': tconv})[1]], ensure_ascii=False)
    ok("technician never sees the owner's real name (tables + RPCs)", 'الضحية' not in blob and 'فلان' not in blob and 'victim@example.com' not in blob)
code, _ = evtech.rpc('create_handover', {'p_report': vrep, 'p_checklist': {'box': True, 'imeiMatch': True, 'unlocked': True}, 'p_device_imei': luhn_imei('35' + '1' * 12),
                                          'p_owner_id_photo': f'handover-photos/{evtech.uid}/a.png', 'p_selfie': f'handover-photos/{evtech.uid}/b.png'})
ok('handover with wrong IMEI rejected', denied(code), f'HTTP {code}')
code, _ = evtech.rpc('create_handover', {'p_report': vrep, 'p_checklist': {'box': True, 'imeiMatch': True, 'unlocked': True}, 'p_device_imei': imei_v,
                                          'p_owner_id_photo': vbox, 'p_selfie': vbox})
ok("handover can't reference another user's photos", denied(code), f'HTTP {code}')
code, _ = evtech.rpc('confirm_handover', {'p_handover': str(uuid.uuid4())})
ok('tech cannot confirm a handover', denied(code), f'HTTP {code}')
code, _ = admin.rpc('admin_review_technician', {'p_user': evtech.uid, 'p_decision': 'suspend', 'p_note': 'security test'})
ok('admin suspends technician', code in (200, 204), f'HTTP {code}')
code, _ = evtech.rpc('technician_check', {'q': imei_v})
ok('suspended tech locked out of technician_check (same token)', denied(code), f'HTTP {code}')
code, _ = evtech.rpc('submit_technician_documents', {'p_id_photo': tdoc[0], 'p_selfie': tdoc[1], 'p_selfie_method': 'live-camera', 'p_device_shot': tdoc[2]})
ok('suspended tech cannot resubmit docs to reset status', denied(code), f'HTTP {code}')
code, _ = evtech.upload('handover-photos', f'{evtech.uid}/{uuid.uuid4()}.png')
ok('suspended tech cannot upload handover photos', code in (400, 403), f'HTTP {code}')
code, _ = admin.call('DELETE', '/rest/v1/audit_log?id=gt.0')
ok('even admin cannot delete audit log', code in (401, 403), f'HTTP {code}')
code, _ = admin.call('PATCH', '/rest/v1/audit_log?id=gt.0', {'action': 'x'})
ok('even admin cannot edit audit log', code in (401, 403), f'HTTP {code}')
code, j = admin.call('GET', '/rest/v1/audit_log?select=action&order=id.desc&limit=50')
ok('admin sees the audit trail of this test', code == 200 and any('اعتماد فني' == r['action'] for r in j))

print('\nCREATED_PREFIX', f'sec-test-{TS}-')
n = sum(r[1] for r in results)
print(f'\n{n}/{len(results)} checks passed')
for name, good in results:
    if not good: print('  FAILED:', name)
sys.exit(0 if n == len(results) else 1)
