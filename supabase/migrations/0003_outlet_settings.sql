-- 0003_outlet_settings: cài đặt kho và nhắc nhở theo từng cơ sở
create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  name text not null,
  phone text,
  note text,
  created_at timestamptz not null default now(),
  unique (outlet_id, name)
);

create table public.outlet_ingredient_settings (
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id),
  min_qty numeric(12,2) check (min_qty is null or min_qty > 0),
  lead_days int check (lead_days is null or lead_days >= 0),
  supplier_id uuid references public.suppliers(id),
  notify_email boolean not null default true,
  enabled boolean not null default true,
  on_order_until date,
  updated_at timestamptz not null default now(),
  primary key (outlet_id, ingredient_id)
);
create trigger ois_updated before update on public.outlet_ingredient_settings for each row execute function public.set_updated_at();

create table public.notification_settings (
  outlet_id uuid primary key references public.outlets(id) on delete cascade,
  reorder_email boolean not null default true,
  reorder_time time not null default '06:00',
  day_close_reminder boolean not null default true,
  day_close_time time not null default '21:00',
  updated_at timestamptz not null default now()
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text unique not null,
  p256dh text,
  auth text,
  created_at timestamptz not null default now()
);
