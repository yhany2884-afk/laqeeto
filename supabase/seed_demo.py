#!/usr/bin/env python3
"""
Demo data for Laqeeto on Supabase. Called by setup.py (step "seed"); can also be run alone:
    python3 supabase/setup.py --steps seed
Creates the demo data accounts through the normal public sign-up API (so every trigger / RLS path is
exercised), uploads placeholder images, then uses SQL only for what users must NOT be able to do
themselves: approving the demo technician and marking one report delivered.

SECURITY: there are NO public demo credentials and the seed NEVER creates an admin.
Each demo account gets a long random password on every run (or LAQEETO_DEMO_PASSWORD_<KEY> from the
environment, e.g. LAQEETO_DEMO_PASSWORD_OWNER). Passwords are never printed; if
LAQEETO_DEMO_CREDENTIALS_FILE is set they are written there with chmod 600 (keep it outside the repo).
Admins are created by promoting a real account with SQL.
Re-running is safe: demo users are reused (password rotated) and their reports are recreated.
Standard library only. No secret is printed.
"""
import json, os, secrets, string, struct, urllib.error, urllib.request, zlib, uuid

def demo_password(key):
    env = os.environ.get(f'LAQEETO_DEMO_PASSWORD_{key.upper()}', '').strip()
    if env:
        if len(env) < 16: raise SystemExit(f'LAQEETO_DEMO_PASSWORD_{key.upper()} must be at least 16 characters')
        return env
    a = string.ascii_letters + string.digits
    return ''.join(secrets.choice(a) for _ in range(28)) + secrets.choice('!@#%^*-_') + secrets.choice(string.digits)

USERS = [
    dict(key='owner', email='owner@demo.eg', meta={'name': 'أحمد محمود', 'phone': '01012345678', 'role': 'owner'}),
    dict(key='mona', email='mona@demo.eg', meta={'name': 'منى السيد', 'phone': '01198765432', 'role': 'owner'}),
    dict(key='tech', email='tech@demo.eg', meta={'name': 'كريم حسن', 'phone': '01234567890', 'role': 'technician',
         'shop_name': 'مركز النور لصيانة الموبايل', 'address': 'شارع التحرير، الدقي', 'governorate': 'الجيزة', 'device_imei': '354678119876543'}),
    dict(key='newtech', email='newtech@demo.eg', meta={'name': 'سامح عادل', 'phone': '01555555555', 'role': 'technician',
         'shop_name': 'سامح موبايل', 'address': 'ميدان الساعة', 'governorate': 'الإسكندرية', 'device_imei': '864123055566777'}),
]

def png(w, h, bg, fg, pattern='box'):
    """Tiny dependency-free PNG: background + a simple shape (placeholder photos)."""
    rows = []
    for y in range(h):
        row = bytearray([0])
        for x in range(w):
            inside = False
            if pattern == 'box': inside = w * .12 < x < w * .88 and h * .2 < y < h * .8 and (x // 6) % 2 == 0 and h * .4 < y < h * .6
            elif pattern == 'card': inside = (w * .08 < x < w * .35 and h * .25 < y < h * .8) or (w * .45 < x < w * .9 and int(y / h * 10) in (3, 5, 7))
            elif pattern == 'face': inside = ((x - w / 2) ** 2 + (y - h * .4) ** 2) < (w * .2) ** 2 or (y > h * .72 and abs(x - w / 2) < w * .32)
            elif pattern == 'phone': inside = w * .1 < x < w * .9 and h * .05 < y < h * .95 and not (w * .16 < x < w * .84 and h * .12 < y < h * .85)
            row += bytes(fg if inside else bg)
        rows.append(bytes(row))
    raw = zlib.compress(b''.join(rows), 9)
    def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) + chunk(b'IDAT', raw) + chunk(b'IEND', b'')

