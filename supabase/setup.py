#!/usr/bin/env python3
"""
Laqeeto — one-shot Supabase setup via the Management API (https://api.supabase.com/v1).

  SUPABASE_ACCESS_TOKEN=sbp_... python3 supabase/setup.py            # everything
  python3 supabase/setup.py --steps schema,auth                        # selected steps

Token: env SUPABASE_ACCESS_TOKEN, else the file ~/.supabase_token (chmod 600).
Steps: project, schema, auth, config, seed   (default: project,schema,auth,config — 'seed' is opt-in, test projects only)

 * Finds or creates organization "laqeeto" and project "laqeeto" (region eu-central-1).
 * DB password: generated, saved to ~/.laqeeto_db_password (chmod 600). Never printed.
 * Applies supabase/schema.sql (tables, RLS, RPCs, storage buckets + policies).
 * Auth: site URL + redirect allow-list = GitHub Pages; email confirmation OFF (prototype).
 * Writes the project URL + public anon (publishable) key into js/config.js.
 * Optionally (--steps seed + LAQEETO_SEED_DEMO=yes, never production) seeds random demo data (supabase/seed_demo.py).
The access token, service-role/secret keys and the DB password are never printed or written to the repo.
Only the Python standard library is used.
"""
import argparse, json, os, secrets, string, sys, time, urllib.error, urllib.request, uuid, base64, stat, pathlib

API = 'https://api.supabase.com/v1'
NAME = 'laqeeto'
REGION = 'eu-central-1'
SITE_URL = 'https://yhany2884-afk.github.io/laqeeto/'
REDIRECTS = [SITE_URL + '**', 'http://localhost:*/**', 'http://127.0.0.1:*/**']
HOME = pathlib.Path.home()
ROOT = pathlib.Path(__file__).resolve().parent.parent
PW_FILE = HOME / '.laqeeto_db_password'
STATE_FILE = HOME / '.laqeeto_project.json'   # non-secret: org slug, project ref, url

def log(*a): print('[setup]', *a, flush=True)

def token():
    t = os.environ.get('SUPABASE_ACCESS_TOKEN', '').strip()
    if not t:
        f = HOME / '.supabase_token'
        if f.exists(): t = f.read_text().strip()
    if not t: sys.exit('SUPABASE_ACCESS_TOKEN not set and ~/.supabase_token missing')
    return t

