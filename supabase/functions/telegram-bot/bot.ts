// Telegram webhook handler for @laqeeto_help_bot. Pure (dependencies injected) so it is unit-testable.
import { T, WEB, esc, menu, back } from './texts.ts';

export type Deps = {
  botToken: string;
  webhookSecret: string;          // must match X-Telegram-Bot-Api-Secret-Token
  claimCode?: string;             // one-time admin claim (/claim <code>)
  adminChatId?: number | null;    // optional fixed admin chat (secret); overrides the claimed one
  supabaseUrl: string;
  serviceKey: string;
  fetch: typeof fetch;
  log?: (...a: unknown[]) => void;
};

type Chat = { id: number; type: string; first_name?: string; last_name?: string; username?: string; title?: string };
type Msg = { message_id: number; chat: Chat; from?: { id: number; first_name?: string; last_name?: string; username?: string; is_bot?: boolean };
  text?: string; caption?: string; reply_to_message?: Msg; [k: string]: unknown };
type Update = { update_id: number; message?: Msg; callback_query?: { id: string; data?: string; message?: Msg; from: { id: number } } };

const enc = new TextEncoder();
export function safeEqual(a: string, b: string): boolean {
  const x = enc.encode(a), y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0 && x.length > 0;
}

// Arabic-Indic / Persian digits → ASCII, strip spaces and dashes
export function normDigits(s: string): string {
  return s.replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
          .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06F0))
          .replace(/[\s\-_.\/]/g, '');
}
export const looksLikeImei = (s: string) => /^\d{14,17}$/.test(normDigits(s));

const displayName = (m: Msg) => [m.from?.first_name, m.from?.last_name].filter(Boolean).join(' ') || m.chat.first_name || 'عميل';

