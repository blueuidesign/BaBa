-- 0001_core: tổ chức, người dùng, cơ sở, phân quyền ba tầng
create extension if not exists pgcrypto;
create extension if not exists btree_gist;

create or replace function public.vn_today() returns date
language sql stable as $$ select (now() at time zone 'Asia/Ho_Chi_Minh')::date $$;

create or replace function public.set_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;

create table public.orgs (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  settings jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  full_name text,
  last_outlet_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated before update on public.profiles for each row execute function public.set_updated_at();

-- Tầng tổ chức: admin (bản 1), sẵn founder / ops / finance
create table public.org_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  org_id uuid not null references public.orgs(id) on delete cascade,
  role text not null check (role in ('admin','founder','ops','finance')),
  status text not null default 'active' check (status in ('active','removed')),
  created_at timestamptz not null default now(),
  unique (user_id, org_id)
);

create table public.outlets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id),
  name text not null,
  model text not null check (model in ('M1_cart','M2_street','M2_shop','M3_seat','M3_experience','GARDEN')),
  address text,
  lat numeric(9,6),
  lng numeric(9,6),
  status text not null default 'active' check (status in ('preparing','active','paused','closed')),
  opened_at date default public.vn_today(),
  timezone text not null default 'Asia/Ho_Chi_Minh',
  currency text not null default 'VND',
  settings jsonb not null default '{}',
  price_list_id uuid,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, name)
);
create trigger outlets_updated before update on public.outlets for each row execute function public.set_updated_at();

-- Tầng cơ sở: owner (một người có thể sở hữu nhiều cơ sở), staff (gán vào cơ sở cụ thể)
create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  role text not null check (role in ('owner','staff')),
  status text not null default 'active' check (status in ('active','invited','removed')),
  invited_email text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, outlet_id),
  check (user_id is not null or invited_email is not null)
);
create unique index memberships_invite_uq on public.memberships (outlet_id, lower(invited_email)) where user_id is null;
create trigger memberships_updated before update on public.memberships for each row execute function public.set_updated_at();

-- Danh sách email được gán quyền tự động khi đăng nhập lần đầu (bản 1, trước khi có màn phân quyền)
create table public.bootstrap_admins (
  email text primary key,
  org_code text not null default 'baba',
  role text not null default 'admin'
);

-- Hàm trợ giúp phân quyền (security definer để không vướng RLS lặp)
create or replace function public.my_outlets() returns setof uuid
language sql stable security definer set search_path = public as $$
  select outlet_id from memberships where user_id = auth.uid() and status = 'active'
$$;

create or replace function public.my_owned_outlets() returns setof uuid
language sql stable security definer set search_path = public as $$
  select outlet_id from memberships where user_id = auth.uid() and role = 'owner' and status = 'active'
$$;

create or replace function public.is_org_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from org_memberships where user_id = auth.uid() and role = 'admin' and status = 'active')
$$;

create or replace function public.can_access_outlet(p_outlet uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_org_admin() or exists (
    select 1 from memberships where user_id = auth.uid() and outlet_id = p_outlet and status = 'active')
$$;

create or replace function public.can_manage_outlet(p_outlet uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_org_admin() or exists (
    select 1 from memberships where user_id = auth.uid() and outlet_id = p_outlet and role = 'owner' and status = 'active')
$$;

-- Khi có người đăng ký: tạo profile, nhận lời mời đang chờ, gán admin nếu nằm trong danh sách
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_admin record;
begin
  insert into profiles (id, email, full_name)
  values (new.id, lower(new.email), coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;

  update memberships set user_id = new.id, status = 'active'
   where user_id is null and lower(invited_email) = lower(new.email);

  select * into v_admin from bootstrap_admins where email = lower(new.email);
  if found then
    insert into org_memberships (user_id, org_id, role)
    select new.id, o.id, v_admin.role from orgs o where o.code = v_admin.org_code
    on conflict (user_id, org_id) do nothing;
    -- admin cũng là chủ của cơ sở mẫu để thử giao diện chủ cơ sở
    insert into memberships (user_id, outlet_id, role)
    select new.id, ot.id, 'owner' from outlets ot where (ot.settings->>'seed')::boolean is true
    on conflict (user_id, outlet_id) do nothing;
  end if;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();
