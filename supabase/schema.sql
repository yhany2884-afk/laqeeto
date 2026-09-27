-- =============================================================================
--  لقيته — Laqeeto (Stolen Phone Registry) — Supabase schema
--  Postgres + Supabase Auth + Storage.  Idempotent: safe to re-run.
--
--  Security model (summary)
--   * anon (not logged in): NO direct table access. Only RPCs:
--       search_reports(q), get_report_public(id), guest_message_owner(...),
--       guest_get_conversation(...), guest_send_message(...)
--     They return brand/model/color/status + owner-chosen public contact only.
--   * authenticated: RLS — owners see/edit only their own rows; column-level
--     grants restrict which columns may be written; everything sensitive is done
--     through SECURITY DEFINER RPCs that re-check the caller's role.
--   * role changes (owner/technician/admin) and technician approval only via
--     admin RPCs or plain SQL (dashboard / Management API). Never self-assignable.
--   * Storage: private buckets, path "<bucket>/<auth.uid()>/<file>", read via
--     signed URLs; readable by uploader + admins (+ owner for their handover photos).
-- =============================================================================

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role;

-- ---------------------------------------------------------------- helpers ----
create or replace function private.luhn_ok(d text) returns boolean
language plpgsql immutable set search_path = '' as $$
declare s int := 0; dbl boolean := false; x int; i int;
begin
  if d is null or d !~ '^[0-9]+$' then return false; end if;
  for i in reverse length(d)..1 loop
    x := substr(d, i, 1)::int;
    if dbl then x := x * 2; if x > 9 then x := x - 9; end if; end if;
    s := s + x; dbl := not dbl;
  end loop;
  return s % 10 = 0;
end $$;

create or replace function private.norm_id(q text) returns text
language sql immutable set search_path = '' as $$
  select upper(regexp_replace(translate(coalesce(q, ''), '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'), '[[:space:]_./-]', '', 'g'))
$$;

create or replace function private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;

-- ----------------------------------------------------------------- tables ----
create table if not exists public.profiles (
  id                 uuid primary key references auth.users(id) on delete cascade,
  role               text not null default 'owner' check (role in ('owner', 'technician', 'admin')),
  name               text not null default '' check (char_length(name) <= 120),
  email              text,
  phone              text check (char_length(phone) <= 20),
  -- technician verification
  tech_shop_name     text check (char_length(tech_shop_name) <= 120),
  tech_address       text check (char_length(tech_address) <= 300),
  tech_governorate   text check (char_length(tech_governorate) <= 40),
  tech_device_imei   text check (tech_device_imei is null or tech_device_imei = '' or tech_device_imei ~ '^[0-9]{15}$'),
  tech_id_photo      text,
  tech_selfie        text,
  tech_selfie_method text,
  tech_device_shot   text,
  tech_status        text check (tech_status in ('pending', 'approved', 'rejected', 'suspended')),
  tech_face_match    text not null default 'simulated-pending',
  tech_submitted_at  timestamptz,
  tech_reviewed_by   uuid references public.profiles(id) on delete set null,
  tech_reviewed_by_name text,
  tech_reviewed_at   timestamptz,
  tech_review_note   text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint profiles_tech_status_required check (role <> 'technician' or tech_status is not null)
);

create table if not exists public.reports (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  type          text not null check (type in ('stolen', 'lost')),
  status        text not null check (status in ('stolen', 'lost', 'found', 'delivered', 'dispute')),
  status_before_dispute text,
  brand         text not null check (char_length(brand) between 1 and 60),
  model         text not null check (char_length(model) between 1 and 80),
  color         text not null check (char_length(color) between 1 and 40),
  imei1         text not null check (imei1 ~ '^[0-9]{15}$' and private.luhn_ok(imei1)),
  imei2         text check (imei2 is null or (imei2 ~ '^[0-9]{15}$' and private.luhn_ok(imei2) and imei2 <> imei1)),
  serial        text check (serial is null or serial ~ '^[A-Z0-9]{5,30}$'),
  incident_date date,
  governorate   text check (char_length(governorate) <= 40),
  place         text check (char_length(place) <= 200),
  description   text check (char_length(description) <= 2000),
  box_photo     text not null,
  invoice_photo text,
  police_number text check (char_length(police_number) <= 120),
  police_photo  text,
  contact       jsonb not null default '{}'::jsonb check (jsonb_typeof(contact) = 'object'),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
-- one ACTIVE report per IMEI (stolen / lost / dispute)
create unique index if not exists reports_one_active_imei1 on public.reports (imei1) where status in ('stolen', 'lost', 'dispute');
create index if not exists reports_imei2_idx on public.reports (imei2) where imei2 is not null;
create index if not exists reports_serial_idx on public.reports (serial) where serial is not null;
create index if not exists reports_owner_idx on public.reports (owner_id);

create table if not exists public.report_history (
  id         bigint generated always as identity primary key,
  report_id  uuid not null references public.reports(id) on delete cascade,
  status     text not null,
  note       text,
  by_id      uuid,
  by_name    text,
  at         timestamptz not null default now()
);
create index if not exists report_history_report_idx on public.report_history (report_id);

create table if not exists public.conversations (
  id               uuid primary key default gen_random_uuid(),
  report_id        uuid not null references public.reports(id) on delete cascade,
  owner_id         uuid not null references public.profiles(id) on delete cascade,
  participant_id   uuid references public.profiles(id) on delete cascade,
  guest_name       text check (char_length(guest_name) <= 80),
  guest_phone      text,
  guest_token_hash bytea,
  owner_read_at    timestamptz not null default 'epoch',
  participant_read_at timestamptz not null default 'epoch',
  last_text        text not null default '',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint conversations_one_party check ((participant_id is not null) <> (guest_phone is not null))
);
create unique index if not exists conversations_report_participant on public.conversations (report_id, participant_id) where participant_id is not null;
create index if not exists conversations_owner_idx on public.conversations (owner_id);
create index if not exists conversations_participant_idx on public.conversations (participant_id);

create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id       uuid references public.profiles(id) on delete set null,
  sender_kind     text not null check (sender_kind in ('user', 'guest', 'system')),
  sender_name     text not null default '',
  sender_role     text,
  kind            text not null default 'text' check (kind in ('text', 'contact', 'system')),
  body            text not null check (char_length(body) between 1 and 2000),
  data            jsonb,
  created_at      timestamptz not null default now()
);
create index if not exists messages_conv_idx on public.messages (conversation_id, created_at);

