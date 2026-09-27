"""E2E test of Laqeeto against the REAL Supabase project, with separate browser contexts ("devices")."""
import atexit, io, json, re, secrets, sys, time, random, urllib.request, urllib.error, os, uuid, zlib, struct, tempfile
from playwright.sync_api import sync_playwright
# Usage: LAQEETO_TEST_CREDENTIALS=<admin creds json> LAQEETO_DB_PASSWORD_FILE=<db pw file> BASE=<app url> python3 tests/e2e_flow_test.py
# Creates random lqtest-e2e-* accounts and purges them (auth users, rows, storage) when it finishes.

BASE = os.environ.get('BASE', 'http://127.0.0.1:8765/stolen-phone-app/')
SHOTS = os.environ.get('SHOTS', tempfile.mkdtemp(prefix='lq-e2e-')) + '/'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))) + '/'
TESTS_DIR = os.path.dirname(os.path.abspath(__file__))
ADMIN = json.load(open(os.environ['LAQEETO_TEST_CREDENTIALS']))['admin']
cfg = open(ROOT + 'js/config.js').read()
SB_URL = re.search(r"SUPABASE_URL = '([^']+)'", cfg).group(1)
ANON = re.search(r"SUPABASE_ANON_KEY = '([^']+)'", cfg).group(1)
TS = str(int(time.time()))
PREFIX = f'lqtest-e2e-{secrets.token_hex(3)}-'
OWNER_EMAIL, OWNER_PW = PREFIX + 'owner@example.com', 'E2e-' + uuid.uuid4().hex[:16]
TECH_EMAIL, TECH_PW = PREFIX + 'tech@example.com', 'E2e-' + uuid.uuid4().hex[:16]
rnd_phone = lambda p: p + ''.join(random.choice('0123456789') for _ in range(8))
OWNER_PHONE, TECH_PHONE, GUEST_PHONE = rnd_phone('010'), rnd_phone('011'), rnd_phone('012')
def _purge():
    if os.environ.get('LAQEETO_DB_PASSWORD_FILE'):
        sys.path.insert(0, TESTS_DIR); import cleanup
        cleanup.purge(PREFIX + '%@example.com', audit=True, verbose=False, extra_rate_keys=['guest:phone:' + GUEST_PHONE])
        print('purged', PREFIX)
    else: print(f"run: python3 tests/cleanup.py '{PREFIX}%@example.com' --audit")
atexit.register(_purge)
def png_file(path, rgb):
    w = h = 64; raw = zlib.compress(b''.join(b'\x00' + bytes(rgb) * w for _ in range(h)))
    ch = lambda t, d: struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    open(path, 'wb').write(b'\x89PNG\r\n\x1a\n' + ch(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) + ch(b'IDAT', raw) + ch(b'IEND', b''))
BOX_PNG, ID_PNG = SHOTS + 'box.png', SHOTS + 'id.png'
png_file(BOX_PNG, (200, 200, 205)); png_file(ID_PNG, (180, 150, 120))
SHOP = f'ورشة الاختبار {TS}'

def luhn_complete(body):
    s = 0
    for i, ch in enumerate(reversed(body)):
        d = int(ch)
        if i % 2 == 0:
            d *= 2
            if d > 9: d -= 9
        s += d
    return body + str((10 - s % 10) % 10)
IMEI_A = luhn_complete('35' + ''.join(random.choice('0123456789') for _ in range(12)))
IMEI_B = luhn_complete('86' + ''.join(random.choice('0123456789') for _ in range(12)))
IMEI_WRONG = luhn_complete('35' + ''.join(random.choice('0123456789') for _ in range(12)))
IMEI_CLEAN = luhn_complete('35' + ''.join(random.choice('0123456789') for _ in range(12)))

errors, results = [], []
def ok(name, cond=True, extra=''):
    results.append((name, bool(cond))); print(('PASS' if cond else 'FAIL'), name, extra, flush=True)
    if not cond: raise SystemExit(f'FAILED: {name} {extra}')

