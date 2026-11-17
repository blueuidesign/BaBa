-- Giả lập phần Supabase có sẵn mà Postgres trần không có, để chạy lại toàn bộ migration trong CI.
-- Chỉ dùng cho kiểm thử. Không chạy file này trên database thật.

-- Vai trò của Supabase
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

-- pgcrypto nằm ở schema extensions như trên Supabase
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
grant usage on schema extensions to anon, authenticated, service_role;

-- Quyền mặc định của Supabase trên schema public: cấp hết cho 3 vai trò, RLS mới là lớp chặn
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

-- auth: bảng người dùng tối thiểu và các hàm đọc JWT
create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  raw_app_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  last_sign_in_at timestamptz
);
create or replace function auth.jwt() returns jsonb language sql stable as
$$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create or replace function auth.uid() returns uuid language sql stable as
$$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
create or replace function auth.role() returns text language sql stable as
$$ select coalesce(auth.jwt() ->> 'role', 'anon') $$;
create or replace function auth.email() returns text language sql stable as
$$ select auth.jwt() ->> 'email' $$;

-- pg_cron: chỉ ghi lại lịch, không chạy
create schema if not exists cron;
create table if not exists cron.job (jobid bigserial primary key, jobname text unique, schedule text, command text, active boolean not null default true);
create or replace function cron.schedule(p_name text, p_schedule text, p_command text) returns bigint language plpgsql as $$
declare v bigint;
begin
  insert into cron.job (jobname, schedule, command) values (p_name, p_schedule, p_command)
  on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command
  returning jobid into v;
  return v;
end $$;
create or replace function cron.unschedule(p_name text) returns boolean language sql as
$$ delete from cron.job where jobname = p_name returning true $$;

-- pg_net: ghi lại lời gọi, không gửi ra ngoài
create schema if not exists net;
create table if not exists net.calls (id bigserial primary key, url text, body jsonb, headers jsonb, at timestamptz not null default now());
create or replace function net.http_post(url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb, headers jsonb default '{}'::jsonb, timeout_milliseconds int default 5000)
returns bigint language sql as
$$ insert into net.calls (url, body, headers) values (url, body, headers) returning id $$;
grant usage on schema net to anon, authenticated, service_role;

-- Vault: lưu thường, không mã hóa
create schema if not exists vault;
create table if not exists vault.secrets (id uuid primary key default gen_random_uuid(), name text unique, secret text, description text default '');
create or replace view vault.decrypted_secrets as select id, name, secret as decrypted_secret, description from vault.secrets;
create or replace function vault.create_secret(new_secret text, new_name text default null, new_description text default '') returns uuid language sql as
$$ insert into vault.secrets (name, secret, description) values (new_name, new_secret, new_description) returning id $$;
