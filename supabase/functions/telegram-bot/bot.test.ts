// deno test -A supabase/functions/telegram-bot/bot.test.ts
import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import { makeHandler, safeEqual, normDigits, looksLikeImei } from './bot.ts';

const SECRET = 'wh-secret-123', CODE = 'claim-XYZ-789', TOKEN = '000:TESTTOKEN';
const ADMIN = 111, CUST = 222, CUST2 = 333;
const STOLEN = '490154203237518', CLEAN = '356938035643809';

function world(opts: { adminChatId?: number } = {}) {
  const calls: { method: string; body: any }[] = [];
  const db = {
    admin: null as number | null, states: new Map<number, string>(), seen: new Set<number>(),
    threads: new Map<number, number>(), rate: new Map<string, number>(), msgId: 1000,
    checkLimited: false, rpcs: [] as string[], tgFail: new Set<string>(),
  };
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
  const fetchMock = async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url); const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (u.startsWith('https://api.telegram.org/')) {
      assert(u.startsWith(`https://api.telegram.org/bot${TOKEN}/`));
      const method = u.split('/').pop()!; calls.push({ method, body });
      if (db.tgFail.has(method) || db.tgFail.has(`${method}:${body.chat_id}`)) return json({ ok: false, error_code: 403, description: 'Forbidden: bot was blocked by the user' });
      return json({ ok: true, result: { message_id: ++db.msgId } });
    }
    assert(u.startsWith('https://sb.test/rest/v1/rpc/'), u);
    assertEquals((init!.headers as any).authorization, 'Bearer svc');
    const fn = u.split('/').pop()!; db.rpcs.push(fn);
    switch (fn) {
      case 'bot_begin': {
        const dup = db.seen.has(body.p_update_id); db.seen.add(body.p_update_id);
        return json({ dup, state: db.states.get(body.p_chat) ?? '', admin_chat: db.admin });
      }
      case 'bot_set_state': db.states.set(body.p_chat, body.p_state); return json(null);
      case 'bot_rate': {
        const k = body.p_kind + ':' + body.p_chat; const n = (db.rate.get(k) ?? 0) + 1; db.rate.set(k, n);
        return json(n <= body.p_max);
      }
      case 'bot_check_imei': {
        if (db.checkLimited) return json({ code: 'P0001', message: 'limit', hint: 'rate_limited' }, 400);
        const q = body.p_q;
        if (!/^\d{15}$/.test(q)) return json({ valid: false, luhn: false, results: [] });
        const luhn = q !== '490154203237519';
        const results = q === STOLEN ? [{ brand: 'Samsung', model: 'A54', type: 'theft', status: 'open', active: true, reported_at: '2026-09-01T10:00:00Z' }]
          : q === CLEAN ? [{ brand: 'Apple', model: 'iPhone 12', type: 'lost', status: 'delivered', active: false, reported_at: '2026-01-01T10:00:00Z' }] : [];
        return json({ valid: true, luhn, results });
      }
      case 'bot_claim_admin': if (db.admin && db.admin !== body.p_chat) return json(false); db.admin = body.p_chat; return json(true);
      case 'bot_release_admin': { const ok = db.admin === body.p_chat; if (ok) db.admin = null; return json(ok); }
      case 'bot_link_thread': db.threads.set(body.p_admin_msg, body.p_customer); return json(null);
      case 'bot_lookup_thread': { const c = db.threads.get(body.p_admin_msg); return json(c ? { chat: c, name: 'x' } : null); }
    }
    return json({ message: 'unknown rpc' }, 404);
  };
  const handle = makeHandler({ botToken: TOKEN, webhookSecret: SECRET, claimCode: CODE, adminChatId: opts.adminChatId ?? null,
    supabaseUrl: 'https://sb.test', serviceKey: 'svc', fetch: fetchMock as typeof fetch, log: () => {} });
  let uid = 1;
  const post = (update: any, secret = SECRET) => handle(new Request('https://fn.test/', {
    method: 'POST', headers: { 'x-telegram-bot-api-secret-token': secret, 'content-type': 'application/json' },
    body: JSON.stringify({ update_id: uid++, ...update }) }));
  const msg = (chat: number, text: string, extra: any = {}) => post({ message: { message_id: uid * 10, chat: { id: chat, type: 'private', first_name: 'Ahmed' }, from: { id: chat, first_name: 'Ahmed', username: 'ahmed' }, text, ...extra } });
  const cb = (chat: number, data: string) => post({ callback_query: { id: 'cq' + uid, data, from: { id: chat }, message: { message_id: 5, chat: { id: chat, type: 'private' } } } });
  const last = (method?: string) => [...calls].reverse().find((c) => !method || c.method === method)!;
  const sentTo = (chat: number) => calls.filter((c) => c.body.chat_id === chat);
  return { calls, db, post, msg, cb, last, sentTo, reset: () => { calls.length = 0; } };
}