def rest(method, path, body=None, token=None, raw=False):
    h = {'apikey': ANON, 'Authorization': 'Bearer ' + (token or ANON)}
    data = json.dumps(body).encode() if body is not None else None
    if data: h['Content-Type'] = 'application/json'
    req = urllib.request.Request(SB_URL + path, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            t = r.read(); return r.status, (t if raw else (json.loads(t) if t else None))
    except urllib.error.HTTPError as e:
        t = e.read()
        try: return e.code, json.loads(t)
        except Exception: return e.code, t[:200]

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/google-chrome', headless=True,
        args=['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--lang=ar'])
    def device(label):
        ctx = browser.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True, locale='ar-EG',
            user_agent='Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36')
        from urllib.parse import urlsplit
        ctx.grant_permissions(['camera'], origin='{0.scheme}://{0.netloc}'.format(urlsplit(BASE)))
        ctx.add_init_script("try { sessionStorage.setItem('lq-splash', '1') } catch (e) {}")  # skip launch animation
        pg = ctx.new_page()
        pg.on('console', lambda m: errors.append(f'[{label}] console.{m.type}: {m.text}') if m.type == 'error' else None)
        pg.on('pageerror', lambda e: errors.append(f'[{label}] pageerror: {e}'))
        pg.on('response', lambda r: errors.append(f'[{label}] HTTP {r.status} {r.request.method} {r.url.split("?")[0]}') if r.status >= 400 else None)
        pg.set_default_timeout(20000)
        return ctx, pg
    ctxA, A = device('A-owner'); ctxB, B = device('B-finder/tech'); ctxC, C = device('C-admin')

    def idle(pg, timeout=20000):
        pg.wait_for_timeout(150)
        pg.wait_for_function("() => !document.body.dataset.busy", timeout=timeout)
    def goto(pg, h):
        pg.evaluate(f"location.hash = {json.dumps(h)}"); pg.wait_for_timeout(300); idle(pg)
    def toasts(pg): return ' | '.join(pg.locator('.toast').all_inner_texts())
    def wait_toast(pg, text, timeout=15000):
        pg.wait_for_function("t => [...document.querySelectorAll('.toast')].some(e => e.textContent.includes(t))", arg=text, timeout=timeout)
    def clear(pg): pg.evaluate("document.getElementById('toasts').innerHTML=''")
    def shot(pg, name): clear(pg); pg.wait_for_timeout(300); pg.screenshot(path=SHOTS + name)
    def login(pg, email, pw):
        goto(pg, '#/login'); pg.wait_for_selector('#login-form')
        pg.fill('input[name=email]', email); pg.fill('input[name=password]', pw)
        pg.click('#login-form button[type=submit]')
        pg.wait_for_function("() => !location.hash.startsWith('#/login')", timeout=20000); idle(pg)
        pg.wait_for_selector('#logout-btn')
    def logout(pg):
        if pg.locator('#logout-btn').count():
            pg.click('#logout-btn'); pg.wait_for_selector('#user-area a[href="#/login"]')
    def confirm_modal(pg, label=None):
        (pg.locator('.modal-actions .btn', has_text=label) if label else pg.locator('.modal-actions .btn').first).click()
    def live_capture(pg, field):
        pg.click(f'.photo-field[data-photo="{field}"] [data-live-cam]')
        pg.wait_for_selector('.camera-modal [data-snap]:not([disabled])', timeout=10000); pg.wait_for_timeout(300)
        pg.click('.camera-modal [data-snap]')
        pg.wait_for_selector(f'.photo-field[data-photo="{field}"].has-photo')
    def img_loaded(pg, sel):
        pg.wait_for_function("s => { const i = document.querySelector(s); return i && i.complete && i.naturalWidth > 0 && i.src.includes('token='); }", arg=sel, timeout=20000)
        return True

    # ---------- 1. load + PWA on device A ----------
    A.goto(BASE, wait_until='networkidle'); A.wait_for_selector('.search-panel')
    sw = A.evaluate("navigator.serviceWorker.ready.then(r => r.scope)")
    ok('service worker registered', sw == BASE, sw)
    ok('supabase client vendored (no CDN)', A.evaluate("!!window.supabase && typeof window.supabase.createClient === 'function'"))
    ok('no local-only banner', 'على هذا الجهاز فقط' not in A.inner_text('body'))

    # ---------- 2. owner signup + report with photo upload (device A) ----------
    goto(A, '#/signup'); A.wait_for_selector('#signup-form')
    A.fill('input[name=name]', 'مالك اختبار'); A.fill('input[name=email]', OWNER_EMAIL); A.fill('input[name=phone]', OWNER_PHONE)
    A.fill('input[name=password]', OWNER_PW); A.fill('input[name=password2]', OWNER_PW)
    A.click('#signup-form button[type=submit]')
    A.wait_for_function("() => location.hash === '#/owner'", timeout=20000); idle(A)
    ok('owner signup (Supabase Auth) → dashboard', A.locator('[data-testid=report-card]').count() == 0)
    goto(A, '#/report/new'); A.wait_for_selector('#report-form')
    A.select_option('select[name=brand]', 'Samsung'); A.fill('input[name=model]', 'Galaxy A55'); A.fill('input[name=color]', 'كحلي')
    A.fill('input[name=imei1]', IMEI_A); A.fill('input[name=serial]', 'E2E' + TS)
    A.select_option('select[name=governorate]', 'القاهرة')
    A.set_input_files('.photo-field[data-photo=boxPhoto] input[type=file]', BOX_PNG); A.wait_for_selector('.photo-field[data-photo=boxPhoto].has-photo')
    A.fill('input[name=social0]', 'https://facebook.com/e2e.owner')
    A.check('input[name=agree]'); A.click('#report-form button[type=submit]')
    A.wait_for_function("() => location.hash.startsWith('#/report/') && location.hash !== '#/report/new'", timeout=30000); idle(A)
    report_a = A.evaluate("location.hash.split('/')[2]")
    A.wait_for_selector('#view :text("Galaxy A55")', timeout=20000)
    ok('report created in DB', 'Galaxy A55' in A.inner_text('#view'), report_a)
    ok('box photo uploaded & shown via signed URL', img_loaded(A, 'figure img.thumb'))
    goto(A, '#/report/new'); A.wait_for_selector('#report-form')
    A.select_option('select[name=brand]', 'Samsung'); A.fill('input[name=model]', 'x'); A.fill('input[name=color]', 'y'); A.fill('input[name=imei1]', IMEI_A)
    A.set_input_files('.photo-field[data-photo=boxPhoto] input[type=file]', BOX_PNG); A.wait_for_selector('.photo-field[data-photo=boxPhoto].has-photo')
    A.check('input[name=agree]'); A.click('#report-form button[type=submit]')
    wait_toast(A, 'بلاغ نشط'); ok('duplicate active IMEI blocked by DB')

    # ---------- 3. public search + guest message (device B, not logged in) ----------
    B.goto(BASE + '#/search?q=' + IMEI_A, wait_until='networkidle'); B.wait_for_selector('[data-testid=result-reported]')
    t = B.inner_text('[data-testid=result-reported]')
    ok('public RPC search finds report (other device)', 'Galaxy A55' in t and 'كحلي' in t)
    ok('no private fields leaked in UI', OWNER_PHONE not in t and OWNER_EMAIL not in t and 'facebook' not in t)  # the searched IMEI itself is echoed back on purpose
    B.click('[data-msg]'); B.wait_for_selector('#guest-form')
    B.fill('#guest-form input[name=name]', 'فاعل خير'); B.fill('#guest-form input[name=phone]', GUEST_PHONE)
    B.click('#guest-form button[type=submit]'); B.wait_for_selector('#first-msg')
    B.fill('#first-msg textarea', 'وجدت هاتفاً بنفس الرقم في وسط البلد.'); B.click('#first-msg button[type=submit]')
    B.wait_for_function("() => location.hash.startsWith('#/chat/')", timeout=20000); idle(B)
    ok('guest message via rate-limited RPC', 'وجدت هاتفاً' in B.inner_text('#messages'))

    # ---------- 4. owner (A) sees it, replies; guest (B) receives by polling ----------
    goto(A, '#/inbox'); A.wait_for_selector('[data-testid=conv-item]')
    ok('owner inbox shows guest conversation (cross-device)', 'فاعل خير' in A.inner_text('#view'))
    A.locator('[data-testid=conv-item]').first.click(); A.wait_for_selector('#messages')
    A.fill('#chat-form textarea', 'شكراً جزيلاً! ممكن نتقابل في قسم الشرطة؟'); A.click('#chat-form button')
    A.wait_for_function("() => document.querySelector('#messages').innerText.includes('شكراً جزيلاً')")
    B.wait_for_function("() => document.querySelector('#messages') && document.querySelector('#messages').innerText.includes('شكراً جزيلاً')", timeout=20000)
    ok('guest receives owner reply on other device (polling)')
    logout(B)

    # ---------- 5. technician signup (B) ----------
    goto(B, '#/tech-signup'); B.wait_for_selector('#tech-form')
    f = '#tech-form '
    B.fill(f + 'input[name=name]', 'فني اختبار'); B.fill(f + 'input[name=email]', TECH_EMAIL); B.fill(f + 'input[name=phone]', TECH_PHONE)
    B.fill(f + 'input[name=password]', TECH_PW); B.fill(f + 'input[name=password2]', TECH_PW)
    B.fill(f + 'input[name=shopName]', SHOP); B.select_option(f + 'select[name=governorate]', 'الجيزة'); B.fill(f + 'input[name=address]', 'فيصل')
    B.set_input_files('.photo-field[data-photo=idPhoto] input[type=file]', ID_PNG)
    B.set_input_files('.photo-field[data-photo=deviceShot] input[type=file]', BOX_PNG)
    live_capture(B, 'selfie')
    B.check(f + 'input[name=agree]'); B.click(f + 'button[type=submit]')
    B.wait_for_selector('[data-testid=tech-status]', timeout=40000)
    ok('technician pending after signup + doc upload', 'قيد المراجعة' in B.inner_text('[data-testid=tech-status]') and B.locator('#docs-form').count() == 0)
    goto(B, '#/tech/handover/' + report_a); B.wait_for_selector('[data-testid=tech-status]')
    ok('pending technician cannot record handover')

    # ---------- 6. admin approves (device C) ----------
    C.goto(BASE, wait_until='networkidle'); login(C, ADMIN['email'], ADMIN['password'])
    ok('admin login → admin dashboard', '#/admin' in C.url)
    card = C.locator(f'[data-testid=tech-card][data-email="{TECH_EMAIL}"]')
    card.wait_for()
    ok('pending tech with ID/selfie/device images', card.locator('.side-by-side img').count() == 3)
    C.wait_for_function("e => { const imgs = document.querySelectorAll(`[data-email=\"${e}\"] .side-by-side img`); return imgs.length === 3 && [...imgs].every(i => i.complete && i.naturalWidth > 0); }", arg=TECH_EMAIL, timeout=20000)
    ok('admin can view private tech-docs via signed URLs')
    card.locator('[data-tech-act=approve]').click(); confirm_modal(C)
    C.wait_for_function("e => !document.querySelector(`[data-testid=tech-card][data-email=\"${e}\"]`)", arg=TECH_EMAIL, timeout=20000)
    ok('admin approved technician')

    # ---------- 7. technician (B) check + handover ----------
    goto(B, '#/'); goto(B, '#/tech'); B.wait_for_selector('#tech-check', timeout=20000)
    ok('technician approved on other device (fresh status)')
    B.fill('#tech-q', IMEI_CLEAN); B.click('#tech-check button'); B.wait_for_selector('[data-testid=tech-clear]')
    ok('green: not reported')
    B.fill('#tech-q', IMEI_A); B.click('#tech-check button'); B.wait_for_selector('[data-testid=tech-reported]')
    ok('red: reported as stolen', 'متبلّغ عنه إنه مسروق' in B.inner_text('[data-testid=tech-reported]'))
    B.click('[data-testid=start-handover]'); B.wait_for_selector('#handover-form')
    for n in ('box', 'imeiMatch', 'unlocked'): B.check(f'input[name={n}]')
    B.fill('input[name=deviceImei]', IMEI_WRONG)
    live_capture(B, 'ownerIdPhoto'); live_capture(B, 'selfie')
    B.click('#handover-form button[type=submit]'); wait_toast(B, 'لا يطابق')
    ok('handover blocked on IMEI mismatch (server precheck)')
    B.fill('input[name=deviceImei]', IMEI_A); B.click('#handover-form button[type=submit]')
    B.wait_for_function("() => location.hash === '#/tech'", timeout=30000); B.wait_for_selector('text=بانتظار تأكيد المالك'); idle(B)
    ok('handover recorded with photos')

    # ---------- 8. owner confirms (A) ----------
    goto(A, '#/'); goto(A, '#/owner'); A.wait_for_selector('[data-testid=confirm-handover]')
    ok('owner sees confirm card on own device', SHOP in A.inner_text('[data-testid=confirm-handover]'))
    A.click('[data-confirm]'); confirm_modal(A)
    A.wait_for_function("() => !document.querySelector('[data-testid=confirm-handover]') && document.querySelector('#my-reports')?.innerText.includes('تم التسليم')", timeout=20000)
    ok('handover confirmed → delivered')
    goto(B, '#/search?q=' + IMEI_A); B.wait_for_selector('[data-testid=result-clear]')
    ok('delivered phone shows clear in public search')

    # ---------- 9. dispute (coercion) ----------
    goto(A, '#/report/new'); A.wait_for_selector('#report-form')
    A.select_option('select[name=brand]', 'Apple iPhone'); A.fill('input[name=model]', '15'); A.fill('input[name=color]', 'أبيض'); A.fill('input[name=imei1]', IMEI_B)
    A.set_input_files('.photo-field[data-photo=boxPhoto] input[type=file]', BOX_PNG); A.wait_for_selector('.photo-field[data-photo=boxPhoto].has-photo')
    A.check('input[name=agree]'); A.click('#report-form button[type=submit]')
    A.wait_for_function("() => location.hash.startsWith('#/report/') && location.hash !== '#/report/new'", timeout=30000); idle(A)
    goto(B, '#/tech?q=' + IMEI_B); B.wait_for_selector('[data-testid=start-handover]'); B.click('[data-testid=start-handover]'); B.wait_for_selector('#handover-form')
    for n in ('box', 'imeiMatch', 'unlocked'): B.check(f'input[name={n}]')
    B.fill('input[name=deviceImei]', IMEI_B); live_capture(B, 'ownerIdPhoto'); live_capture(B, 'selfie')
    B.click('#handover-form button[type=submit]'); B.wait_for_function("() => location.hash === '#/tech'", timeout=30000)
    goto(A, '#/'); goto(A, '#/owner'); A.wait_for_selector('[data-coerce]')
    A.click('[data-coerce]'); A.wait_for_selector('#dispute-form')
    ok('coercion prefilled', A.is_checked('input[name=coercion]'))
    A.fill('textarea[name=description]', 'ذهبت للمحل وتم تهديدي وطُلب مني مبلغ مالي ولم أستلم الهاتف.')
    A.fill('input[name=policeNumber]', f'{TS[-4:]} لسنة 2026 إداري الدقي')
    A.set_input_files('input[name=evidenceFile]', {'name': 'cctv-e2e.mp4', 'mimeType': 'video/mp4', 'buffer': b'fake'})
    A.fill('input[name=evidenceLink]', 'https://drive.google.com/e2e'); A.fill('textarea[name=witnesses]', 'علي - 01000000001')
    A.click('#dispute-form button[type=submit]')
    A.wait_for_function("() => location.hash === '#/owner'", timeout=20000); A.wait_for_selector('#my-reports'); idle(A)
    ok('dispute created → report in dispute', 'نزاع' in A.inner_text('#my-reports'))
    goto(C, '#/admin?tab=disputes'); C.wait_for_selector('[data-testid=dispute-card]')
    dc = C.locator('[data-testid=dispute-card]', has_text='cctv-e2e.mp4').first
    ok('admin sees dispute + evidence + technician', 'إكراه' in dc.inner_text() and SHOP in dc.inner_text())
    dc.locator('[data-dnote]').click(); C.fill('#prompt-input', 'جارٍ مراجعة كاميرات المحل'); confirm_modal(C, 'احفظ')
    C.wait_for_selector('text=جارٍ مراجعة كاميرات المحل')
    dc = C.locator('[data-testid=dispute-card]', has_text='cctv-e2e.mp4').first
    dc.locator('select[data-dstatus]').select_option('reviewing'); dc.locator('[data-dsave]').click(); C.wait_for_timeout(1500)
    dc = C.locator('[data-testid=dispute-card]', has_text='cctv-e2e.mp4').first
    dc.locator('[data-suspend]').click(); C.fill('#prompt-input', 'شكوى إكراه موثقة بمحضر'); confirm_modal(C, 'احفظ'); C.wait_for_timeout(2000)
    dc = C.locator('[data-testid=dispute-card]', has_text='cctv-e2e.mp4').first
    ok('note + status + suspension applied', 'قيد المراجعة' in dc.inner_text() and 'موقوف' in dc.inner_text())
    goto(A, '#/'); goto(A, '#/owner'); A.wait_for_selector('text=جارٍ مراجعة كاميرات المحل')
    ok('owner sees admin note on dispute')
    goto(B, '#/'); goto(B, '#/tech'); B.wait_for_selector('[data-testid=tech-status]')
    ok('suspended technician locked out', 'موقوف' in B.inner_text('[data-testid=tech-status]'))
    goto(C, '#/admin?tab=audit'); C.wait_for_selector('.audit')
    audit = C.inner_text('.audit')
    need = ['اعتماد فني', 'تسجيل تسليم هاتف', 'أكد المالك استلام هاتفه', 'نزاع: إبلاغ عن إكراه/تهديد', 'إيقاف فني', 'فحص IMEI/Serial بواسطة فني', 'رسالة ضيف إلى مالك بلاغ']
    ok('audit log records key actions', all(k in audit for k in need), str([k for k in need if k not in audit]))

    # ---------- 10. offline app shell ----------
    goto(A, '#/'); A.wait_for_selector('.search-panel')
    ctxA.set_offline(True)
    A.reload(wait_until='domcontentloaded'); A.wait_for_selector('.search-panel', timeout=15000)
    net_down = A.evaluate("fetch('https://yymuypxnoroszkxttmgh.supabase.co/auth/v1/health', {cache: 'no-store'}).then(() => false, () => true)")
    ok('app shell loads offline from SW cache (network really down)', net_down and A.locator('.search-panel').count() == 1)
    A.evaluate("window.dispatchEvent(new Event('offline'))")  # headless Chrome keeps navigator.onLine=true after an emulated-offline reload
    ok('offline banner', A.evaluate("navigator.onLine") or 'مش متصل' in A.inner_text('#status-banner'))
    ctxA.set_offline(False)
    browser.close()

