-- 0051 · Giá vốn chuẩn (Tùng duyệt 16/11 14:05). Chạy trên production 16/11.
-- Thêm: bảng đơn giá chuẩn nguyên liệu (có ngày hiệu lực), giá bao bì theo chai/cốc, số ml syrup tính vào giá vốn mỗi món,
-- cột giá vốn trên dòng đơn (chụp lúc bán bằng trigger). Chỉ thêm, không đổi nghĩa cột cũ.
create table if not exists public.ingredient_std_costs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id),
  ingredient_id uuid not null references public.ingredients(id),
  cost_per_unit numeric(12,3) not null check (cost_per_unit >= 0),
  valid_from date not null,
  note text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (org_id, ingredient_id, valid_from)
);
create table if not exists public.container_std_costs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id),
  container text not null check (container in ('chai','coc')),
  cost_vnd integer not null check (cost_vnd >= 0),
  breakdown jsonb not null default '[]'::jsonb,
  valid_from date not null,
  note text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (org_id, container, valid_from)
);
alter table public.products add column if not exists cost_syrup_ml numeric(8,2) not null default 30;
alter table public.order_lines add column if not exists unit_cost_vnd integer;
comment on column public.products.cost_syrup_ml is 'Số ml syrup tính vào giá vốn một phần (không dùng để trừ kho)';
comment on column public.order_lines.unit_cost_vnd is 'Giá vốn chuẩn một phần lúc bán (nguyên liệu + syrup + bao bì); null = món chưa có công thức hoặc thiếu đơn giá';

alter table public.ingredient_std_costs enable row level security;
alter table public.container_std_costs enable row level security;
create policy ingredient_std_costs_read on public.ingredient_std_costs for select using (
  public.is_org_admin() or exists (select 1 from public.outlets o where o.org_id = ingredient_std_costs.org_id and public.can_manage_outlet(o.id)));
create policy ingredient_std_costs_admin on public.ingredient_std_costs for all using (public.is_org_admin()) with check (public.is_org_admin());
create policy container_std_costs_read on public.container_std_costs for select using (
  public.is_org_admin() or exists (select 1 from public.outlets o where o.org_id = container_std_costs.org_id and public.can_manage_outlet(o.id)));
create policy container_std_costs_admin on public.container_std_costs for all using (public.is_org_admin()) with check (public.is_org_admin());

-- Giá vốn một phần và các thành phần của nó tại một ngày. Dùng công thức đang hiệu lực (không có thì lấy bản mới nhất).
create or replace function public.fn_unit_cost_detail(p_product uuid, p_container text, p_date date)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $fn$
declare
  v_org uuid; v_ml numeric; v_recipe uuid; v_items jsonb; v_missing int; v_nl numeric;
  v_syr numeric; v_pack int; v_pack_bd jsonb;
begin
  select org_id, cost_syrup_ml into v_org, v_ml from products where id = p_product;
  if v_org is null then return null; end if;
  select r.id into v_recipe from recipes r
   where r.product_id = p_product and r.status = 'approved' and r.valid_from <= p_date and (r.valid_to is null or r.valid_to > p_date)
   order by r.valid_from desc limit 1;
  if v_recipe is null then
    select r.id into v_recipe from recipes r where r.product_id = p_product and r.status = 'approved' order by r.valid_from desc limit 1;
  end if;
  if v_recipe is null then return jsonb_build_object('total', null, 'reason', 'no_recipe'); end if;
  select jsonb_agg(jsonb_build_object('ingredient_id', i.id, 'name', i.name, 'qty', ri.qty, 'unit', i.unit, 'cost_per_unit', c.cost_per_unit,
                                      'cost', round(ri.qty * c.cost_per_unit)) order by i.sort_order),
         count(*) filter (where c.cost_per_unit is null), sum(ri.qty * c.cost_per_unit)
    into v_items, v_missing, v_nl
    from recipe_items ri join ingredients i on i.id = ri.ingredient_id
    left join lateral (select s.cost_per_unit from ingredient_std_costs s
                        where s.org_id = v_org and s.ingredient_id = ri.ingredient_id and s.valid_from <= p_date
                        order by s.valid_from desc limit 1) c on true
   where ri.recipe_id = v_recipe;
  select s.cost_per_unit into v_syr from ingredient_std_costs s join ingredients i on i.id = s.ingredient_id
   where s.org_id = v_org and i.code = 'syrup' and s.valid_from <= p_date order by s.valid_from desc limit 1;
  select k.cost_vnd, k.breakdown into v_pack, v_pack_bd from container_std_costs k
   where k.org_id = v_org and k.container = coalesce(p_container, 'chai') and k.valid_from <= p_date order by k.valid_from desc limit 1;
  if coalesce(v_missing, 0) > 0 or v_items is null or v_pack is null or (v_ml > 0 and v_syr is null) then
    return jsonb_build_object('total', null, 'reason', 'missing_cost', 'items', v_items);
  end if;
  return jsonb_build_object(
    'total', round(v_nl + v_ml * coalesce(v_syr, 0) + v_pack)::int,
    'ingredients', round(v_nl)::int, 'syrup', round(v_ml * coalesce(v_syr, 0))::int, 'syrup_ml', v_ml,
    'packaging', v_pack, 'packaging_breakdown', v_pack_bd, 'items', v_items, 'recipe_id', v_recipe);
end $fn$;

create or replace function public.fn_unit_cost(p_product uuid, p_container text, p_date date)
returns integer language sql stable security definer set search_path to 'public' as $fn$
  select (public.fn_unit_cost_detail(p_product, p_container, p_date)->>'total')::int
$fn$;

-- Chụp giá vốn vào dòng đơn lúc ghi đơn, để đổi giá sau này không làm sai báo cáo cũ
create or replace function public.trg_order_line_cost() returns trigger language plpgsql security definer set search_path to 'public' as $fn$
begin
  if new.unit_cost_vnd is null then
    new.unit_cost_vnd := public.fn_unit_cost(new.product_id, coalesce(new.container, 'chai'),
      coalesce((select o.business_date from orders o where o.id = new.order_id), public.vn_today()));
  end if;
  return new;
end $fn$;
create or replace trigger order_line_cost before insert on public.order_lines for each row execute function public.trg_order_line_cost();
