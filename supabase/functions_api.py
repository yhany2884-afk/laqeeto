#!/usr/bin/env python3
"""Deploy / delete Edge Functions and set function secrets through the Supabase Management API (no Docker/CLI needed).
The access token is read from $SUPABASE_ACCESS_TOKEN or from a JSON file given by $SUPABASE_TOKEN_FILE (key card.SUPABASE_ACCESS_TOKEN).
It is never printed.

  python3 supabase/functions_api.py deploy <dir> <slug> [--no-verify-jwt]
  python3 supabase/functions_api.py delete <slug>
  python3 supabase/functions_api.py list
  python3 supabase/functions_api.py secrets-set NAME=@file_or_env ...      (values are read from a file path or env var, never argv)
  python3 supabase/functions_api.py secrets-list
"""
import json, os, re, sys, uuid, urllib.request, urllib.error
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REF = re.search(r"https://([a-z0-9]+)\.supabase\.co", (ROOT / 'js/config.js').read_text()).group(1)
API = f'https://api.supabase.com/v1/projects/{REF}'

def token():
    t = os.environ.get('SUPABASE_ACCESS_TOKEN')
    if not t and os.environ.get('SUPABASE_TOKEN_FILE'):
        t = json.load(open(os.environ['SUPABASE_TOKEN_FILE'])).get('card', {}).get('SUPABASE_ACCESS_TOKEN')
    if not t: sys.exit('no Supabase access token (set SUPABASE_ACCESS_TOKEN or SUPABASE_TOKEN_FILE)')
    return t

def req(method, path, body=None, raw=None, ctype='application/json'):
    h = {'Authorization': 'Bearer ' + token(), 'User-Agent': 'laqeeto-deploy'}
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    if data is not None: h['Content-Type'] = ctype
    try:
        with urllib.request.urlopen(urllib.request.Request(API + path, data=data, method=method, headers=h), timeout=180) as r:
            t = r.read(); return r.status, (json.loads(t) if t else None)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode(errors='replace')[:2000]

def deploy(d, slug, verify_jwt=True):
    d = Path(d); files = sorted(p for p in d.rglob('*') if p.is_file() and p.suffix in ('.ts', '.js', '.json', '.mjs'))
    meta = {'entrypoint_path': 'index.ts', 'name': slug, 'verify_jwt': verify_jwt}
    b = uuid.uuid4().hex; parts = []
    parts.append(f'--{b}\r\nContent-Disposition: form-data; name="metadata"\r\nContent-Type: application/json\r\n\r\n{json.dumps(meta)}\r\n'.encode())
    for p in files:
        rel = p.relative_to(d).as_posix()
        parts.append(f'--{b}\r\nContent-Disposition: form-data; name="file"; filename="{rel}"\r\nContent-Type: application/typescript\r\n\r\n'.encode() + p.read_bytes() + b'\r\n')
    parts.append(f'--{b}--\r\n'.encode())
    code, j = req('POST', f'/functions/deploy?slug={slug}', raw=b''.join(parts), ctype=f'multipart/form-data; boundary={b}')
    print('deploy', slug, code, j if code >= 300 else {k: j.get(k) for k in ('slug', 'version', 'status', 'verify_jwt')})
    return code < 300

def main():
    a = sys.argv[1:]
    if not a: sys.exit(__doc__)
    if a[0] == 'deploy': sys.exit(0 if deploy(a[1], a[2], '--no-verify-jwt' not in a) else 1)
    if a[0] == 'delete': print(req('DELETE', f'/functions/{a[1]}')[0])
    if a[0] == 'list':
        c, j = req('GET', '/functions'); print(c, [(f['slug'], f.get('version'), f.get('status'), f.get('verify_jwt')) for f in j] if c == 200 else j)
    if a[0] == 'secrets-list':
        c, j = req('GET', '/secrets'); print(c, [s['name'] for s in j] if c == 200 else j)
    if a[0] == 'secrets-set':
        out = []
        for kv in a[1:]:
            name, src = kv.split('=', 1); assert src.startswith('@'), 'value must be @file or @ENV'
            src = src[1:]
            if os.path.isfile(src): val = Path(src).read_text().strip()
            elif src.startswith('json:'):   # json:<file>:<dotted.key>
                _, f, key = src.split(':', 2); val = json.load(open(f))
                for k in key.split('.'): val = val[k]
            else: val = os.environ[src]
            out.append({'name': name, 'value': val})
        c, j = req('POST', '/secrets', out); print('secrets-set', [o['name'] for o in out], c, '' if c < 300 else j)

if __name__ == '__main__':
    main()