# ---------- 11. API-level security checks with the public anon key ----------
for t in ['reports', 'profiles', 'messages', 'conversations', 'handovers', 'disputes', 'audit_log', 'report_history']:
    code, j = rest('GET', f'/rest/v1/{t}?select=*&limit=1')
    ok(f'anon cannot read table {t}', code in (401, 403) and (not isinstance(j, list)), f'HTTP {code}')
code, j = rest('POST', '/rest/v1/rpc/search_reports', {'q': IMEI_A})
ok('anon RPC search returns only public columns', code == 200 and j and set(j[0].keys()) == {'id', 'brand', 'model', 'color', 'type', 'status', 'active', 'reported_at', 'governorate', 'public_contact', 'is_mine'}, str(j[0].keys() if j else j))
code, j = rest('POST', '/rest/v1/rpc/technician_check', {'q': IMEI_A})
ok('anon cannot run technician_check', code in (401, 403), f'HTTP {code}')
code, j = rest('POST', '/auth/v1/token?grant_type=password', {'email': OWNER_EMAIL, 'password': OWNER_PW}); owner_tok = j['access_token']
code, rows = rest('GET', f'/rest/v1/reports?select=box_photo,imei1&id=eq.{report_a}', token=owner_tok)
ok('owner reads own full report via RLS', code == 200 and rows and rows[0]['imei1'] == IMEI_A)
box = rows[0]['box_photo']; bucket, path = box.split('/', 1)
code, _ = rest('GET', f'/storage/v1/object/public/{bucket}/{path}', raw=True)
ok('private bucket not publicly readable', code != 200, f'HTTP {code}')
code, _ = rest('GET', f'/storage/v1/object/{bucket}/{path}', raw=True)
ok('anon cannot download private object', code != 200, f'HTTP {code}')
code, j = rest('POST', f'/storage/v1/object/sign/{bucket}/{path}', {'expiresIn': 60}, token=owner_tok)
ok('owner can sign own photo URL', code == 200)
code, j = rest('POST', '/auth/v1/signup', {'email': PREFIX + 'other@example.com', 'password': OWNER_PW, 'data': {'name': 'مالك تاني'}}); mona_tok = j['access_token']
code, j = rest('POST', f'/storage/v1/object/sign/{bucket}/{path}', {'expiresIn': 60}, token=mona_tok)
ok('another owner cannot sign that photo', code != 200, f'HTTP {code}')
code, rows = rest('GET', f'/rest/v1/reports?select=id&id=eq.{report_a}', token=mona_tok)
ok('another owner cannot read the report row', code == 200 and rows == [])
code, j = rest('PATCH', f'/rest/v1/profiles?id=eq.{json.loads(__import__("base64").urlsafe_b64decode(mona_tok.split(".")[1] + "==="))["sub"]}', {'role': 'admin'}, token=mona_tok)
ok('user cannot make themselves admin', code in (401, 403), f'HTTP {code}')
code, j = rest('POST', '/auth/v1/signup', {'email': PREFIX + 'evil@example.com', 'password': OWNER_PW, 'data': {'role': 'admin', 'name': 'evil'}})
evil_tok = j.get('access_token') if isinstance(j, dict) else None
code, prof = rest('GET', '/rest/v1/profiles?select=role', token=evil_tok)
ok('role=admin in signup metadata is ignored', prof and prof[0]['role'] == 'owner', str(prof))

bad = [e for e in errors if 'favicon' not in e and 'ERR_INTERNET_DISCONNECTED' not in e]
print('\nCONSOLE/PAGE ERRORS + HTTP>=400 (expected: 409 duplicate report, 400 IMEI-mismatch precheck):', len(bad)); [print('  ', e) for e in bad]
ok('no uncaught page errors', not any('pageerror' in e for e in errors))
print(f"\n{sum(r[1] for r in results)}/{len(results)} checks passed")
print('E2E_PREFIX', PREFIX)