create table if not exists public.handovers (
  id              uuid primary key default gen_random_uuid(),
  report_id       uuid not null references public.reports(id) on delete cascade,
  technician_id   uuid not null references public.profiles(id) on delete cascade,
  owner_id        uuid not null references public.profiles(id) on delete cascade,
  technician_name text,
  shop_name       text,
  device_brand    text,
  device_model    text,
  device_color    text,
  checklist       jsonb not null,
  device_imei     text not null check (device_imei ~ '^[0-9]{15}$'),
  owner_id_photo  text not null,
  selfie          text not null,
  notes           text check (char_length(notes) <= 1000),
  status          text not null default 'pending_owner' check (status in ('pending_owner', 'confirmed', 'disputed')),
  created_at      timestamptz not null default now(),
  confirmed_at    timestamptz,
  disputed_at     timestamptz
);
create unique index if not exists handovers_one_pending on public.handovers (report_id) where status = 'pending_owner';
create index if not exists handovers_owner_idx on public.handovers (owner_id);
create index if not exists handovers_tech_idx on public.handovers (technician_id);

create table if not exists public.disputes (
  id                 uuid primary key default gen_random_uuid(),
  report_id          uuid not null references public.reports(id) on delete cascade,
  owner_id           uuid not null references public.profiles(id) on delete cascade,
  owner_name         text,
  handover_id        uuid references public.handovers(id) on delete set null,
  technician_id      uuid references public.profiles(id) on delete set null,
  coercion           boolean not null default false,
  description        text not null check (char_length(description) between 10 and 4000),
  police_number      text check (char_length(police_number) <= 120),
  evidence_file_name text check (char_length(evidence_file_name) <= 255),
  evidence_link      text check (evidence_link is null or evidence_link = '' or evidence_link ~ '^https?://'),
  witnesses          text check (char_length(witnesses) <= 2000),
  status             text not null default 'open' check (status in ('open', 'reviewing', 'resolved', 'rejected')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists disputes_owner_idx on public.disputes (owner_id);

create table if not exists public.dispute_notes (
  id          bigint generated always as identity primary key,
  dispute_id  uuid not null references public.disputes(id) on delete cascade,
  author_id   uuid references public.profiles(id) on delete set null,
  author_name text,
  body        text not null check (char_length(body) between 1 and 2000),
  created_at  timestamptz not null default now()
);

create table if not exists public.audit_log (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default now(),
  actor_id   uuid,
  actor_name text,
  actor_role text,
  action     text not null,
  details    text,
  report_id  uuid,
  meta       jsonb
);
create index if not exists audit_log_at_idx on public.audit_log (at desc);

-- internal (not exposed through the API: schema "private" is not in PostgREST's exposed schemas)
create table if not exists private.rate_events (
  key text not null,
  at  timestamptz not null default now()
);
create index if not exists rate_events_key_at on private.rate_events (key, at);

-- --------------------------------------------------------- role helpers ----
create or replace function private.my_role() returns text
language sql stable security definer set search_path = '' as $$
  select role from public.profiles where id = auth.uid()
$$;
create or replace function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
$$;
create or replace function private.is_approved_tech() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'technician' and tech_status = 'approved')
$$;

create or replace function private.audit(p_action text, p_details text default '', p_report uuid default null, p_meta jsonb default null)
returns void language plpgsql security definer set search_path = '' as $$
declare p public.profiles;
begin
  select * into p from public.profiles where id = auth.uid();
  insert into public.audit_log (actor_id, actor_name, actor_role, action, details, report_id, meta)
  values (p.id, coalesce(p.name, 'النظام'), coalesce(p.role, case when auth.uid() is null then 'system' else 'guest' end), p_action, p_details, p_report, p_meta);
end $$;

create or replace function private.client_ip() returns text
language sql stable set search_path = '' as $$
  select nullif(trim(split_part(coalesce(nullif(current_setting('request.headers', true), '')::json ->> 'x-forwarded-for', ''), ',', 1)), '')
$$;

create or replace function private.rate_hit(p_key text, p_max int, p_window interval)
returns void language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if random() < 0.02 then delete from private.rate_events where at < now() - interval '2 days'; end if;
  select count(*) into n from private.rate_events where key = p_key and at > now() - p_window;
  if n >= p_max then
    raise exception 'تم تجاوز الحد المسموح، حاول مرة أخرى بعد قليل' using errcode = 'P0001', hint = 'rate_limited';
  end if;
  insert into private.rate_events (key) values (p_key);
end $$;

create or replace function private.public_contact(c jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'phone', case when coalesce((c -> 'phone' ->> 'public')::boolean, false) and coalesce(c -> 'phone' ->> 'value', '') <> '' then c -> 'phone' ->> 'value' end,
    'email', case when coalesce((c -> 'email' ->> 'public')::boolean, false) and coalesce(c -> 'email' ->> 'value', '') <> '' then c -> 'email' ->> 'value' end,
    'socials', (select jsonb_agg(s ->> 'value') from jsonb_array_elements(case when jsonb_typeof(c -> 'socials') = 'array' then c -> 'socials' else '[]'::jsonb end) s
                where coalesce((s ->> 'public')::boolean, false) and coalesce(s ->> 'value', '') <> '')
  ))
$$;

create or replace function private.is_active(s text) returns boolean
language sql immutable set search_path = '' as $$ select s in ('stolen', 'lost', 'dispute') $$;

-- ------------------------------------------------------------- triggers ----
-- profile auto-created on auth signup. Role from metadata: only 'owner' or 'technician' (never admin).
create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb); r text := m ->> 'role'; imei text;
begin
  if r is distinct from 'technician' then r := 'owner'; end if;
  imei := nullif(regexp_replace(coalesce(m ->> 'device_imei', ''), '[^0-9]', '', 'g'), '');
  if imei is not null and imei !~ '^[0-9]{15}$' then imei := null; end if;
  insert into public.profiles (id, role, name, email, phone, tech_shop_name, tech_address, tech_governorate, tech_device_imei, tech_status, tech_submitted_at)
  values (new.id, r, left(coalesce(m ->> 'name', ''), 120), new.email, left(coalesce(m ->> 'phone', ''), 20),
          case when r = 'technician' then left(m ->> 'shop_name', 120) end,
          case when r = 'technician' then left(m ->> 'address', 300) end,
          case when r = 'technician' then left(m ->> 'governorate', 40) end,
          case when r = 'technician' then imei end,
          case when r = 'technician' then 'pending' end,
          case when r = 'technician' then now() end)
  on conflict (id) do nothing;
  insert into public.audit_log (actor_id, actor_name, actor_role, action, details)
  values (new.id, left(coalesce(m ->> 'name', ''), 120), r,
          case when r = 'technician' then 'تسجيل فني جديد (بانتظار التحقق)' else 'إنشاء حساب مالك' end, new.email);
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function private.handle_new_user();