Deno.test('helpers: safeEqual, digit normalisation, IMEI detection', () => {
  assert(safeEqual('abc', 'abc')); assert(!safeEqual('abc', 'abd')); assert(!safeEqual('abc', 'abcd')); assert(!safeEqual('', ''));
  assertEquals(normDigits('٤٩٠١ ٥٤٢٠-٣٢٣٧٥١٨'), '490154203237518');
  assert(looksLikeImei('35 693803 564380 9')); assert(!looksLikeImei('hello')); assert(!looksLikeImei('12345'));
});

Deno.test('rejects requests without the webhook secret and never calls Telegram', async () => {
  const w = world();
  const r = await w.post({ message: { message_id: 1, chat: { id: CUST, type: 'private' }, text: '/start' } }, 'wrong');
  assertEquals(r.status, 401); assertEquals(w.calls.length, 0); assertEquals(w.db.rpcs.length, 0);
  const r2 = await w.post({ message: { message_id: 1, chat: { id: CUST, type: 'private' }, text: '/start' } }, '');
  assertEquals(r2.status, 401);
});

Deno.test('/start shows the inline menu with web app and releases links', async () => {
  const w = world();
  const r = await w.msg(CUST, '/start'); assertEquals(r.status, 200);
  const m = w.last('sendMessage');
  assertEquals(m.body.chat_id, CUST); assertStringIncludes(m.body.text, 'لقيته');
  const kb = m.body.reply_markup.inline_keyboard.flat();
  for (const d of ['report', 'check', 'tech', 'faq', 'support']) assert(kb.some((b: any) => b.callback_data === d), d);
  assert(kb.some((b: any) => b.url === 'https://yhany2884-afk.github.io/laqeeto/'));
  assert(kb.some((b: any) => b.url === 'https://github.com/yhany2884-afk/laqeeto/releases/latest'));
});

Deno.test('duplicate update ids are ignored', async () => {
  const w = world();
  w.db.seen.add(5000);
  await w.post({ update_id: 5000, message: { message_id: 1, chat: { id: CUST, type: 'private' }, text: '/start' } });
  assertEquals(w.calls.length, 0);
  await w.post({ update_id: 5001, message: { message_id: 2, chat: { id: CUST, type: 'private' }, text: '/start' } });
  assert(w.calls.length > 0);
});

Deno.test('menu callbacks edit the message; FAQ/report/tech content', async () => {
  const w = world();
  for (const [d, needle] of [['report', 'IMEI'], ['faq', 'مجاني'], ['tech', 'سيلفي']]) {
    await w.cb(CUST, d);
    const e = w.last('editMessageText'); assertEquals(e.body.chat_id, CUST); assertStringIncludes(e.body.text, needle);
    assert(w.calls.some((c) => c.method === 'answerCallbackQuery'));
  }
});

Deno.test('IMEI check: stolen phone shows public status only, no owner data', async () => {
  const w = world();
  await w.cb(CUST, 'check'); assertEquals(w.db.states.get(CUST), 'await_imei');
  await w.msg(CUST, STOLEN);
  const m = w.last('sendMessage');
  assertStringIncludes(m.body.text, 'مسروق'); assertStringIncludes(m.body.text, 'Samsung A54');
  assert(!/phone|owner|email|@|(?<!\d)01\d{9}(?!\d)/i.test(m.body.text));
  assertEquals(w.db.states.get(CUST), '');
  assert(JSON.stringify(m.body.reply_markup).includes(`#/search?q=${STOLEN}`));
});

