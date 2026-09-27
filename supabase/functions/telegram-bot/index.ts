// Supabase Edge Function entrypoint (deploy with verify_jwt = false; auth is the webhook secret header).
import { makeHandler } from './bot.ts';

const env = (k: string) => Deno.env.get(k) ?? '';
const handler = makeHandler({
  botToken: env('TELEGRAM_BOT_TOKEN'),
  webhookSecret: env('TELEGRAM_WEBHOOK_SECRET'),
  claimCode: env('TELEGRAM_ADMIN_CLAIM_CODE') || undefined,
  adminChatId: env('TELEGRAM_ADMIN_CHAT_ID') ? Number(env('TELEGRAM_ADMIN_CHAT_ID')) : null,
  supabaseUrl: env('SUPABASE_URL'),
  serviceKey: env('SUPABASE_SERVICE_ROLE_KEY'),
  fetch: (...a) => fetch(...a),
});
Deno.serve(handler);