-- keep profile email in sync
create or replace function private.handle_user_email_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.email is distinct from old.email then update public.profiles set email = new.email where id = new.id; end if;
  return new;
end $$;
drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed after update of email on auth.users for each row execute function private.handle_user_email_change();

-- profiles: API users may never change role / verification fields themselves (defence in depth; column grants also block it)
create or replace function private.profiles_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') then
    if new.role is distinct from old.role or new.tech_status is distinct from old.tech_status
       or new.tech_reviewed_by is distinct from old.tech_reviewed_by or new.tech_face_match is distinct from old.tech_face_match
       or new.id is distinct from old.id or new.email is distinct from old.email then
      raise exception 'غير مسموح بتعديل الدور أو حالة التوثيق' using errcode = '42501';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before update on public.profiles for each row execute function private.profiles_guard();

-- reports: insert guard (runs as the caller, NOT security definer, so current_user is meaningful)
create or replace function private.reports_before_insert() returns trigger
language plpgsql set search_path = '' as $$
declare prefix text;
begin
  new.imei1 := private.norm_id(new.imei1);
  new.imei2 := nullif(private.norm_id(new.imei2), '');
  new.serial := nullif(private.norm_id(new.serial), '');
  if current_user in ('authenticated', 'anon') then
    if auth.uid() is null or coalesce(private.my_role(), '') <> 'owner' then
      raise exception 'فقط حسابات المُلّاك يمكنها إنشاء بلاغ' using errcode = '42501';
    end if;
    new.owner_id := auth.uid();
    new.status := new.type;
    new.status_before_dispute := null;
    new.created_at := now();
  end if;
  if new.status is null then new.status := new.type; end if;
  prefix := 'report-photos/' || new.owner_id::text || '/';
  if left(new.box_photo, length(prefix)) <> prefix
     or (new.invoice_photo is not null and left(new.invoice_photo, length(prefix)) <> prefix)
     or (new.police_photo is not null and left(new.police_photo, length(prefix)) <> prefix) then
    raise exception 'مسار صورة غير صالح' using errcode = '22023';
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists reports_before_insert on public.reports;
create trigger reports_before_insert before insert on public.reports for each row execute function private.reports_before_insert();

-- reports: update guard — through the API owners may only change "contact"; status changes go through RPCs
create or replace function private.reports_before_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') then
    if (to_jsonb(new) - 'contact' - 'updated_at') is distinct from (to_jsonb(old) - 'contact' - 'updated_at') then
      raise exception 'لا يمكن تعديل بيانات البلاغ مباشرة' using errcode = '42501';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists reports_before_update on public.reports;
create trigger reports_before_update before update on public.reports for each row execute function private.reports_before_update();

-- one active report per identifier (imei1 / imei2 / serial across all active reports)
create or replace function private.reports_identifier_clash() returns trigger
language plpgsql security definer set search_path = '' as $$
declare ids text[] := array_remove(array[new.imei1, new.imei2, new.serial], null); clash uuid;
begin
  if private.is_active(new.status) then
    select r.id into clash from public.reports r
     where r.id <> new.id and private.is_active(r.status)
       and (r.imei1 = any(ids) or r.imei2 = any(ids) or r.serial = any(ids))
     limit 1;
    if clash is not null then
      raise exception 'يوجد بلاغ نشط بالفعل لهذا الرقم. إذا كان الهاتف ملكك فعلاً افتح نزاعاً أو تواصل مع الدعم الفني.' using errcode = '23505';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists reports_identifier_clash on public.reports;
create trigger reports_identifier_clash before insert or update of imei1, imei2, serial, status on public.reports
  for each row execute function private.reports_identifier_clash();

-- history + audit on report insert / status change
create or replace function private.reports_after_write() returns trigger
language plpgsql security definer set search_path = '' as $$
declare p public.profiles; note text := nullif(current_setting('laqeeto.note', true), '');
begin
  select * into p from public.profiles where id = auth.uid();
  if tg_op = 'INSERT' then
    insert into public.report_history (report_id, status, note, by_id, by_name) values (new.id, new.status, coalesce(note, 'إنشاء البلاغ'), p.id, p.name);
    perform private.audit('إنشاء بلاغ', new.brand || ' ' || new.model || ' — IMEI ' || new.imei1, new.id);
  elsif new.status is distinct from old.status then
    insert into public.report_history (report_id, status, note, by_id, by_name) values (new.id, new.status, note, p.id, p.name);
    perform private.audit('تغيير حالة بلاغ', new.brand || ' ' || new.model || ': ' || old.status || ' → ' || new.status || coalesce(' — ' || note, ''), new.id);
  elsif new.contact is distinct from old.contact then
    perform private.audit('تعديل خصوصية بيانات التواصل', new.brand || ' ' || new.model, new.id);
  end if;
  return null;
end $$;
drop trigger if exists reports_after_write on public.reports;
create trigger reports_after_write after insert or update on public.reports for each row execute function private.reports_after_write();

drop trigger if exists disputes_touch on public.disputes;
create trigger disputes_touch before update on public.disputes for each row execute function private.touch_updated_at();

-- ------------------------------------------------------------------ RLS ----
alter table public.profiles       enable row level security;
alter table public.reports        enable row level security;
alter table public.report_history enable row level security;
alter table public.conversations  enable row level security;
alter table public.messages       enable row level security;
alter table public.handovers      enable row level security;
alter table public.disputes       enable row level security;
alter table public.dispute_notes  enable row level security;
alter table public.audit_log      enable row level security;
alter table private.rate_events   enable row level security;

-- profiles
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select private.is_admin()));
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- reports
drop policy if exists reports_select on public.reports;
create policy reports_select on public.reports for select to authenticated
  using (owner_id = (select auth.uid()) or (select private.is_admin()));
drop policy if exists reports_insert on public.reports;
create policy reports_insert on public.reports for insert to authenticated
  with check (owner_id = (select auth.uid()) and (select private.my_role()) = 'owner');
drop policy if exists reports_update_owner on public.reports;
create policy reports_update_owner on public.reports for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

-- report history
drop policy if exists report_history_select on public.report_history;
create policy report_history_select on public.report_history for select to authenticated
  using ((select private.is_admin()) or exists (select 1 from public.reports r where r.id = report_id and r.owner_id = (select auth.uid())));

-- conversations / messages: participants only (writes via RPC)
drop policy if exists conversations_select on public.conversations;
create policy conversations_select on public.conversations for select to authenticated
  using ((select auth.uid()) in (owner_id, participant_id));
drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages for select to authenticated
  using (exists (select 1 from public.conversations c where c.id = conversation_id and (select auth.uid()) in (c.owner_id, c.participant_id)));

-- handovers: the technician who recorded it, the owner, admins
drop policy if exists handovers_select on public.handovers;
create policy handovers_select on public.handovers for select to authenticated
  using ((select auth.uid()) in (technician_id, owner_id) or (select private.is_admin()));

-- disputes: the owner who filed it + admins
drop policy if exists disputes_select on public.disputes;
create policy disputes_select on public.disputes for select to authenticated
  using (owner_id = (select auth.uid()) or (select private.is_admin()));
drop policy if exists dispute_notes_select on public.dispute_notes;
create policy dispute_notes_select on public.dispute_notes for select to authenticated
  using ((select private.is_admin()) or exists (select 1 from public.disputes d where d.id = dispute_id and d.owner_id = (select auth.uid())));

-- audit log: admins only
drop policy if exists audit_log_select on public.audit_log;
create policy audit_log_select on public.audit_log for select to authenticated using ((select private.is_admin()));

-- ------------------------------------------------------------- grants ----
revoke all on all tables in schema public from anon, authenticated;
revoke all on all tables in schema private from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
grant select on public.profiles, public.reports, public.report_history, public.conversations, public.messages,
               public.handovers, public.disputes, public.dispute_notes, public.audit_log to authenticated;
grant update (name, phone) on public.profiles to authenticated;
grant insert (type, brand, model, color, imei1, imei2, serial, incident_date, governorate, place, description,
              box_photo, invoice_photo, police_number, police_photo, contact) on public.reports to authenticated;
grant update (contact) on public.reports to authenticated;
grant all on all tables in schema public to service_role;

-- ================================================================ RPCs ====
-- Public search: exact IMEI / serial only. Never exposes owner identity or private fields.
create or replace function public.search_reports(q text)
returns table (id uuid, brand text, model text, color text, type text, status text, active boolean,
               reported_at timestamptz, governorate text, public_contact jsonb, is_mine boolean)
language plpgsql volatile security definer set search_path = '' as $$
declare n text := private.norm_id(q); ip text := private.client_ip();
begin
  if length(n) < 5 or length(n) > 30 then return; end if;
  if auth.uid() is null and ip is not null then perform private.rate_hit('search:ip:' || ip, 120, interval '1 hour'); end if;
  return query
    select r.id, r.brand, r.model, r.color, r.type, r.status, private.is_active(r.status), r.created_at, r.governorate,
           private.public_contact(r.contact), (r.owner_id = auth.uid())
      from public.reports r
     where r.imei1 = n or r.imei2 = n or r.serial = n
     order by private.is_active(r.status) desc, r.created_at desc
     limit 5;
end $$;

create or replace function public.get_report_public(p_id uuid)
returns table (id uuid, brand text, model text, color text, type text, status text, active boolean,
               reported_at timestamptz, governorate text, public_contact jsonb, is_mine boolean)
language sql stable security definer set search_path = '' as $$
  select r.id, r.brand, r.model, r.color, r.type, r.status, private.is_active(r.status), r.created_at, r.governorate,
         private.public_contact(r.contact), (r.owner_id = auth.uid())
    from public.reports r where r.id = p_id
$$;

-- Technician check (approved technicians only; every check is audited)
create or replace function public.technician_check(q text)
returns table (id uuid, brand text, model text, color text, type text, status text, active boolean,
               reported_at timestamptz, governorate text, public_contact jsonb, is_mine boolean)
language plpgsql volatile security definer set search_path = '' as $$
declare n text := private.norm_id(q); hit boolean;
begin
  if not private.is_approved_tech() then raise exception 'حساب الفني غير مفعّل بعد' using errcode = '42501'; end if;
  perform private.rate_hit('techcheck:' || auth.uid(), 300, interval '1 hour');
  select exists (select 1 from public.reports r where (r.imei1 = n or r.imei2 = n or r.serial = n) and private.is_active(r.status)) into hit;
  perform private.audit('فحص IMEI/Serial بواسطة فني', n || ' → ' || case when hit then 'مبلغ عنه' else 'غير مبلغ عنه' end);
  return query select * from public.search_reports(n);
end $$;

-- ---------------------------------------------------------- messaging ----
create or replace function private.add_message(p_conv uuid, p_kind text, p_body text, p_data jsonb default null,
                                               p_sender_kind text default 'user', p_sender_name text default null)
returns public.messages language plpgsql security definer set search_path = '' as $$
declare p public.profiles; m public.messages;
begin
  if p_sender_kind = 'user' then select * into p from public.profiles where id = auth.uid(); end if;
  insert into public.messages (conversation_id, sender_id, sender_kind, sender_name, sender_role, kind, body, data)
  values (p_conv, p.id, p_sender_kind, coalesce(p.name, p_sender_name, 'النظام'), p.role, p_kind, left(p_body, 2000), p_data)
  returning * into m;
  update public.conversations set last_text = left(p_body, 120), updated_at = now(),
         owner_read_at = case when p.id is not null and p.id = owner_id then now() else owner_read_at end,
         participant_read_at = case when p.id is not null and p.id = participant_id then now() else participant_read_at end
   where id = p_conv;
  return m;
end $$;

create or replace function private.message_json(m public.messages) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object('id', m.id, 'sender_id', m.sender_id, 'sender_kind', m.sender_kind, 'sender_name', m.sender_name,
                            'sender_role', m.sender_role, 'kind', m.kind, 'body', m.body, 'data', m.data, 'created_at', m.created_at)
$$;