class Api:
    def __init__(self, url, anon, log):
        self.url, self.anon, self.log = url, anon, log
    def call(self, method, path, body=None, token=None, headers=None, raw=None, ok=(200, 201, 204)):
        h = {'apikey': self.anon, 'Authorization': 'Bearer ' + (token or self.anon)}
        h.update(headers or {})
        data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
        if raw is None and body is not None: h['Content-Type'] = 'application/json'
        req = urllib.request.Request(self.url + path, data=data, method=method, headers=h)
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                t = r.read(); return r.status, (json.loads(t) if t else None)
        except urllib.error.HTTPError as e:
            t = e.read()
            try: j = json.loads(t)
            except Exception: j = {'raw': t.decode(errors='replace')[:300]}
            return e.code, j
    def session(self, email, pw, meta, sql=None):
        code, j = self.call('POST', '/auth/v1/signup', {'email': email, 'password': pw, 'data': meta})
        if code in (200, 201) and j.get('access_token'):
            self.log('  created', email); return j['access_token'], j['user']['id']
        # existing account: rotate its password to the new random one (SQL, bcrypt), then sign in
        if sql is not None:
            lit = "'" + pw.replace("'", "''") + "'"
            sql(f"update auth.users set encrypted_password = extensions.crypt({lit}, extensions.gen_salt('bf', 10)), updated_at = now() "
                f"where email = '{email}';")
        code, j = self.call('POST', '/auth/v1/token?grant_type=password', {'email': email, 'password': pw})
        if code == 200:
            self.log('  exists (password rotated)', email); return j['access_token'], j['user']['id']
        raise RuntimeError(f'cannot sign up / in {email}: HTTP {code}')
    def upload(self, token, uid, bucket, data):
        path = f'{uid}/{uuid.uuid4()}.png'
        code, j = self.call('POST', f'/storage/v1/object/{bucket}/{path}', token=token, raw=data, headers={'Content-Type': 'image/png', 'x-upsert': 'false'})
        if code not in (200, 201): raise RuntimeError(f'upload failed {code} {j}')
        return f'{bucket}/{path}'
    def rpc(self, token, fn, args):
        code, j = self.call('POST', f'/rest/v1/rpc/{fn}', args, token=token)
        if code not in (200, 204): raise RuntimeError(f'rpc {fn} failed {code} {j}')
        return j
    def insert(self, token, table, row):
        code, j = self.call('POST', f'/rest/v1/{table}', row, token=token, headers={'Prefer': 'return=representation'})
        if code not in (200, 201): raise RuntimeError(f'insert {table} failed {code} {j}')
        return j[0]

