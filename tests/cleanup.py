#!/usr/bin/env python3
"""
Purge accounts (and EVERYTHING they own) from the live Supabase project: storage files, reports, report history,
conversations, messages, handovers, disputes, rate-limit counters, optionally their audit-log rows, then the auth users.

Used by the test suites to remove their temporary accounts, and once to remove the old demo data.

  LAQEETO_DB_PASSWORD_FILE=/path/outside/repo python3 tests/cleanup.py 'lqtest-%@example.com' [--audit]

Needs the database password (read from the file named by LAQEETO_DB_PASSWORD_FILE — never commit it).
Storage objects cannot be deleted with SQL, so for the duration of the purge a temporary storage DELETE policy is
created that only matches JWTs whose email matches the pattern; each account gets a random throwaway password,
deletes its own files through the Storage API, and the policy is dropped again in a finally block.
Refuses to touch admin accounts and over-broad patterns.
"""
import json, os, re, secrets, subprocess, sys, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_cfg = open(os.path.join(ROOT, 'js', 'config.js'), encoding='utf-8').read()
URL = re.search(r"SUPABASE_URL = '([^']+)'", _cfg).group(1)
ANON = re.search(r"SUPABASE_ANON_KEY = '([^']+)'", _cfg).group(1)
REF = re.search(r'https://([a-z0-9]+)\.supabase\.co', URL).group(1)
PGHOST = os.environ.get('LAQEETO_PGHOST', 'aws-0-eu-central-1.pooler.supabase.com')


def sql(q):
    pw_file = os.environ.get('LAQEETO_DB_PASSWORD_FILE')
    if not pw_file: raise SystemExit('set LAQEETO_DB_PASSWORD_FILE')
    env = dict(os.environ, PGPASSWORD=open(pw_file).read().strip(), PGSSLMODE='require', PGCONNECT_TIMEOUT='20')
    r = subprocess.run(['psql', '-h', PGHOST, '-p', '5432', '-U', f'postgres.{REF}', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-Atq', '-c', q],
                       env=env, capture_output=True, text=True)
    if r.returncode: raise RuntimeError(r.stderr.strip())
    return r.stdout


def lit(s): return "'" + s.replace("'", "''") + "'"


def _req(method, path, token, body):
    req = urllib.request.Request(URL + path, data=json.dumps(body).encode(), method=method,
                                 headers={'apikey': ANON, 'Authorization': 'Bearer ' + (token or ANON), 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=60) as r: return json.loads(r.read() or b'null')


def purge(pattern, audit=False, verbose=True, extra_rate_keys=()):
    """Delete every auth user whose email matches the SQL LIKE pattern, with all their data. Returns a summary dict."""
    if '@' not in pattern or pattern.replace('%', '').replace('_', '') in ('', '@') or len(pattern.split('@')[1].strip('%')) < 4:
        raise ValueError('pattern too broad')
    p = lit(pattern)
    users = [l.split('|') for l in sql(f"select u.id, u.email, coalesce(pr.role, '') from auth.users u left join public.profiles pr on pr.id = u.id where u.email like {p}").splitlines() if l]
    if any(r == 'admin' for _, _, r in users): raise ValueError('pattern matches an admin account — refusing')
    out = {'users': len(users), 'files_deleted': 0, 'files_left': 0, 'audit_rows_deleted': 0}
    if extra_rate_keys:
        sql('delete from private.rate_events where key in (' + ','.join(lit(k) for k in extra_rate_keys) + ')')
    if not users: return out
    ids = ','.join(lit(i) for i, _, _ in users)
    objs = [l.split('|', 2) for l in sql(f"select owner_id, bucket_id, name from storage.objects where owner_id in ({ids})").splitlines() if l]
    if objs:
        tmp = 'Purge-' + secrets.token_urlsafe(24)
        sql(f"""update auth.users set encrypted_password = extensions.crypt({lit(tmp)}, extensions.gen_salt('bf')) where id in ({ids});
drop policy if exists tmp_purge_delete on storage.objects;
create policy tmp_purge_delete on storage.objects for delete to authenticated
  using (owner_id = (select auth.uid())::text and (select auth.jwt() ->> 'email') like {p});""")
        try:
            email = {i: e for i, e, _ in users}
            by = {}
            for o, b, n in objs: by.setdefault(o, {}).setdefault(b, []).append(n)
            for uid, buckets in by.items():
                tok = _req('POST', '/auth/v1/token?grant_type=password', None, {'email': email[uid], 'password': tmp})['access_token']
                for b, names in buckets.items():
                    for i in range(0, len(names), 100):
                        out['files_deleted'] += len(_req('DELETE', f'/storage/v1/object/{b}', tok, {'prefixes': names[i:i + 100]}) or [])
        finally:
            sql("drop policy if exists tmp_purge_delete on storage.objects")
        out['files_left'] = int(sql(f"select count(*) from storage.objects where owner_id in ({ids})").strip())
    reports = f"select id from public.reports where owner_id in ({ids})"
    if audit:
        out['audit_rows_deleted'] = int(sql(f"with d as (delete from public.audit_log where actor_id in ({ids}) or report_id in ({reports}) or details in (select email from auth.users where id in ({ids})) returning 1) select count(*) from d").strip())
    sql(f"""delete from private.rate_events where key ~ ({lit('(' + '|'.join(i for i, _, _ in users) + ')')})
       or key in (select 'guest:report:' || id::text from public.reports where owner_id in ({ids}));
delete from auth.users where id in ({ids});""")
    out['users_left'] = int(sql(f"select count(*) from auth.users where email like {p}").strip())
    if verbose: print('purge', pattern, json.dumps(out))
    return out


if __name__ == '__main__':
    if len(sys.argv) < 2: raise SystemExit(__doc__)
    purge(sys.argv[1], audit='--audit' in sys.argv)