-- logged-in user (finder / technician / admin) starts or continues a conversation with a report owner
create or replace function public.message_owner(p_report uuid, p_body text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare r public.reports; me public.profiles; conv uuid;
begin
  select * into me from public.profiles where id = auth.uid();
  if me.id is null then raise exception 'يجب تسجيل الدخول أولاً' using errcode = '42501'; end if;
  if me.role = 'technician' and me.tech_status <> 'approved' then raise exception 'حساب الفني غير مفعّل بعد' using errcode = '42501'; end if;
  select * into r from public.reports where id = p_report;
  if r.id is null then raise exception 'البلاغ غير موجود'; end if;
  if r.owner_id = me.id then raise exception 'هذا بلاغك أنت'; end if;
  if coalesce(trim(p_body), '') = '' then raise exception 'الرسالة فارغة'; end if;
  perform private.rate_hit('msg:user:' || me.id, 30, interval '1 hour');
  select id into conv from public.conversations where report_id = r.id and participant_id = me.id;
  if conv is null then
    insert into public.conversations (report_id, owner_id, participant_id) values (r.id, r.owner_id, me.id) returning id into conv;
  end if;
  perform private.add_message(conv, 'text', trim(p_body));
  perform private.audit('رسالة إلى مالك بلاغ', r.brand || ' ' || r.model, r.id);
  return conv;
end $$;

create or replace function public.send_message(p_conv uuid, p_body text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare c public.conversations; m public.messages;
begin
  select * into c from public.conversations where id = p_conv;
  if c.id is null or auth.uid() is null or auth.uid() not in (c.owner_id, coalesce(c.participant_id, '00000000-0000-0000-0000-000000000000'::uuid)) then
    raise exception 'المحادثة غير موجودة' using errcode = '42501';
  end if;
  if coalesce(trim(p_body), '') = '' then raise exception 'الرسالة فارغة'; end if;
  perform private.rate_hit('msg:user:' || auth.uid(), 60, interval '1 hour');
  m := private.add_message(p_conv, 'text', trim(p_body));
  return private.message_json(m);
end $$;

-- owner reveals selected contact details inside ONE conversation
create or replace function public.share_contact(p_conv uuid, p_phone boolean, p_email boolean, p_socials boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare c public.conversations; r public.reports; shared jsonb := '{}'::jsonb; m public.messages;
begin
  select * into c from public.conversations where id = p_conv;
  if c.id is null or c.owner_id <> auth.uid() then raise exception 'غير مسموح' using errcode = '42501'; end if;
  select * into r from public.reports where id = c.report_id;
  if p_phone and coalesce(r.contact -> 'phone' ->> 'value', '') <> '' then shared := shared || jsonb_build_object('phone', r.contact -> 'phone' ->> 'value'); end if;
  if p_email and coalesce(r.contact -> 'email' ->> 'value', '') <> '' then shared := shared || jsonb_build_object('email', r.contact -> 'email' ->> 'value'); end if;
  if p_socials and jsonb_typeof(r.contact -> 'socials') = 'array' then
    shared := shared || jsonb_build_object('socials', (select coalesce(jsonb_agg(s ->> 'value'), '[]'::jsonb) from jsonb_array_elements(r.contact -> 'socials') s where coalesce(s ->> 'value', '') <> ''));
  end if;
  if shared = '{}'::jsonb then raise exception 'لا توجد بيانات مختارة للمشاركة'; end if;
  m := private.add_message(p_conv, 'contact', 'شارك المالك بيانات التواصل معك', shared);
  perform private.audit('مشاركة بيانات التواصل في محادثة', (select string_agg(k, ', ') from jsonb_object_keys(shared) k), r.id);
  return private.message_json(m);
end $$;

create or replace function public.list_my_conversations()
returns table (id uuid, report_id uuid, updated_at timestamptz, last_text text, other_name text, other_role text,
               report_brand text, report_model text, report_status text, unread int, i_am_owner boolean)
language sql stable security definer set search_path = '' as $$
  select c.id, c.report_id, c.updated_at, c.last_text,
         case when c.owner_id = auth.uid() then coalesce(pp.name, c.guest_name) else po.name end,
         case when c.owner_id = auth.uid() then coalesce(pp.role, 'guest') else po.role end,
         r.brand, r.model, r.status,
         (select count(*)::int from public.messages m where m.conversation_id = c.id and m.sender_id is distinct from auth.uid()
            and m.created_at > case when c.owner_id = auth.uid() then c.owner_read_at else c.participant_read_at end),
         c.owner_id = auth.uid()
    from public.conversations c
    join public.reports r on r.id = c.report_id
    left join public.profiles po on po.id = c.owner_id
    left join public.profiles pp on pp.id = c.participant_id
   where auth.uid() in (c.owner_id, c.participant_id)
   order by c.updated_at desc
$$;

create or replace function public.unread_count() returns int
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(unread), 0)::int from public.list_my_conversations()
$$;

create or replace function private.conversation_json(c public.conversations, viewer text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', c.id, 'report_id', c.report_id, 'viewer', viewer,
    'other_name', case when viewer = 'owner' then coalesce(pp.name, c.guest_name) else po.name end,
    'other_role', case when viewer = 'owner' then coalesce(pp.role, 'guest') else po.role end,
    'report', jsonb_build_object('id', r.id, 'brand', r.brand, 'model', r.model, 'color', r.color, 'status', r.status, 'active', private.is_active(r.status)),
    'messages', coalesce((select jsonb_agg(private.message_json(m) order by m.created_at) from public.messages m where m.conversation_id = c.id), '[]'::jsonb))
  from public.reports r
  left join public.profiles po on po.id = c.owner_id
  left join public.profiles pp on pp.id = c.participant_id
  where r.id = c.report_id
$$;

create or replace function public.get_conversation(p_conv uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare c public.conversations;
begin
  select * into c from public.conversations where id = p_conv;
  if c.id is null or auth.uid() is null or auth.uid() not in (c.owner_id, coalesce(c.participant_id, '00000000-0000-0000-0000-000000000000'::uuid)) then
    return null;
  end if;
  if c.owner_id = auth.uid() then update public.conversations set owner_read_at = now() where id = c.id;
  else update public.conversations set participant_read_at = now() where id = c.id; end if;
  return private.conversation_json(c, case when c.owner_id = auth.uid() then 'owner' else 'participant' end);
end $$;

-- ---------------------------------------------------- guest finder (anon) ----
-- Rate limited per phone, per report and per IP. Returns a secret token the guest keeps locally.
create or replace function public.guest_message_owner(p_report uuid, p_name text, p_phone text, p_body text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.reports; ph text := regexp_replace(private.norm_id(p_phone), '^(\+?20|0020)(?=1)', '0'); tok text; conv uuid; ip text := private.client_ip();
begin
  ph := regexp_replace(ph, '^\+?20(1)', '0\1');
  if ph !~ '^01[0125][0-9]{8}$' then raise exception 'رقم الموبايل غير صحيح (مثال: 01012345678)'; end if;
  if char_length(trim(coalesce(p_name, ''))) < 2 then raise exception 'اكتب اسمك'; end if;
  if char_length(trim(coalesce(p_body, ''))) < 2 then raise exception 'الرسالة فارغة'; end if;
  select * into r from public.reports where id = p_report;
  if r.id is null or not private.is_active(r.status) then raise exception 'هذا البلاغ غير نشط'; end if;
  perform private.rate_hit('guest:phone:' || ph, 5, interval '1 hour');
  perform private.rate_hit('guest:report:' || r.id, 10, interval '1 hour');
  if ip is not null then perform private.rate_hit('guest:ip:' || ip, 20, interval '1 hour'); end if;
  tok := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.conversations (report_id, owner_id, guest_name, guest_phone, guest_token_hash)
  values (r.id, r.owner_id, left(trim(p_name), 80), ph, sha256(convert_to(tok, 'UTF8'))) returning id into conv;
  perform private.add_message(conv, 'text', trim(p_body), null, 'guest', left(trim(p_name), 80));
  insert into public.audit_log (actor_id, actor_name, actor_role, action, details, report_id)
  values (null, left(trim(p_name), 80), 'guest', 'رسالة ضيف إلى مالك بلاغ', r.brand || ' ' || r.model || ' — ' || left(ph, 5) || '******', r.id);
  return jsonb_build_object('conversation_id', conv, 'token', tok);
end $$;

create or replace function private.guest_conv(p_conv uuid, p_token text) returns public.conversations
language plpgsql stable security definer set search_path = '' as $$
declare c public.conversations;
begin
  select * into c from public.conversations
   where id = p_conv and guest_token_hash is not null and guest_token_hash = sha256(convert_to(coalesce(p_token, ''), 'UTF8'));
  if c.id is null then raise exception 'المحادثة غير موجودة' using errcode = '42501'; end if;
  return c;
end $$;

drop function if exists public.guest_get_conversation(uuid, text);
create or replace function public.guest_get_conversation(p_conv uuid, p_token text, p_mark boolean default true)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare c public.conversations := private.guest_conv(p_conv, p_token); n int;
begin
  select count(*) into n from public.messages m where m.conversation_id = c.id and m.sender_kind <> 'guest' and m.created_at > c.participant_read_at;
  if p_mark then update public.conversations set participant_read_at = now() where id = c.id; end if;
  return private.conversation_json(c, 'guest') || jsonb_build_object('unread', n, 'updated_at', c.updated_at, 'last_text', c.last_text);
end $$;

create or replace function public.guest_send_message(p_conv uuid, p_token text, p_body text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare c public.conversations := private.guest_conv(p_conv, p_token); m public.messages;
begin
  if char_length(trim(coalesce(p_body, ''))) < 1 then raise exception 'الرسالة فارغة'; end if;
  perform private.rate_hit('guest:conv:' || c.id, 20, interval '1 hour');
  m := private.add_message(c.id, 'text', trim(p_body), null, 'guest', c.guest_name);
  update public.conversations set participant_read_at = now() where id = c.id;
  return private.message_json(m);
end $$;

create or replace function public.guest_unread(p_convs jsonb)
returns int language sql stable security definer set search_path = '' as $$
  -- p_convs: [{"id": "...", "token": "..."}]
  select coalesce(count(m.*), 0)::int
    from jsonb_array_elements(case when jsonb_typeof(p_convs) = 'array' then p_convs else '[]'::jsonb end) x
    join public.conversations c on c.id = (x ->> 'id')::uuid and c.guest_token_hash = sha256(convert_to(coalesce(x ->> 'token', ''), 'UTF8'))
    join public.messages m on m.conversation_id = c.id and m.sender_kind <> 'guest' and m.created_at > c.participant_read_at
$$;

-- ------------------------------------------------------------- reports ----
create or replace function public.set_report_status(p_report uuid, p_status text, p_note text default '')
returns void language plpgsql security definer set search_path = '' as $$
declare r public.reports; admin boolean := private.is_admin();
begin
  select * into r from public.reports where id = p_report;
  if r.id is null then raise exception 'البلاغ غير موجود'; end if;
  if p_status not in ('stolen', 'lost', 'found', 'delivered', 'dispute') then raise exception 'حالة غير معروفة'; end if;
  if not admin then
    if r.owner_id is distinct from auth.uid() then raise exception 'ليست لديك صلاحية' using errcode = '42501'; end if;
    if not ((r.status in ('stolen', 'lost') and p_status = 'found') or (r.status = 'found' and p_status = r.type)) then
      raise exception 'لا يمكن للمالك تعيين هذه الحالة' using errcode = '42501';
    end if;
  end if;
  perform set_config('laqeeto.note', coalesce(nullif(p_note, ''), case when admin then 'تغيير بواسطة الدعم الفني' else '' end), true);
  update public.reports set status = p_status,
         status_before_dispute = case when p_status = 'dispute' and status <> 'dispute' then status else status_before_dispute end
   where id = p_report;
  perform set_config('laqeeto.note', '', true);
end $$;

-- ---------------------------------------------------------- technicians ----
create or replace function public.submit_technician_documents(p_id_photo text, p_selfie text, p_selfie_method text, p_device_shot text)
returns void language plpgsql security definer set search_path = '' as $$
declare me public.profiles; prefix text := 'tech-docs/' || auth.uid()::text || '/';
begin
  select * into me from public.profiles where id = auth.uid();
  if me.role is distinct from 'technician' or me.tech_status not in ('pending', 'rejected') then
    raise exception 'غير مسموح' using errcode = '42501';
  end if;
  if left(p_id_photo, length(prefix)) <> prefix or left(p_selfie, length(prefix)) <> prefix or left(p_device_shot, length(prefix)) <> prefix then
    raise exception 'مسار صورة غير صالح' using errcode = '22023';
  end if;
  update public.profiles set tech_id_photo = p_id_photo, tech_selfie = p_selfie, tech_selfie_method = left(p_selfie_method, 30),
         tech_device_shot = p_device_shot, tech_status = 'pending', tech_submitted_at = now()
   where id = me.id;
  perform private.audit('رفع مستندات توثيق فني', me.tech_shop_name);
end $$;

create or replace function public.admin_review_technician(p_user uuid, p_decision text, p_note text default '')
returns void language plpgsql security definer set search_path = '' as $$
declare st text; t public.profiles; me public.profiles;
begin
  if not private.is_admin() then raise exception 'ليست لديك صلاحية' using errcode = '42501'; end if;
  st := case p_decision when 'approve' then 'approved' when 'reject' then 'rejected' when 'suspend' then 'suspended' when 'reactivate' then 'approved' end;
  if st is null then raise exception 'إجراء غير معروف'; end if;
  select * into me from public.profiles where id = auth.uid();
  update public.profiles set tech_status = st, tech_reviewed_by = me.id, tech_reviewed_by_name = me.name, tech_reviewed_at = now(), tech_review_note = nullif(p_note, '')
   where id = p_user and role = 'technician' returning * into t;
  if t.id is null then raise exception 'الفني غير موجود'; end if;
  perform private.audit(case p_decision when 'approve' then 'اعتماد فني' when 'reject' then 'رفض فني' when 'suspend' then 'إيقاف فني' else 'إعادة تفعيل فني' end,
                        t.name || ' — ' || coalesce(t.tech_shop_name, '') || coalesce(' — ' || nullif(p_note, ''), ''), null, jsonb_build_object('target_user', p_user));
end $$;

create or replace function public.admin_set_role(p_user uuid, p_role text)
returns void language plpgsql security definer set search_path = '' as $$
declare t public.profiles;
begin
  if not private.is_admin() then raise exception 'ليست لديك صلاحية' using errcode = '42501'; end if;
  if p_role not in ('owner', 'technician', 'admin') then raise exception 'دور غير معروف'; end if;
  update public.profiles set role = p_role, tech_status = case when p_role = 'technician' then coalesce(tech_status, 'pending') else tech_status end
   where id = p_user returning * into t;
  if t.id is null then raise exception 'المستخدم غير موجود'; end if;
  perform private.audit('تغيير دور مستخدم', t.email || ' → ' || p_role, null, jsonb_build_object('target_user', p_user));
end $$;

-- ------------------------------------------------------------ handovers ----
create or replace function public.create_handover(p_report uuid, p_checklist jsonb, p_device_imei text, p_owner_id_photo text, p_selfie text, p_notes text default '')
returns uuid language plpgsql security definer set search_path = '' as $$
declare me public.profiles; r public.reports; d text := private.norm_id(p_device_imei); prefix text := 'handover-photos/' || auth.uid()::text || '/'; h uuid; conv uuid;
begin
  if not private.is_approved_tech() then raise exception 'حساب الفني غير مفعّل بعد' using errcode = '42501'; end if;
  select * into me from public.profiles where id = auth.uid();
  select * into r from public.reports where id = p_report for update;
  if r.id is null then raise exception 'البلاغ غير موجود'; end if;
  if r.status not in ('stolen', 'lost') then raise exception 'هذا البلاغ ليس نشطاً أو عليه نزاع'; end if;
  if not (coalesce((p_checklist ->> 'box')::boolean, false) and coalesce((p_checklist ->> 'imeiMatch')::boolean, false) and coalesce((p_checklist ->> 'unlocked')::boolean, false)) then
    raise exception 'يجب استيفاء كل بنود قائمة التحقق';
  end if;
  if d is distinct from r.imei1 and d is distinct from r.imei2 then raise exception 'رقم IMEI الظاهر على الجهاز لا يطابق البلاغ — لا تسلّم الهاتف'; end if;
  if left(coalesce(p_owner_id_photo, ''), length(prefix)) <> prefix or left(coalesce(p_selfie, ''), length(prefix)) <> prefix then
    raise exception 'صورة بطاقة المالك وصورة التسليم مطلوبتان';
  end if;
  if exists (select 1 from public.handovers where report_id = r.id and status = 'pending_owner') then
    raise exception 'يوجد تسليم بانتظار تأكيد المالك لهذا البلاغ';
  end if;
  insert into public.handovers (report_id, technician_id, owner_id, technician_name, shop_name, device_brand, device_model, device_color,
                                checklist, device_imei, owner_id_photo, selfie, notes)
  values (r.id, me.id, r.owner_id, me.name, me.tech_shop_name, r.brand, r.model, r.color,
          jsonb_build_object('box', true, 'imeiMatch', true, 'unlocked', true), d, p_owner_id_photo, p_selfie, left(p_notes, 1000))
  returning id into h;
  select id into conv from public.conversations where report_id = r.id and participant_id = me.id;
  if conv is null then
    insert into public.conversations (report_id, owner_id, participant_id) values (r.id, r.owner_id, me.id) returning id into conv;
  end if;
  perform private.add_message(conv, 'system', 'سجّل الفني ' || me.name || ' (' || coalesce(me.tech_shop_name, '') || ') تسليم هاتفك ' || r.brand || ' ' || r.model
          || '. من فضلك افتح «بلاغاتي» وأكّد الاستلام، أو أبلغ عن مشكلة إذا تعرضت لأي ضغط.', null, 'system');
  perform private.audit('تسجيل تسليم هاتف', r.brand || ' ' || r.model || ' — بانتظار تأكيد المالك', r.id, jsonb_build_object('handover', h));
  return h;
end $$;

-- validate before the technician uploads photos (avoids orphan uploads on mismatch)
create or replace function public.handover_precheck(p_report uuid, p_device_imei text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare r public.reports; d text := private.norm_id(p_device_imei);
begin
  if not private.is_approved_tech() then raise exception 'حساب الفني غير مفعّل بعد' using errcode = '42501'; end if;
  select * into r from public.reports where id = p_report;
  if r.id is null then raise exception 'البلاغ غير موجود'; end if;
  if r.status not in ('stolen', 'lost') then raise exception 'هذا البلاغ ليس نشطاً أو عليه نزاع'; end if;
  if d is distinct from r.imei1 and d is distinct from r.imei2 then raise exception 'رقم IMEI الظاهر على الجهاز لا يطابق البلاغ — لا تسلّم الهاتف'; end if;
  if exists (select 1 from public.handovers where report_id = r.id and status = 'pending_owner') then
    raise exception 'يوجد تسليم بانتظار تأكيد المالك لهذا البلاغ';
  end if;
  return true;
end $$;

create or replace function public.confirm_handover(p_handover uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare h public.handovers;
begin
  select * into h from public.handovers where id = p_handover for update;
  if h.id is null or h.owner_id <> auth.uid() then raise exception 'غير مسموح' using errcode = '42501'; end if;
  if h.status <> 'pending_owner' then raise exception 'تمت معالجة هذا التسليم بالفعل'; end if;
  update public.handovers set status = 'confirmed', confirmed_at = now() where id = h.id;
  perform set_config('laqeeto.note', 'أكد المالك الاستلام من ' || coalesce(h.shop_name, ''), true);
  update public.reports set status = 'delivered' where id = h.report_id;
  perform set_config('laqeeto.note', '', true);
  perform private.audit('أكد المالك استلام هاتفه', h.shop_name, h.report_id, jsonb_build_object('handover', h.id));
end $$;

-- ------------------------------------------------------------- disputes ----
create or replace function public.create_dispute(p_report uuid, p_handover uuid, p_coercion boolean, p_description text,
                                                 p_police_number text default '', p_evidence_file_name text default '',
                                                 p_evidence_link text default '', p_witnesses text default '')
returns uuid language plpgsql security definer set search_path = '' as $$
declare me public.profiles; r public.reports; h public.handovers; d uuid;
begin
  select * into me from public.profiles where id = auth.uid();
  select * into r from public.reports where id = p_report for update;
  if r.id is null or r.owner_id is distinct from auth.uid() then raise exception 'غير مسموح' using errcode = '42501'; end if;
  if p_handover is not null then
    select * into h from public.handovers where id = p_handover and owner_id = auth.uid() and report_id = r.id;
    if h.id is not null then update public.handovers set status = 'disputed', disputed_at = now() where id = h.id; end if;
  end if;
  insert into public.disputes (report_id, owner_id, owner_name, handover_id, technician_id, coercion, description, police_number,
                               evidence_file_name, evidence_link, witnesses)
  values (r.id, me.id, me.name, h.id, h.technician_id, coalesce(p_coercion, false), trim(p_description), nullif(p_police_number, ''),
          nullif(p_evidence_file_name, ''), nullif(p_evidence_link, ''), nullif(p_witnesses, ''))
  returning id into d;
  if r.status <> 'dispute' then
    perform set_config('laqeeto.note', case when p_coercion then 'بلاغ إكراه/تهديد' else 'فتح نزاع' end, true);
    update public.reports set status_before_dispute = status, status = 'dispute' where id = r.id;
    perform set_config('laqeeto.note', '', true);
  end if;
  perform private.audit(case when p_coercion then 'نزاع: إبلاغ عن إكراه/تهديد' else 'فتح نزاع' end,
                        r.brand || ' ' || r.model || coalesce(' — محضر ' || nullif(p_police_number, ''), ''), r.id, jsonb_build_object('dispute', d));
  return d;
end $$;

create or replace function public.admin_add_dispute_note(p_dispute uuid, p_body text)
returns void language plpgsql security definer set search_path = '' as $$
declare me public.profiles;
begin
  if not private.is_admin() then raise exception 'ليست لديك صلاحية' using errcode = '42501'; end if;
  select * into me from public.profiles where id = auth.uid();
  insert into public.dispute_notes (dispute_id, author_id, author_name, body) values (p_dispute, me.id, me.name, trim(p_body));
  update public.disputes set updated_at = now() where id = p_dispute;
  perform private.audit('ملاحظة على نزاع', left(p_body, 80), null, jsonb_build_object('dispute', p_dispute));
end $$;

create or replace function public.admin_set_dispute_status(p_dispute uuid, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'ليست لديك صلاحية' using errcode = '42501'; end if;
  update public.disputes set status = p_status where id = p_dispute;
  perform private.audit('تغيير حالة نزاع', p_status, null, jsonb_build_object('dispute', p_dispute));
end $$;

create or replace function public.admin_stats()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'ليست لديك صلاحية' using errcode = '42501'; end if;
  return jsonb_build_object(
    'reports', (select count(*) from public.reports),
    'active', (select count(*) from public.reports where private.is_active(status)),
    'delivered', (select count(*) from public.reports where status = 'delivered'),
    'pendingTechs', (select count(*) from public.profiles where role = 'technician' and tech_status = 'pending'),
    'openDisputes', (select count(*) from public.disputes where status in ('open', 'reviewing')));
end $$;

create or replace function public.log_login()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then return; end if;
  perform private.rate_hit('login:' || auth.uid(), 30, interval '1 hour');
  perform private.audit('تسجيل دخول', coalesce(private.my_role(), ''));
end $$;

-- ------------------------------------------------------ function grants ----
revoke execute on all functions in schema public from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;
-- helpers used inside RLS policies / constraints must be executable by API roles
grant execute on function private.is_admin(), private.is_approved_tech(), private.my_role(), private.luhn_ok(text),
                          private.norm_id(text), private.is_active(text) to anon, authenticated;
-- public (anon + logged in)
grant execute on function public.search_reports(text), public.get_report_public(uuid),
                          public.guest_message_owner(uuid, text, text, text), public.guest_get_conversation(uuid, text, boolean),
                          public.guest_send_message(uuid, text, text), public.guest_unread(jsonb) to anon, authenticated;
-- logged in only (each function re-checks role)
grant execute on function public.technician_check(text), public.message_owner(uuid, text), public.send_message(uuid, text),
                          public.share_contact(uuid, boolean, boolean, boolean), public.list_my_conversations(), public.unread_count(),
                          public.get_conversation(uuid), public.set_report_status(uuid, text, text),
                          public.submit_technician_documents(text, text, text, text), public.admin_review_technician(uuid, text, text),
                          public.admin_set_role(uuid, text), public.create_handover(uuid, jsonb, text, text, text, text), public.handover_precheck(uuid, text),
                          public.confirm_handover(uuid), public.create_dispute(uuid, uuid, boolean, text, text, text, text, text),
                          public.admin_add_dispute_note(uuid, text), public.admin_set_dispute_status(uuid, text),
                          public.admin_stats(), public.log_login() to authenticated;
grant execute on all functions in schema public to service_role;
grant execute on all functions in schema private to service_role;

-- =============================================================== Storage ====
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('report-photos',   'report-photos',   false, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('tech-docs',       'tech-docs',       false, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('handover-photos', 'handover-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- uploads: only into your own folder "<uid>/..."; handover photos only by approved technicians
drop policy if exists laqeeto_upload_own on storage.objects;
create policy laqeeto_upload_own on storage.objects for insert to authenticated
  with check (bucket_id in ('report-photos', 'tech-docs') and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists laqeeto_upload_handover on storage.objects;
create policy laqeeto_upload_handover on storage.objects for insert to authenticated
  with check (bucket_id = 'handover-photos' and (storage.foldername(name))[1] = (select auth.uid())::text and (select private.is_approved_tech()));
-- reads (signed URLs): uploader + admins
drop policy if exists laqeeto_read_own_or_admin on storage.objects;
create policy laqeeto_read_own_or_admin on storage.objects for select to authenticated
  using (bucket_id in ('report-photos', 'tech-docs', 'handover-photos')
         and ((storage.foldername(name))[1] = (select auth.uid())::text or (select private.is_admin())));
-- the phone owner may view the handover photos of their own handover
drop policy if exists laqeeto_owner_reads_handover on storage.objects;
create policy laqeeto_owner_reads_handover on storage.objects for select to authenticated
  using (bucket_id = 'handover-photos' and exists (
    select 1 from public.handovers h where h.owner_id = (select auth.uid()) and ('handover-photos/' || name) in (h.owner_id_photo, h.selfie)));
-- no update/delete policies: uploaded evidence is immutable from the client

-- tell PostgREST to reload its schema cache
notify pgrst, 'reload schema';