def run(url, anon, sql, service_key=None, log=print):
    api = Api(url, anon, log)
    log('seeding demo accounts …')
    passwords = {u['key']: demo_password(u['key']) for u in USERS}
    S = {u['key']: api.session(u['email'], passwords[u['key']], u['meta'], sql) for u in USERS}
    cred_file = os.environ.get('LAQEETO_DEMO_CREDENTIALS_FILE')
    if cred_file:
        fd = os.open(cred_file, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, 'w') as f: json.dump({u['email']: passwords[u['key']] for u in USERS}, f, indent=2)
        log('  demo passwords written to', cred_file, '(chmod 600)')
    ids = {k: v[1] for k, v in S.items()}
    q = lambda v: "'" + str(v).replace("'", "''") + "'"
    # technician documents (placeholder images) uploaded by the technicians themselves
    prof = {r['id']: r for r in sql("select id, tech_id_photo, tech_status from public.profiles where id in (%s)" % ','.join(q(i) for i in ids.values()))}
    for k, hue in (('tech', ((230, 245, 250), (14, 116, 144))), ('newtech', ((250, 240, 230), (180, 83, 9)))):
        tok, uid = S[k]
        if not prof.get(uid, {}).get('tech_id_photo'):
            if prof.get(uid, {}).get('tech_status') not in ('pending', 'rejected'):
                sql(f"update public.profiles set tech_status = 'pending' where id = {q(uid)};")
            docs = [api.upload(tok, uid, 'tech-docs', png(*a)) for a in ((360, 230, *hue, 'card'), (300, 300, *hue, 'face'), (200, 360, (248, 250, 252), (15, 23, 42), 'phone'))]
            api.rpc(tok, 'submit_technician_documents', {'p_id_photo': docs[0], 'p_selfie': docs[1], 'p_selfie_method': 'live-camera', 'p_device_shot': docs[2]})
    sql(f"""update public.profiles set tech_status = 'approved', tech_reviewed_by = null, tech_reviewed_by_name = 'فريق الدعم الفني',
            tech_reviewed_at = now(), tech_review_note = 'تمت المراجعة يدوياً' where id = {q(ids['tech'])};
            update public.profiles set tech_status = 'pending', tech_reviewed_by = null, tech_reviewed_at = null, tech_review_note = null where id = {q(ids['newtech'])};""")
    # recreate demo reports
    # reuse the previous placeholder photos so re-seeding doesn't leave orphaned files in Storage
    old_photos = {r['imei1']: r['box_photo'] for r in sql(f"select imei1, box_photo from public.reports where owner_id in ({q(ids['owner'])}, {q(ids['mona'])}) and box_photo is not null")}
    sql(f"delete from public.reports where owner_id in ({q(ids['owner'])}, {q(ids['mona'])});")
    def contact(phone, email, public_phone=False):
        return {'phone': {'value': phone, 'public': public_phone}, 'email': {'value': email, 'public': False},
                'socials': [{'value': 'https://facebook.com/demo.profile', 'public': False}]}
    reports = [
        ('owner', dict(type='stolen', brand='Samsung', model='Galaxy S23', color='أسود', imei1='356938035643809', imei2='356938035643817', serial='R58N12ABCDE',
                       governorate='القاهرة', place='مترو السادات', description='سُرق من الجيب في زحام المترو.', police_number='1234 لسنة 2026 إداري قصر النيل',
                       contact=contact('01012345678', 'owner@demo.eg'))),
        ('owner', dict(type='lost', brand='Apple iPhone', model='13', color='أزرق', imei1='352099001761481', governorate='الجيزة', place='تاكسي من المهندسين',
                       description='نسيته في تاكسي.', contact=contact('01012345678', 'owner@demo.eg'))),
        ('mona', dict(type='stolen', brand='Xiaomi', model='Redmi Note 12', color='أخضر', imei1='868910041234577', governorate='الإسكندرية', place='محطة الرمل',
                      description='خطف من اليد.', police_number='987 لسنة 2026', contact=contact('01198765432', 'mona@demo.eg', True))),
        ('mona', dict(type='stolen', brand='Oppo', model='Reno 8', color='فضي', imei1='353325101234569', governorate='القاهرة', place='مدينة نصر',
                      contact=contact('01198765432', 'mona@demo.eg'))),
    ]
    rep = []
    for who, r in reports:
        tok, uid = S[who]
        prev = old_photos.get(r['imei1'])
        r['box_photo'] = prev if prev and prev.startswith(f'report-photos/{uid}/') else api.upload(tok, uid, 'report-photos', png(320, 220, (226, 232, 240), (15, 23, 42), 'box'))
        rep.append(api.insert(tok, 'reports', r))
    sql(f"select set_config('laqeeto.note', 'تسليم تجريبي سابق', true); update public.reports set status = 'delivered' where id = {q(rep[3]['id'])};")
    # a demo conversation: the technician found the lost iPhone
    tech_tok, owner_tok = S['tech'][0], S['owner'][0]
    conv = api.rpc(tech_tok, 'message_owner', {'p_report': rep[1]['id'], 'p_body': 'السلام عليكم، جالي عميل عايز يبيع iPhone 13 أزرق والـ IMEI بتاعه مطابق لبلاغك. ممكن تيجي المحل بعلبة الموبايل؟'})
    api.rpc(owner_tok, 'send_message', {'p_conv': conv, 'p_body': 'وعليكم السلام، شكراً جداً! هاجي بكرة الساعة 5 ومعايا العلبة والفاتورة.'})
    log('demo data ready: 4 accounts (random passwords, no admin), 4 reports, 1 conversation')
    return ids
