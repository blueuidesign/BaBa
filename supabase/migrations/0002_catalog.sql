-- 0002_catalog: danh mục trung tâm do BaBa quản, cơ sở dùng chung
create table public.ingredients (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id),
  code text not null,
  name text not null,
  grp text not null check (grp in ('main','additive','made','packaging')),
  unit text not null check (unit in ('g','ml','cai')),
  purchase_unit text not null default 'g',
  purchase_factor numeric(12,3) not null default 1,
  kind text not null default 'purchased' check (kind in ('purchased','made')),
  shelf_days int,
  default_min_qty numeric(12,2) not null default 0,
  default_lead_days int,
  storage_note text,
  sort_order int not null default 0,
  status text not null default 'active' check (status in ('active','retired')),
  created_at timestamptz not null default now(),
  unique (org_id, code)
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id),
  code text not null,
  name text not null,
  short_name text not null,
  line text not null,
  color text,
  image_url text,
  has_caffeine boolean not null default false,
  kind text not null default 'milk_bottle'
    check (kind in ('milk_bottle','milk_hot','meal_set','bakery','adult_drink','ticket','class','goods','combo')),
  yield_per_jar numeric(5,2) not null default 6,
  sort_order int not null default 0,
  status text not null default 'active' check (status in ('active','retired')),
  created_at timestamptz not null default now(),
  unique (org_id, code)
);

create table public.price_lists (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id),
  code text not null,
  name text not null,
  unique (org_id, code)
);
alter table public.outlets add constraint outlets_price_list_fk foreign key (price_list_id) references public.price_lists(id);

create table public.product_prices (
  id uuid primary key default gen_random_uuid(),
  price_list_id uuid not null references public.price_lists(id),
  product_id uuid not null references public.products(id),
  price_vnd int not null check (price_vnd >= 0),
  valid_from date not null,
  valid_to date,
  exclude using gist (
    price_list_id with =, product_id with =,
    daterange(valid_from, coalesce(valid_to, 'infinity'::date), '[)') with &&)
);

create table public.outlet_menu (
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  product_id uuid not null references public.products(id),
  enabled boolean not null default true,
  sort_order int not null default 0,
  primary key (outlet_id, product_id)
);

create table public.model_default_menu (
  org_id uuid not null references public.orgs(id),
  model text not null,
  product_id uuid not null references public.products(id),
  primary key (org_id, model, product_id)
);

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id),
  version int not null default 1,
  valid_from date not null default '2026-01-01',
  valid_to date,
  status text not null default 'approved' check (status in ('draft','approved','retired')),
  unique (product_id, version)
);

create table public.recipe_items (
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id),
  qty numeric(12,3) not null check (qty > 0),
  primary key (recipe_id, ingredient_id)
);

create table public.packaging_rules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id),
  product_kind text not null,
  ingredient_id uuid not null references public.ingredients(id),
  qty_per_unit numeric(8,3) not null default 1,
  consume_at text not null check (consume_at in ('cook','sale')),
  unique (org_id, product_kind, ingredient_id)
);

create table public.batch_recipes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id),
  code text not null,
  name text not null,
  output_ingredient_id uuid not null references public.ingredients(id),
  output_qty numeric(12,2) not null,
  note text,
  version int not null default 1,
  valid_from date not null default '2026-01-01',
  status text not null default 'approved',
  unique (org_id, code, version)
);

create table public.batch_recipe_items (
  batch_recipe_id uuid not null references public.batch_recipes(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id),
  qty numeric(12,3) not null,
  primary key (batch_recipe_id, ingredient_id)
);

-- Chưa dùng ở bản 1 (mức ngọt theo đơn), giữ để bật sau
create table public.sweetness_levels (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id),
  code text not null,
  name text not null,
  syrup_ml numeric(6,2) not null,
  sort_order int not null default 0,
  unique (org_id, code)
);

-- Giá đang hiệu lực của một món theo bảng giá của cơ sở
create or replace function public.current_price(p_outlet uuid, p_product uuid, p_date date default public.vn_today())
returns int language sql stable security definer set search_path = public as $$
  select pp.price_vnd from product_prices pp
  join outlets o on o.id = p_outlet
  join price_lists pl on pl.id = coalesce(o.price_list_id, (select id from price_lists where org_id = o.org_id and code = 'default'))
  where pp.price_list_id = pl.id and pp.product_id = p_product
    and pp.valid_from <= p_date and (pp.valid_to is null or pp.valid_to > p_date)
  limit 1
$$;

create or replace function public.current_recipe(p_product uuid, p_date date default public.vn_today())
returns uuid language sql stable security definer set search_path = public as $$
  select id from recipes where product_id = p_product and status = 'approved'
    and valid_from <= p_date and (valid_to is null or valid_to > p_date)
  order by version desc limit 1
$$;
