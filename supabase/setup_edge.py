#!/usr/bin/env python3
"""One-shot: deploy face-match + telegram-bot, set their secrets, and point the Telegram webhook at the function.
Needs a Supabase access token with edge_functions_write + edge_functions_secrets_write.
No secret is ever printed or passed on argv.

  SUPABASE_TOKEN_FILE=<json with card.SUPABASE_ACCESS_TOKEN / card.TELEGRAM_BOT_TOKEN> \
  LAQEETO_CREDS=<json with telegram.webhook_secret / telegram.admin_claim_code> \
  python3 supabase/setup_edge.py [--skip-face] [--skip-bot]
"""
import json, os, subprocess, sys, urllib.request, urllib.error
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
import functions_api as fa

HERE = Path(__file__).parent
tokfile = os.environ['SUPABASE_TOKEN_FILE']; creds = json.load(open(os.environ['LAQEETO_CREDS']))
args = sys.argv[1:]

def set_secrets(pairs):
    c, j = fa.req('POST', '/secrets', [{'name': n, 'value': v} for n, v in pairs])
    print('secrets', [n for n, _ in pairs], c, '' if c < 300 else j); return c < 300

ok = True
if '--skip-face' not in args:
    ok &= fa.deploy(HERE / 'functions/face-match', 'face-match', verify_jwt=True)
if '--skip-bot' not in args:
    bot_token = json.load(open(tokfile))['card']['TELEGRAM_BOT_TOKEN']
    tg = creds['telegram']
    ok &= set_secrets([('TELEGRAM_BOT_TOKEN', bot_token), ('TELEGRAM_WEBHOOK_SECRET', tg['webhook_secret']),
                       ('TELEGRAM_ADMIN_CLAIM_CODE', tg['admin_claim_code'])])
    ok &= fa.deploy(HERE / 'functions/telegram-bot', 'telegram-bot', verify_jwt=False)
    if ok:
        body = {'url': f'https://{fa.REF}.supabase.co/functions/v1/telegram-bot', 'secret_token': tg['webhook_secret'],
                'allowed_updates': ['message', 'callback_query'], 'max_connections': 10}
        r = urllib.request.Request(f'https://api.telegram.org/bot{bot_token}/setWebhook', data=json.dumps(body).encode(),
                                   headers={'content-type': 'application/json'})
        try:
            with urllib.request.urlopen(r, timeout=30) as x: j = json.load(x)
        except urllib.error.HTTPError as e: j = json.loads(e.read())
        print('setWebhook', j.get('ok'), j.get('description')); ok &= bool(j.get('ok'))
sys.exit(0 if ok else 1)