def http(method, url, body=None, headers=None, raw=False, timeout=120):
    data = None
    h = dict(headers or {})
    if body is not None and not isinstance(body, (bytes, bytearray)):
        data = json.dumps(body).encode(); h.setdefault('Content-Type', 'application/json')
    elif body is not None:
        data = bytes(body)
    h.setdefault('User-Agent', 'laqeeto-setup/1.0')
    req = urllib.request.Request(url, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            txt = r.read()
            if raw: return r.status, txt
            return r.status, (json.loads(txt) if txt else None)
    except urllib.error.HTTPError as e:
        txt = e.read()
        try: j = json.loads(txt)
        except Exception: j = {'raw': txt.decode(errors='replace')[:500]}
        return e.code, j

class Mgmt:
    def __init__(self):
        self.h = {'Authorization': 'Bearer ' + token()}
    def req(self, method, path, body=None, ok=(200, 201), retries=4):
        for i in range(retries):
            code, j = http(method, API + path, body, self.h)
            if code in ok: return j
            if code in (429, 500, 502, 503, 504) and i < retries - 1:
                time.sleep(5 * (i + 1)); continue
            raise RuntimeError(f'{method} {path} -> HTTP {code}: {json.dumps(j, ensure_ascii=False)[:600]}')
    def sql(self, query):
        return self.req('POST', f'/projects/{self.ref}/database/query', {'query': query})

def gen_password(n=32):
    alphabet = string.ascii_letters + string.digits
    while True:
        p = ''.join(secrets.choice(alphabet) for _ in range(n))
        if any(c.islower() for c in p) and any(c.isupper() for c in p) and any(c.isdigit() for c in p): return p

def write_secret(path, value):
    path.write_text(value)
    os.chmod(path, stat.S_IRUSR | stat.S_IWUSR)

def load_state():
    try: return json.loads(STATE_FILE.read_text())
    except Exception: return {}
def save_state(s):
    STATE_FILE.write_text(json.dumps(s, indent=2)); os.chmod(STATE_FILE, 0o600)

# ------------------------------------------------------------------ steps ----
def step_project(m):
    orgs = m.req('GET', '/organizations')
    org = next((o for o in orgs if o.get('name') == NAME), None) or (orgs[0] if orgs else None)
    if not org:
        log('creating organization', NAME)
        org = m.req('POST', '/organizations', {'name': NAME})
    slug = org.get('slug') or org.get('id')
    log('organization:', org.get('name'), slug)
    projects = m.req('GET', '/projects')
    proj = next((p for p in projects if p.get('name') == NAME), None)
    if not proj:
        if PW_FILE.exists() and PW_FILE.read_text().strip():
            pw = PW_FILE.read_text().strip()
        else:
            pw = gen_password(); write_secret(PW_FILE, pw)
        log(f'creating project {NAME} in {REGION} (DB password saved to {PW_FILE}, chmod 600)')
        proj = m.req('POST', '/projects', {'name': NAME, 'organization_slug': slug, 'db_pass': pw,
                                          'region_selection': {'type': 'specific', 'code': REGION}})
    m.ref = proj['ref']
    log('project ref:', m.ref, 'region:', proj.get('region'))
    save_state({'org_slug': slug, 'ref': m.ref, 'url': f'https://{m.ref}.supabase.co', 'region': proj.get('region')})
    wait_healthy(m)

def wait_healthy(m, timeout=900):
    t0 = time.time(); last = None
    while time.time() - t0 < timeout:
        p = m.req('GET', f'/projects/{m.ref}')
        st = p.get('status')
        if st != last: log('project status:', st); last = st
        if st == 'ACTIVE_HEALTHY':
            code, h = http('GET', f'{API}/projects/{m.ref}/health?services=db,rest,auth,storage', headers=m.h)
            if code == 200 and all(s.get('status') == 'ACTIVE_HEALTHY' for s in h):
                log('all services healthy'); return
            log('services:', ', '.join(f"{s.get('name')}={s.get('status')}" for s in (h or [])) if code == 200 else f'health HTTP {code}')
        elif st in ('INIT_FAILED', 'REMOVED', 'RESTORE_FAILED'):
            raise RuntimeError('project failed: ' + st)
        time.sleep(10)
    raise RuntimeError('timeout waiting for project to become healthy')

def step_schema(m):
    sql = (ROOT / 'supabase' / 'schema.sql').read_text()
    log('applying schema.sql …')
    m.sql(sql)
    tables = m.sql("select table_name from information_schema.tables where table_schema='public' order by 1")
    buckets = m.sql('select id, public from storage.buckets order by 1')
    log('tables:', ', '.join(t['table_name'] for t in tables))
    log('buckets:', ', '.join(f"{b['id']}(public={b['public']})" for b in buckets))

def step_auth(m):
    body = {
        'site_url': SITE_URL,
        'uri_allow_list': ','.join(REDIRECTS),
        'mailer_autoconfirm': True,          # prototype: no email confirmation (see README)
        'external_email_enabled': True,
        'disable_signup': False,
        'password_min_length': 6,
    }
    m.req('PATCH', f'/projects/{m.ref}/config/auth', body)
    cfg = m.req('GET', f'/projects/{m.ref}/config/auth')
    log('auth config: site_url=%s autoconfirm=%s allow_list=%s' % (cfg.get('site_url'), cfg.get('mailer_autoconfirm'), cfg.get('uri_allow_list')))

def get_keys(m):
    keys = m.req('GET', f'/projects/{m.ref}/api-keys?reveal=true')
    anon = next((k['api_key'] for k in keys if k.get('name') == 'anon' and k.get('api_key')), None) \
        or next((k['api_key'] for k in keys if k.get('type') == 'publishable' and k.get('api_key')), None)
    service = next((k['api_key'] for k in keys if k.get('name') == 'service_role' and k.get('api_key')), None) \
        or next((k['api_key'] for k in keys if k.get('type') == 'secret' and k.get('api_key')), None)
    if not anon: raise RuntimeError('could not find anon/publishable key')
    return anon, service   # service key: memory only, never printed / written

def step_config(m):
    anon, _ = get_keys(m)
    url = f'https://{m.ref}.supabase.co'
    cfg = ROOT / 'js' / 'config.js'
    cfg.write_text(f"""// إعدادات الاتصال بـ Supabase — written by supabase/setup.py
// The anon/publishable key is PUBLIC by design: all data is protected by Row Level Security.
// NEVER put the service_role / secret key here.
export const SUPABASE_URL = '{url}';
export const SUPABASE_ANON_KEY = '{anon}';
export const SITE_URL = '{SITE_URL}';
""")
    log('wrote js/config.js with project URL', url, '(anon key is public by design)')

# ------------------------------------------------------------------- seed ----
def step_seed(m):
    import seed_demo
    anon, _ = get_keys(m)   # seeding only needs the public anon key (+ SQL via the Management API)
    seed_demo.run(f'https://{m.ref}.supabase.co', anon, m.sql, log=log)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--steps', default='project,schema,auth,config')
    a = ap.parse_args()
    steps = [s.strip() for s in a.steps.split(',') if s.strip()]
    m = Mgmt()
    if 'project' in steps: step_project(m)
    else:
        st = load_state()
        if not st.get('ref'): sys.exit('no project yet: run with --steps project first')
        m.ref = st['ref']
    sys.path.insert(0, str(ROOT / 'supabase'))
    for s in steps:
        if s == 'project': continue
        {'schema': step_schema, 'auth': step_auth, 'config': step_config, 'seed': step_seed}[s](m)
    log('done.')

if __name__ == '__main__':
    main()