Deno.test('IMEI check: bare number, Arabic digits, clean/old/invalid/luhn/rate-limit', async () => {
  const w = world();
  await w.msg(CUST, CLEAN); let t = w.last('sendMessage').body.text;
  assertStringIncludes(t, 'مفيش بلاغ نشط'); assertStringIncludes(t, 'بلاغ قديم');
  await w.msg(CUST, '٣٥٦٩٣٨٠٣٥٦٤٣٨٠٩'); assertStringIncludes(w.last('sendMessage').body.text, 'مفيش بلاغ نشط');
  await w.msg(CUST, '/check 1234567890123456'); assertStringIncludes(w.last('sendMessage').body.text, '15 رقم');
  await w.msg(CUST, '/check 490154203237519'); assertStringIncludes(w.last('sendMessage').body.text, 'غلطة');
  w.db.checkLimited = true;
  await w.msg(CUST, STOLEN); assertStringIncludes(w.last('sendMessage').body.text, 'استنى');
});

Deno.test('support without an admin tells the customer it is unavailable', async () => {
  const w = world();
  await w.cb(CUST, 'support');
  assertStringIncludes(w.last('sendMessage').body.text, 'مش متاح');
  assertEquals(w.db.states.get(CUST) ?? '', '');
});

Deno.test('admin claim: wrong code rejected, right code claims once, brute force limited', async () => {
  const w = world();
  await w.msg(ADMIN, '/claim nope'); assertStringIncludes(w.last('sendMessage').body.text, 'مش صح'); assertEquals(w.db.admin, null);
  await w.msg(ADMIN, `/claim ${CODE}`); assertEquals(w.db.admin, ADMIN);
  assert(w.calls.some((c) => c.method === 'deleteMessage' && c.body.chat_id === ADMIN));
  assertStringIncludes(w.last('sendMessage').body.text, 'حساب الدعم');
  await w.msg(CUST2, `/claim ${CODE}`); assertEquals(w.db.admin, ADMIN); assertStringIncludes(w.last('sendMessage').body.text, 'بالفعل');
  for (let i = 0; i < 6; i++) await w.msg(CUST, '/claim guess' + i);
  assertStringIncludes(w.last('sendMessage').body.text, 'محاولات كتير');
});

Deno.test('support round trip: forward to admin, admin reply relayed back', async () => {
  const w = world(); w.db.admin = ADMIN;
  await w.msg(CUST, '/support'); assertEquals(w.db.states.get(CUST), 'support');
  w.reset();
  await w.msg(CUST, 'موبايلي اتسرق ومش عارف أبلّغ');
  const head = w.calls.find((c) => c.method === 'sendMessage' && c.body.chat_id === ADMIN)!;
  assertStringIncludes(head.body.text, 'Ahmed'); assertStringIncludes(head.body.text, '@ahmed');
  const fwd = w.calls.find((c) => c.method === 'forwardMessage')!;
  assertEquals(fwd.body.chat_id, ADMIN); assertEquals(fwd.body.from_chat_id, CUST);
  assertStringIncludes(w.last('sendMessage').body.text, 'وصلت'); assertEquals(w.db.states.get(CUST), 'support2');
  assertEquals(w.db.threads.size, 2);
  // second message → reaction, no repeated text ack
  w.reset(); await w.msg(CUST, 'وكمان صورة'); assert(w.calls.some((c) => c.method === 'setMessageReaction'));
  assert(!w.sentTo(CUST).some((c) => c.method === 'sendMessage'));
  // admin replies to the forwarded message
  const fwdId = [...w.db.threads.keys()].pop()!;
  w.reset();
  await w.msg(ADMIN, 'ابعتلنا رقم الـ IMEI', { reply_to_message: { message_id: fwdId, chat: { id: ADMIN, type: 'private' } } });
  const toCust = w.calls.find((c) => c.method === 'sendMessage' && c.body.chat_id === CUST)!;
  assertStringIncludes(toCust.body.text, 'فريق لقيته'); assertStringIncludes(toCust.body.text, 'ابعتلنا رقم');
  assertStringIncludes(w.last('sendMessage').body.text, 'وصل للعميل');
  // photo reply → copyMessage
  w.reset();
  await w.msg(ADMIN, '', { text: undefined, photo: [{}], reply_to_message: { message_id: fwdId, chat: { id: ADMIN, type: 'private' } } });
  const cp = w.calls.find((c) => c.method === 'copyMessage')!; assertEquals(cp.body.chat_id, CUST); assertEquals(cp.body.from_chat_id, ADMIN);
});

