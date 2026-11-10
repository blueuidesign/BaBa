-- 0004_ledger: sổ cái nối thêm. Client không ghi trực tiếp; mọi ghi qua hàm fn_* (0006).
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id),
  client_id uuid unique,
  seq_in_day int not null,
  business_date date not null,
  placed_at timestamptz not null default now(),
  channel text not null default 'counter' check (channel in ('counter','voice','aggregate')),
  -- active: đơn bán; reversed: đơn gốc đã bị đảo; reversal: bản ghi đảo
  status text not null default 'active' check (status in ('active','reversed','reversal')),
  reversal_of uuid references public.orders(id),
  reversal_reason text,
  is_gift boolean not null default false,
  total_vnd int not null default 0,
  payment_method text check (payment_method in ('cash','transfer')),
  note text,
  created_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now(),
  server_seq bigint generated always as identity,
  unique (outlet_id, business_date, seq_in_day)
);
create index orders_outlet_date on public.orders (outlet_id, business_date);
create index orders_server_seq on public.orders (outlet_id, server_seq);

create table public.order_lines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id),
  qty int not null check (qty > 0),
  unit_price_vnd int not null,
  recipe_id uuid references public.recipes(id),
  sweetness_level_id uuid references public.sweetness_levels(id),
  line_total_vnd int not null
);
create index order_lines_order on public.order_lines (order_id);

create table public.cook_plans (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  plan_date date not null,
  kind text not null default 'next_day' check (kind in ('next_day','extra_today')),
  status text not null default 'draft' check (status in ('draft','cooked')),
  created_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (outlet_id, plan_date, kind)
);
create trigger cook_plans_updated before update on public.cook_plans for each row execute function public.set_updated_at();

create table public.cook_plan_lines (
  plan_id uuid not null references public.cook_plans(id) on delete cascade,
  product_id uuid not null references public.products(id),
  planned_qty int not null check (planned_qty >= 0),
  primary key (plan_id, product_id)
);

create table public.cook_runs (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id),
  client_id uuid unique,
  business_date date not null,
  cooked_at timestamptz not null default now(),
  plan_id uuid references public.cook_plans(id),
  status text not null default 'active' check (status in ('active','reversed')),
  reversal_reason text,
  note text,
  created_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now(),
  server_seq bigint generated always as identity
);
create index cook_runs_outlet_date on public.cook_runs (outlet_id, business_date);

create table public.cook_run_lines (
  id uuid primary key default gen_random_uuid(),
  cook_run_id uuid not null references public.cook_runs(id) on delete cascade,
  product_id uuid not null references public.products(id),
  qty int not null check (qty > 0),
  recipe_id uuid references public.recipes(id)
);
create index cook_run_lines_run on public.cook_run_lines (cook_run_id);

create table public.production_batches (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id),
  client_id uuid unique,
  batch_recipe_id uuid not null references public.batch_recipes(id),
  batch_count numeric(6,2) not null check (batch_count > 0),
  business_date date not null,
  produced_at timestamptz not null default now(),
  expires_at date,
  created_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now(),
  server_seq bigint generated always as identity
);

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id),
  client_id uuid unique,
  supplier_id uuid references public.suppliers(id),
  business_date date not null,
  purchased_at timestamptz not null default now(),
  total_vnd int,
  receipt_url text,
  note text,
  created_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now(),
  server_seq bigint generated always as identity
);

create table public.purchase_lines (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id),
  qty numeric(12,2) not null check (qty > 0),
  unit_cost_vnd int,
  expires_at date
);

create table public.stock_counts (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id),
  client_id uuid unique,
  business_date date not null,
  counted_at timestamptz not null default now(),
  counted_by uuid references public.profiles(id) default auth.uid(),
  reason text,
  note text,
  server_seq bigint generated always as identity
);

create table public.stock_count_lines (
  id uuid primary key default gen_random_uuid(),
  stock_count_id uuid not null references public.stock_counts(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id),
  qty_book numeric(12,2) not null,
  qty_actual numeric(12,2) not null check (qty_actual >= 0),
  reason text check (reason in ('shrink','spoiled','purchase_missed','cook_wrong','other'))
);

-- Nguồn duy nhất của tồn kho vật tư
create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id),
  ingredient_id uuid not null references public.ingredients(id),
  qty_delta numeric(12,3) not null,
  reason text not null check (reason in ('purchase','cook','cook_packaging','batch_in','batch_use','sale_packaging','count_adjust','waste','reversal')),
  ref_table text not null,
  ref_id uuid not null,
  business_date date not null,
  lot_id uuid,
  expires_at date,
  unit_cost_vnd int,
  created_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now(),
  server_seq bigint generated always as identity
);
create index stock_mv_outlet_ing_date on public.stock_movements (outlet_id, ingredient_id, business_date);
create index stock_mv_ref on public.stock_movements (ref_table, ref_id);

create table public.day_closes (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id),
  business_date date not null,
  shift_no int not null default 1,
  is_current boolean not null default true,
  supersedes uuid references public.day_closes(id),
  cash_counted_vnd int not null default 0,
  transfer_counted_vnd int not null default 0,
  revenue_by_orders_vnd int not null,
  bottles_by_orders int not null,
  bottles_out int not null,
  gift_total int not null default 0,
  waste_total int not null default 0,
  diff_bottles int not null,
  diff_money_vnd int not null,
  money_diff_reason text,
  reclose_reason text,
  closed_at timestamptz not null default now(),
  closed_by uuid references public.profiles(id) default auth.uid(),
  server_seq bigint generated always as identity
);
create unique index day_closes_current_uq on public.day_closes (outlet_id, business_date, shift_no) where is_current;

create table public.day_close_lines (
  id uuid primary key default gen_random_uuid(),
  day_close_id uuid not null references public.day_closes(id) on delete cascade,
  product_id uuid not null references public.products(id),
  cooked_qty int not null default 0,
  carried_qty int not null default 0,
  sold_qty int not null default 0,
  counted_left int not null default 0,
  gift_qty int not null default 0,
  waste_qty int not null default 0
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  kind text not null check (kind in ('reorder','expiry','day_close_missing','count_diff','invite','info')),
  severity text not null default 'info' check (severity in ('info','warn','danger','ok')),
  title text not null,
  body text,
  link text,
  dedupe_key text unique,
  emailed_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_outlet on public.notifications (outlet_id, created_at desc);

create table public.notification_reads (
  notification_id uuid not null references public.notifications(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  read_at timestamptz not null default now(),
  primary key (notification_id, user_id)
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid,
  table_name text not null,
  row_id uuid,
  action text not null,
  old_row jsonb,
  new_row jsonb,
  at timestamptz not null default now()
);
create index audit_log_at on public.audit_log (at);