export function makeHandler(d: Deps) {
  const log = d.log ?? ((...a: unknown[]) => console.error(...a));

  async function tg(method: string, body: Record<string, unknown>): Promise<any> {
    try {
      const r = await d.fetch(`https://api.telegram.org/bot${d.botToken}/${method}`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => ({ ok: false }));
      if (!j.ok) log('telegram', method, j.error_code, j.description);
      return j;
    } catch (e) { log('telegram', method, String(e)); return { ok: false }; }
  }
  const send = (chat: number, text: string, extra: Record<string, unknown> = {}) =>
    tg('sendMessage', { chat_id: chat, text, parse_mode: 'HTML', link_preview_options: { is_disabled: true }, ...extra });

  async function rpc<Tr = any>(fn: string, args: Record<string, unknown>): Promise<{ data?: Tr; error?: any }> {
    try {
      const r = await d.fetch(`${d.supabaseUrl}/rest/v1/rpc/${fn}`, {
        method: 'POST',
        headers: { apikey: d.serviceKey, authorization: `Bearer ${d.serviceKey}`, 'content-type': 'application/json' },
        body: JSON.stringify(args),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) return { error: j ?? { status: r.status } };
      return { data: j as Tr };
    } catch (e) { return { error: { message: String(e) } }; }
  }
  const setState = (chat: number, state: string) => rpc('bot_set_state', { p_chat: chat, p_state: state });

  async function showMenu(chat: number, text = T.welcome) { await send(chat, text, { reply_markup: menu() }); }

  async function checkImei(chat: number, raw: string) {
    const q = normDigits(raw);
    const { data, error } = await rpc<any>('bot_check_imei', { p_chat: chat, p_q: q });
    if (error) {
      if (error.hint === 'rate_limited') return send(chat, T.rateLimited);
      log('check', error); return send(chat, 'حصلت مشكلة. جرّب تاني بعد شوية.');
    }
    if (!data?.valid) return send(chat, T.invalid);
    if (!data.luhn) return send(chat, T.luhn);
    const results: any[] = data.results ?? [];
    const active = results.find((r) => r.active);
    const link = { text: 'افتح في لقيته', url: `${WEB}#/search?q=${q}` };
    if (active) return send(chat, T.reported(q, active), { reply_markup: back([{ text: 'ابعت لصاحبه من التطبيق', url: `${WEB}#/search?q=${q}` }]) });
    return send(chat, T.clear(q, results.length > 0), { reply_markup: back([link]) });
  }

  async function adminChat(begin: any): Promise<number | null> {
    if (d.adminChatId) return d.adminChatId;
    return begin?.admin_chat ?? null;
  }

  async function forwardToSupport(m: Msg, admin: number | null, state: string) {
    const chat = m.chat.id;
    if (!admin) return send(chat, T.supportOff, { reply_markup: back([{ text: 'افتح لقيته', url: WEB }]) });
    const ok = await rpc<boolean>('bot_rate', { p_chat: chat, p_kind: 'support', p_max: 20, p_minutes: 60 });
    if (ok.data === false) return send(chat, T.supportBusy);
    const name = displayName(m);
    const head = await tg('sendMessage', { chat_id: admin, text: T.adminHeader(name, m.from?.username ?? '', chat), parse_mode: 'HTML' });
    let fwd = await tg('forwardMessage', { chat_id: admin, from_chat_id: chat, message_id: m.message_id });
    if (!fwd.ok) fwd = await tg('copyMessage', { chat_id: admin, from_chat_id: chat, message_id: m.message_id });
    if (!head.ok && !fwd.ok) return send(chat, T.supportOff);
    for (const r of [head, fwd]) if (r.ok) await rpc('bot_link_thread', { p_admin_msg: r.result.message_id, p_customer: chat, p_name: name });
    if (state === 'support') { await setState(chat, 'support2'); return send(chat, T.supportSent); }
    await setState(chat, 'support2'); // refresh the 30-minute window
    await tg('setMessageReaction', { chat_id: chat, message_id: m.message_id, reaction: [{ type: 'emoji', emoji: '👍' }] });
  }

  async function onAdminMessage(m: Msg, text: string) {
    const admin = m.chat.id;
    const rep = m.reply_to_message;
    if (rep) {
      const { data } = await rpc<any>('bot_lookup_thread', { p_admin_msg: rep.message_id });
      if (!data?.chat) return send(admin, T.adminNoThread, { reply_parameters: { message_id: m.message_id } });
      const r = m.text
        ? await send(data.chat, T.adminReply(m.text))
        : await tg('copyMessage', { chat_id: data.chat, from_chat_id: admin, message_id: m.message_id });
      return send(admin, r.ok ? T.adminRelayed : T.adminBlocked, { reply_parameters: { message_id: m.message_id } });
    }
    if (looksLikeImei(text)) return checkImei(admin, text);
    return send(admin, T.adminHint);
  }

  async function onCallback(u: Update) {
    const cq = u.callback_query!;
    const msg = cq.message;
    await tg('answerCallbackQuery', { callback_query_id: cq.id });
    if (!msg || msg.chat.type !== 'private') return;
    const chat = msg.chat.id;
    const begin = await rpc<any>('bot_begin', { p_update_id: u.update_id, p_chat: chat });
    if (begin.data?.dup) return;
    const edit = (text: string, reply_markup: unknown) =>
      tg('editMessageText', { chat_id: chat, message_id: msg.message_id, text, parse_mode: 'HTML', link_preview_options: { is_disabled: true }, reply_markup });
    switch (cq.data) {
      case 'menu': await setState(chat, ''); return edit(T.welcome, menu());
      case 'report': return edit(T.report, back([{ text: 'بلّغ دلوقتي', url: `${WEB}#/report/new` }]));
      case 'tech': return edit(T.tech, back([{ text: 'سجّل كفني', url: `${WEB}#/tech-signup` }]));
      case 'faq': return edit(T.faq, back([{ text: 'افتح لقيته', url: WEB }]));
      case 'check': await setState(chat, 'await_imei'); return send(chat, T.checkPrompt, { reply_markup: back() });
      case 'support': {
        const admin = await adminChat(begin.data);
        if (!admin) return send(chat, T.supportOff, { reply_markup: back([{ text: 'افتح لقيته', url: WEB }]) });
        await setState(chat, 'support'); return send(chat, T.supportPrompt);
      }
    }
  }

  async function onMessage(u: Update) {
    const m = u.message!;
    if (m.chat.type !== 'private' || m.from?.is_bot) return; // groups/channels are ignored
    const chat = m.chat.id;
    const begin = await rpc<any>('bot_begin', { p_update_id: u.update_id, p_chat: chat });
    if (begin.error) { log('begin', begin.error); return; }
    if (begin.data?.dup) return;
    const state: string = begin.data?.state ?? '';
    const admin = await adminChat(begin.data);
    const text = (m.text ?? '').trim();
    const [cmd0, ...rest] = text.split(/\s+/);
    const cmd = text.startsWith('/') ? cmd0.split('@')[0].toLowerCase() : '';
    const arg = rest.join(' ');

    // commands available to everyone
    if (cmd === '/claim') {
      if (!d.claimCode || d.adminChatId) return send(chat, T.claimBad);
      const ok = await rpc<boolean>('bot_rate', { p_chat: chat, p_kind: 'claim', p_max: 5, p_minutes: 60 });
      if (ok.data !== true) return send(chat, T.claimSlow);
      if (!safeEqual(arg, d.claimCode)) return send(chat, T.claimBad);
      // delete the message holding the code from the chat history (best effort)
      await tg('deleteMessage', { chat_id: chat, message_id: m.message_id });
      const r = await rpc<boolean>('bot_claim_admin', { p_chat: chat, p_name: displayName(m) });
      return send(chat, r.data === true ? T.claimOk : T.claimTaken);
    }
    if (cmd === '/start' || cmd === '/help' || cmd === '/menu') { await setState(chat, ''); return showMenu(chat); }
    if (cmd === '/cancel') { await setState(chat, ''); return showMenu(chat, T.cancelled); }
    if (cmd === '/check') {
      if (arg) { await setState(chat, ''); return checkImei(chat, arg); }
      await setState(chat, 'await_imei'); return send(chat, T.checkPrompt, { reply_markup: back() });
    }
    if (cmd === '/support') {
      if (!admin) return send(chat, T.supportOff, { reply_markup: back([{ text: 'افتح لقيته', url: WEB }]) });
      await setState(chat, 'support'); return send(chat, T.supportPrompt);
    }

    if (admin && chat === admin) {
      if (cmd === '/release') {
        const r = await rpc<boolean>('bot_release_admin', { p_chat: chat });
        return send(chat, r.data ? T.released : 'الربط ده متحدد من الإعدادات ومينفعش يتفك من هنا.');
      }
      return onAdminMessage(m, text);
    }
    if (cmd) return showMenu(chat, T.unknown);

    if (state === 'support' || state === 'support2') return forwardToSupport(m, admin, state);
    if (state === 'await_imei') {
      if (!text) return send(chat, T.invalid);
      await setState(chat, '');
      return checkImei(chat, text);
    }
    if (text && looksLikeImei(text)) return checkImei(chat, text);
    return showMenu(chat, T.unknown);
  }

  return async function handle(req: Request): Promise<Response> {
    if (req.method !== 'POST') return new Response('ok', { status: 200 });
    const got = req.headers.get('x-telegram-bot-api-secret-token') ?? '';
    if (!d.webhookSecret || !safeEqual(got, d.webhookSecret)) return new Response('forbidden', { status: 401 });
    let u: Update;
    try { u = await req.json(); } catch { return new Response('ok'); }
    try {
      if (u.callback_query) await onCallback(u);
      else if (u.message) await onMessage(u);
    } catch (e) { log('handler', String(e)); }
    return new Response('ok'); // always 200 so Telegram doesn't retry-storm
  };
}