Deno.test('admin: non-reply gets a hint, unknown thread and blocked customer reported, /release', async () => {
  const w = world(); w.db.admin = ADMIN;
  await w.msg(ADMIN, 'hello'); assertStringIncludes(w.last('sendMessage').body.text, 'Reply');
  await w.msg(ADMIN, 'x', { reply_to_message: { message_id: 42, chat: { id: ADMIN, type: 'private' } } });
  assertStringIncludes(w.last('sendMessage').body.text, 'مش لاقي');
  w.db.threads.set(77, CUST); w.db.tgFail.add(`sendMessage:${CUST}`);
  await w.msg(ADMIN, 'رد', { reply_to_message: { message_id: 77, chat: { id: ADMIN, type: 'private' } } });
  assertStringIncludes(w.last('sendMessage').body.text, 'قفل البوت');
  await w.msg(ADMIN, STOLEN); assertStringIncludes(w.last('sendMessage').body.text, 'مسروق');
  await w.msg(ADMIN, '/release'); assertEquals(w.db.admin, null); assertStringIncludes(w.last('sendMessage').body.text, 'اتفك');
});

Deno.test('support rate limit and HTML escaping of customer names', async () => {
  const w = world(); w.db.admin = ADMIN; w.db.states.set(CUST, 'support2');
  await w.post({ message: { message_id: 9, chat: { id: CUST, type: 'private' }, from: { id: CUST, first_name: '<b>x</b>&' }, text: 'hi' } });
  const head = w.calls.find((c) => c.method === 'sendMessage' && c.body.chat_id === ADMIN)!;
  assertStringIncludes(head.body.text, '&lt;b&gt;x&lt;/b&gt;&amp;');
  for (let i = 0; i < 20; i++) await w.msg(CUST, 'spam ' + i);
  assertStringIncludes(w.last('sendMessage').body.text, 'رسايل كتير');
});

Deno.test('fixed admin chat secret takes precedence; /claim disabled; groups ignored', async () => {
  const w = world({ adminChatId: ADMIN });
  await w.msg(CUST2, `/claim ${CODE}`); assertStringIncludes(w.last('sendMessage').body.text, 'مش صح');
  await w.msg(CUST, '/support'); assertEquals(w.db.states.get(CUST), 'support');
  w.reset();
  await w.post({ message: { message_id: 3, chat: { id: -100, type: 'group' }, from: { id: CUST }, text: '/start' } });
  assertEquals(w.calls.length, 0);
});

Deno.test('unknown text shows menu; /cancel resets state; GET is harmless', async () => {
  const w = world(); w.db.states.set(CUST, 'await_imei');
  await w.msg(CUST, '/cancel'); assertEquals(w.db.states.get(CUST), '');
  await w.msg(CUST, 'ازيك'); const m = w.last('sendMessage'); assertStringIncludes(m.body.text, 'مش فاهمك'); assert(m.body.reply_markup);
  const h = makeHandler({ botToken: TOKEN, webhookSecret: SECRET, supabaseUrl: 'https://sb.test', serviceKey: 'svc', fetch: fetch });
  assertEquals((await h(new Request('https://fn.test/'))).status, 200);
});
