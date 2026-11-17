-- 0057 · Trừ kho lúc bán, Ghi cuối ngày (Tùng chốt 17/11 10:48, thiết kế Z01–Z11).
-- 1) Không dùng ghi Nấu nữa. Mỗi đơn (kể cả đơn tặng) trừ nguyên liệu theo công thức, syrup (ít đường 20 ml) và bao bì ngay lúc lưu.
--    Dùng reason 'sale_packaging' sẵn có cho mọi dòng trừ lúc bán (không đổi ràng buộc reason; view tồn kho đã tính reason này là "đã dùng").
--    Hủy, sửa đơn: _reverse_order_core đã đảo mọi stock_movements gắn với đơn, không cần đổi.
-- 2) Ghi cuối ngày: bảng day_ends, day_end_lines. Chỉ ghi chai hủy, chai tồn, kiểm tiền (tùy chọn). Không khóa ngày.
--    Chai hủy trừ nguyên liệu, syrup, bao bì chai. Chai tồn chỉ để thống kê. Hoàn tác = đảo dòng kho, đổi status.
-- 3) Báo cáo lãi: chai hủy lấy thêm từ day_ends.
-- 4) Bù kho Phan Văn Hớn: mốc kiểm kê 15/11. Trừ cho các đơn từ 16/11; cộng lại nguyên liệu (không gồm bao bì, đã đặt lại 0) của lần ghi nấu 16/11 để không trừ hai lần.
create or replace function public.outlet_deduct_on_sale(p_outlet uuid) returns boolean
language sql stable security definer set search_path to 'public' as $fn$
  select coalesce((select (settings->>'deduct_on_sale')::boolean from outlets where id = p_outlet), true)
$fn$;

-- Lượng kho cần cho p_qty phần của một món: nguyên liệu theo công thức, syrup, bao bì theo chai hoặc cốc
create or replace function public._parts_stock_need(p_product uuid, p_recipe uuid, p_container text, p_sugar text, p_qty numeric)
returns table (ingredient_id uuid, qty numeric) language sql stable security definer set search_path to 'public' as $fn$
  select ri.ingredient_id, ri.qty * p_qty from recipe_items ri where ri.recipe_id = p_recipe
  union all
  select i.id, (case when p_sugar = 'less' then least(pd.cost_syrup_ml, 20) else pd.cost_syrup_ml end) * p_qty
    from products pd join ingredients i on i.org_id = pd.org_id and i.code = 'syrup'
   where pd.id = p_product and pd.cost_syrup_ml > 0
  union all
  select i.id, p_qty from products pd join ingredients i on i.org_id = pd.org_id
   where pd.id = p_product and i.code = any (case when coalesce(p_container, 'chai') = 'coc'
         then array['ly_giay', 'ong_hut', 'nhan'] else array['chai_330', 'nhan', 'card', 'day_gai'] end)
$fn$;
revoke execute on function public._parts_stock_need(uuid, uuid, text, text, numeric) from public, anon, authenticated;

create or replace function public._apply_sale_stock(p_order uuid) returns void
language plpgsql security definer set search_path to 'public' as $fn$
declare v orders;
begin
  select * into v from orders where id = p_order;
  if not found then return; end if;
  insert into stock_movements (outlet_id, ingredient_id, qty_delta, reason, ref_table, ref_id, business_date)
  select v.outlet_id, n.ingredient_id, -sum(n.qty), 'sale_packaging', 'orders', v.id, v.business_date
    from order_lines l, lateral public._parts_stock_need(l.product_id, l.recipe_id, l.container, l.sugar, l.qty) n
   where l.order_id = p_order
   group by n.ingredient_id having sum(n.qty) > 0;
end $fn$;
revoke execute on function public._apply_sale_stock(uuid) from public, anon, authenticated;

create table if not exists public.day_ends (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id),
  client_id uuid unique,
  business_date date not null,
  status text not null default 'active' check (status in ('active', 'reversed')),
  left_total integer not null default 0,
  waste_total integer not null default 0,
  cash_counted_vnd integer check (cash_counted_vnd >= 0),
  transfer_counted_vnd integer check (transfer_counted_vnd >= 0),
  cash_open_vnd integer,
  expected_cash_vnd integer,
  expected_transfer_vnd integer,
  money_note text,
  created_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now(),
  reversed_by uuid references public.profiles(id),
  reversed_at timestamptz
);
create unique index if not exists day_ends_one_active on public.day_ends (outlet_id, business_date) where status = 'active';
create table if not exists public.day_end_lines (
  id uuid primary key default gen_random_uuid(),
  day_end_id uuid not null references public.day_ends(id) on delete cascade,
  product_id uuid not null references public.products(id),
  left_qty integer not null default 0 check (left_qty >= 0),
  waste_qty integer not null default 0 check (waste_qty >= 0)
);
create index if not exists day_end_lines_day_end on public.day_end_lines (day_end_id);
alter table public.day_ends enable row level security;
alter table public.day_end_lines enable row level security;
create policy day_ends_read on public.day_ends for select using (public.can_access_outlet(outlet_id));
create policy day_end_lines_read on public.day_end_lines for select using (
  exists (select 1 from public.day_ends d where d.id = day_end_lines.day_end_id and public.can_access_outlet(d.outlet_id)));

create or replace function public.fn_post_day_end(p jsonb) returns jsonb
language plpgsql security definer set search_path to 'public' as $fn$
declare
  v_outlet uuid := (p->>'outlet_id')::uuid;
  v_client uuid := nullif(p->>'client_id', '')::uuid;
  v_date date := coalesce(nullif(p->>'business_date', '')::date, public.vn_today());
  v_cash int := nullif(p->>'cash_counted_vnd', '')::int;
  v_tr int := nullif(p->>'transfer_counted_vnd', '')::int;
  v_id uuid; v_left int; v_waste int; v_ecash int; v_etr int; v_open int;
begin
  if auth.uid() is null or not public.can_access_outlet(v_outlet) then
    raise exception 'Bạn không có quyền ghi cuối ngày ở cơ sở này' using errcode = '42501';
  end if;
  if v_client is not null then
    select id into v_id from day_ends where client_id = v_client;
    if found then return jsonb_build_object('id', v_id, 'duplicate', true); end if;
  end if;
  if v_date > public.vn_today() then raise exception 'Không ghi cuối ngày cho ngày chưa tới' using errcode = 'P0001'; end if;
  if exists (select 1 from day_ends where outlet_id = v_outlet and business_date = v_date and status = 'active') then
    raise exception 'Ngày % đã ghi cuối ngày. Hoàn tác bản đó trước khi ghi lại.', to_char(v_date, 'DD/MM') using errcode = 'P0001';
  end if;
  if exists (select 1 from jsonb_array_elements(coalesce(p->'lines', '[]'::jsonb)) x
              where coalesce((x->>'left_qty')::int, 0) < 0 or coalesce((x->>'waste_qty')::int, 0) < 0) then
    raise exception 'Số chai không được âm' using errcode = 'P0001';
  end if;
  select coalesce(sum(total_vnd) filter (where payment_method = 'cash'), 0), coalesce(sum(total_vnd) filter (where payment_method = 'transfer'), 0)
    into v_ecash, v_etr from orders where outlet_id = v_outlet and business_date = v_date and status = 'active' and not is_gift;
  select amount_vnd into v_open from cash_opens where outlet_id = v_outlet and business_date = v_date order by created_at desc limit 1;

  insert into day_ends (outlet_id, client_id, business_date, cash_counted_vnd, transfer_counted_vnd, cash_open_vnd, expected_cash_vnd, expected_transfer_vnd, money_note)
  values (v_outlet, v_client, v_date, v_cash, v_tr, v_open, v_ecash, v_etr, nullif(btrim(coalesce(p->>'money_note', '')), ''))
  returning id into v_id;
  insert into day_end_lines (day_end_id, product_id, left_qty, waste_qty)
  select v_id, (x->>'product_id')::uuid, coalesce((x->>'left_qty')::int, 0), coalesce((x->>'waste_qty')::int, 0)
    from jsonb_array_elements(coalesce(p->'lines', '[]'::jsonb)) x
   where coalesce((x->>'left_qty')::int, 0) > 0 or coalesce((x->>'waste_qty')::int, 0) > 0;
  select coalesce(sum(left_qty), 0), coalesce(sum(waste_qty), 0) into v_left, v_waste from day_end_lines where day_end_id = v_id;
  update day_ends set left_total = v_left, waste_total = v_waste where id = v_id;

  -- Chai hủy: đã nấu, không bán được, nên trừ nguyên liệu, syrup và bao bì chai theo công thức đang dùng
  insert into stock_movements (outlet_id, ingredient_id, qty_delta, reason, ref_table, ref_id, business_date)
  select v_outlet, n.ingredient_id, -sum(n.qty), 'waste', 'day_ends', v_id, v_date
    from day_end_lines l, lateral public._parts_stock_need(l.product_id, public.current_recipe(l.product_id, v_date), 'chai', null, l.waste_qty) n
   where l.day_end_id = v_id and l.waste_qty > 0
   group by n.ingredient_id having sum(n.qty) > 0;
  return jsonb_build_object('id', v_id, 'left_total', v_left, 'waste_total', v_waste, 'expected_cash_vnd', v_ecash, 'expected_transfer_vnd', v_etr, 'cash_open_vnd', v_open);
end $fn$;

create or replace function public.fn_reverse_day_end(p_id uuid) returns jsonb
language plpgsql security definer set search_path to 'public' as $fn$
declare v day_ends;
begin
  select * into v from day_ends where id = p_id for update;
  if not found or auth.uid() is null or not public.can_access_outlet(v.outlet_id) then
    raise exception 'Không tìm thấy bản ghi cuối ngày' using errcode = '42501';
  end if;
  if v.status <> 'active' then raise exception 'Bản ghi này đã hoàn tác rồi' using errcode = 'P0001'; end if;
  update day_ends set status = 'reversed', reversed_by = auth.uid(), reversed_at = now() where id = p_id;
  insert into stock_movements (outlet_id, ingredient_id, qty_delta, reason, ref_table, ref_id, business_date)
  select outlet_id, ingredient_id, -qty_delta, 'reversal', 'day_ends', p_id, business_date
    from stock_movements where ref_table = 'day_ends' and ref_id = p_id and reason = 'waste';
  return jsonb_build_object('id', p_id, 'reversed', true);
end $fn$;
revoke execute on function public.fn_post_day_end(jsonb) from public, anon;
revoke execute on function public.fn_reverse_day_end(uuid) from public, anon;

create or replace function public.fn_post_order(p jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v_outlet uuid := (p->>'outlet_id')::uuid;
  v_client uuid := nullif(p->>'client_id', '')::uuid;
  v_date date := coalesce(nullif(p->>'business_date', '')::date, public.vn_today());
  v_gift boolean := coalesce((p->>'is_gift')::boolean, false);
  v_disc int := coalesce(nullif(p->>'discount_vnd', '')::int, 0);
  v_pct int := nullif(p->>'discount_pct', '')::int;       -- 5 hoặc 10 = giảm theo từng phần
  v_parts int := nullif(p->>'discount_parts', '')::int;   -- null = cả đơn; N = N phần giá cao nhất
  v_ex orders; v_id uuid; v_seq int; v_total int := 0; v_price int; r record;
  v_pay text := nullif(btrim(coalesce(p->>'payment_method', '')), '');
  v_cust text := nullif(btrim(coalesce(p->>'customer_name', '')), '');
  v_ids uuid[] := '{}'; v_lid uuid; v_k int; v_unit int;
begin
  if auth.uid() is null or not public.can_access_outlet(v_outlet) then
    raise exception 'Bạn không có quyền ghi đơn ở cơ sở này' using errcode = '42501';
  end if;
  if v_client is not null then
    select * into v_ex from orders where client_id = v_client;
    if found then
      return jsonb_build_object('id', v_ex.id, 'seq_in_day', v_ex.seq_in_day, 'total_vnd', v_ex.total_vnd,
                                'discount_vnd', v_ex.discount_vnd, 'business_date', v_ex.business_date, 'duplicate', true);
    end if;
  end if;
  if coalesce(p->>'channel', 'counter') <> 'aggregate'
     and exists (select 1 from day_closes where outlet_id = v_outlet and business_date = v_date and is_current) then
    raise exception 'Ngày % đã chốt, không ghi thêm đơn được', to_char(v_date, 'DD/MM') using errcode = 'P0001';
  end if;
  if jsonb_array_length(coalesce(p->'lines', '[]'::jsonb)) = 0 then
    raise exception 'Đơn chưa có món nào' using errcode = 'P0001';
  end if;
  if v_disc < 0 then raise exception 'Giảm giá không được là số âm' using errcode = 'P0001'; end if;
  if v_pct is not null and v_pct not in (5, 10) then raise exception 'Chỉ giảm giá 5%% hoặc 10%%' using errcode = 'P0001'; end if;
  if v_parts is not null and v_parts <= 0 then raise exception 'Số phần được giảm phải lớn hơn 0' using errcode = 'P0001'; end if;
  if v_gift then v_disc := 0; v_pct := null; end if;
  if v_pct is not null then v_disc := 0; end if;

  perform pg_advisory_xact_lock(hashtext(v_outlet::text || v_date::text));
  select coalesce(max(seq_in_day), 0) + 1 into v_seq from orders
   where outlet_id = v_outlet and business_date = v_date and seq_in_day > 0;

  if v_pay is not null and v_pay not in ('cash', 'transfer') then
    raise exception 'Cách nhận tiền không hợp lệ: %', v_pay using errcode = 'P0001';
  end if;
  insert into orders (outlet_id, client_id, seq_in_day, business_date, channel, is_gift, note, placed_at, payment_method, customer_name)
  values (v_outlet, v_client, v_seq, v_date, coalesce(p->>'channel', 'counter'), v_gift, p->>'note',
          coalesce(nullif(p->>'placed_at', '')::timestamptz, now()),
          case when v_gift then null else v_pay end, left(v_cust, 80))
  returning id into v_id;

  for r in select (x->>'product_id')::uuid as product_id, (x->>'qty')::int as qty,
                  coalesce(nullif(x->>'container', ''), 'chai') as container,
                  nullif(x->>'sugar', '') as sugar
             from jsonb_array_elements(p->'lines') x loop
    continue when r.qty is null or r.qty <= 0;
    if r.container not in ('chai', 'coc') then
      raise exception 'Loại bao bì không hợp lệ: %', r.container using errcode = 'P0001';
    end if;
    if r.sugar is not null and r.sugar <> 'less' then
      raise exception 'Ghi chú đường không hợp lệ: %', r.sugar using errcode = 'P0001';
    end if;
    if v_gift then v_price := 0;
    else
      v_price := public.current_price(v_outlet, r.product_id, v_date);
      if v_price is null then raise exception 'Món chưa có giá niêm yết' using errcode = 'P0001'; end if;
    end if;
    insert into order_lines (order_id, product_id, qty, unit_price_vnd, recipe_id, line_total_vnd, container, sugar)
    values (v_id, r.product_id, r.qty, v_price, public.current_recipe(r.product_id, v_date), v_price * r.qty, r.container, r.sugar)
    returning id into v_lid;
    v_ids := v_ids || v_lid;
    v_total := v_total + v_price * r.qty;
    insert into stock_movements (outlet_id, ingredient_id, qty_delta, reason, ref_table, ref_id, business_date)
    select v_outlet, pr.ingredient_id, -pr.qty_per_unit * r.qty, 'sale_packaging', 'orders', v_id, v_date
      from packaging_rules pr join products pd on pd.kind = pr.product_kind and pd.org_id = pr.org_id
     where pd.id = r.product_id and pr.consume_at = 'sale';
  end loop;

  -- Giảm 5% hoặc 10%: lấy phần giá cao nhất trước; cùng giá thì theo thứ tự dòng trong đơn (app tính y hệt để hiện trước khi lưu)
  if v_pct is not null then
    for r in select id, qty, unit_price_vnd from order_lines where order_id = v_id
              order by unit_price_vnd desc, array_position(v_ids, id) loop
      v_k := case when v_parts is null then r.qty else least(r.qty, v_parts) end;
      exit when v_k <= 0;
      v_unit := round(r.unit_price_vnd * v_pct / 100.0)::int;
      update order_lines set discount_qty = v_k, discount_unit_vnd = v_unit where id = r.id;
      v_disc := v_disc + v_k * v_unit;
      if v_parts is not null then v_parts := v_parts - v_k; end if;
    end loop;
  end if;

  -- Cơ sở trừ kho lúc bán (0057): nguyên liệu theo công thức, syrup, bao bì của mọi dòng trong đơn
  if public.outlet_deduct_on_sale(v_outlet) then perform public._apply_sale_stock(v_id); end if;

  if v_disc > v_total then
    raise exception 'Giảm % lớn hơn tiền đơn %. Sửa lại số giảm giá.',
      to_char(v_disc, 'FM999G999G999'), to_char(v_total, 'FM999G999G999') using errcode = 'P0001';
  end if;
  update orders set total_vnd = v_total - v_disc, discount_vnd = v_disc,
                    discount_reason = case when v_disc > 0 then nullif(p->>'discount_reason', '') end
   where id = v_id;
  return jsonb_build_object('id', v_id, 'seq_in_day', v_seq, 'total_vnd', v_total - v_disc, 'gross_vnd', v_total,
                            'discount_vnd', v_disc, 'business_date', v_date);
end $function$;

create or replace function public.fn_profit_report(p_outlet uuid, p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $fn$
declare r jsonb;
begin
  if not public.can_manage_outlet(p_outlet) then raise exception 'Bạn không có quyền xem báo cáo lãi của cơ sở này' using errcode = '42501'; end if;
  with o as (
    select id, business_date, total_vnd, is_gift from orders
     where outlet_id = p_outlet and status = 'active' and business_date between p_from and p_to
  ), l as (
    select o.business_date, o.is_gift, x.product_id, coalesce(x.container, 'chai') as container, x.qty, x.line_total_vnd - x.discount_qty * x.discount_unit_vnd as line_total_vnd, x.unit_cost_vnd
      from order_lines x join o on o.id = x.order_id
  ), w as (
    select dc.business_date, dl.product_id, dl.waste_qty
      from day_closes dc join day_close_lines dl on dl.day_close_id = dc.id
     where dc.outlet_id = p_outlet and dc.is_current and dc.business_date between p_from and p_to and coalesce(dl.waste_qty, 0) > 0
    union all
    select de.business_date, el.product_id, el.waste_qty
      from day_ends de join day_end_lines el on el.day_end_id = de.id
     where de.outlet_id = p_outlet and de.status = 'active' and de.business_date between p_from and p_to and el.waste_qty > 0
  )
  select jsonb_build_object(
    'from', p_from, 'to', p_to,
    'revenue', (select coalesce(sum(total_vnd), 0) from o),
    'orders', (select count(*) from o),
    'parts', (select coalesce(sum(qty), 0) from l where not is_gift),
    'cogs', (select coalesce(sum(qty * unit_cost_vnd), 0) from l where not is_gift),
    'parts_no_cost', (select coalesce(sum(qty), 0) from l where not is_gift and unit_cost_vnd is null),
    'gift_qty', (select coalesce(sum(qty), 0) from l where is_gift),
    'gift_cost', (select coalesce(sum(qty * unit_cost_vnd), 0) from l where is_gift),
    'waste_qty', (select coalesce(sum(waste_qty), 0) from w),
    'waste_cost', (select coalesce(sum(waste_qty * public.fn_unit_cost(product_id, 'chai', business_date)), 0) from w),
    'by_day', coalesce((select jsonb_agg(jsonb_build_object('d', d, 'revenue', rev, 'parts', parts, 'cogs', cogs) order by d) from (
        select o.business_date d, sum(o.total_vnd) rev,
               (select coalesce(sum(qty), 0) from l where l.business_date = o.business_date and not l.is_gift) parts,
               (select coalesce(sum(qty * unit_cost_vnd), 0) from l where l.business_date = o.business_date and not l.is_gift) cogs
          from o group by o.business_date) t), '[]'::jsonb),
    'by_product', coalesce((select jsonb_agg(jsonb_build_object('product_id', product_id, 'container', container, 'qty', qty, 'revenue', rev, 'cogs', cogs,
                                     'detail', public.fn_unit_cost_detail(product_id, container, p_to)) order by (rev - coalesce(cogs, 0)) desc) from (
        select product_id, container, sum(qty) qty, sum(line_total_vnd) rev, sum(qty * unit_cost_vnd) cogs
          from l where not is_gift group by product_id, container) t), '[]'::jsonb)
  ) into r;
  return r;
end $fn$;

create or replace function public.fn_net_report(p_outlet uuid, p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $fn$
declare
  v_org uuid; v_set jsonb; v_n int; v_start date; r jsonb;
begin
  if not public.can_manage_outlet(p_outlet) then raise exception 'Bạn không có quyền xem báo cáo lãi của cơ sở này' using errcode = '42501'; end if;
  select org_id, coalesce(settings, '{}'::jsonb) into v_org, v_set from outlets where id = p_outlet;
  v_n := greatest(1, coalesce((v_set->>'depr_months')::int, 12));
  v_start := nullif(v_set->>'depr_start', '')::date;
  with m as (
    select generate_series(date_trunc('month', p_from)::date, date_trunc('month', p_to)::date, interval '1 month')::date as mo
  ), o as (
    select id, date_trunc('month', business_date)::date mo, total_vnd, is_gift from orders
     where outlet_id = p_outlet and status = 'active' and business_date >= date_trunc('month', p_from)::date
       and business_date < (date_trunc('month', p_to) + interval '1 month')::date
  ), l as (
    select o.mo, o.is_gift, x.qty, x.unit_cost_vnd from order_lines x join o on o.id = x.order_id
  ), w as (
    select date_trunc('month', dc.business_date)::date mo, dl.waste_qty, public.fn_unit_cost(dl.product_id, 'chai', dc.business_date) uc
      from day_closes dc join day_close_lines dl on dl.day_close_id = dc.id
     where dc.outlet_id = p_outlet and dc.is_current and coalesce(dl.waste_qty, 0) > 0
    union all
    select date_trunc('month', de.business_date)::date, el.waste_qty, public.fn_unit_cost(el.product_id, 'chai', de.business_date)
      from day_ends de join day_end_lines el on el.day_end_id = de.id
     where de.outlet_id = p_outlet and de.status = 'active' and el.waste_qty > 0
  ), e as (
    select x.id, x.amount_vnd, x.spent_on, c.group_code, c.code, c.name, c.sort_order,
           coalesce(x.period_from, date_trunc('month', x.spent_on)::date) pf,
           coalesce(x.period_to, x.period_from, date_trunc('month', x.spent_on)::date) pt
      from expenses x join expense_categories c on c.id = x.category_id
     where x.outlet_id = p_outlet and x.status = 'active'
  ), ox as (
    select m.mo, e.code, e.name, min(e.sort_order) so,
           sum(e.amount_vnd::numeric / ((extract(year from age(e.pt, e.pf)) * 12 + extract(month from age(e.pt, e.pf)) + 1))) amt
      from m join e on e.group_code = 'van_hanh' and m.mo between e.pf and e.pt
     group by m.mo, e.code, e.name
  ), dp as (
    select m.mo, sum(e.amount_vnd::numeric / v_n) amt
      from m join e on e.group_code = 'dau_tu'
       and m.mo >= greatest(date_trunc('month', e.spent_on)::date, coalesce(v_start, date_trunc('month', e.spent_on)::date))
       and m.mo < (greatest(date_trunc('month', e.spent_on)::date, coalesce(v_start, date_trunc('month', e.spent_on)::date)) + make_interval(months => v_n))::date
     group by m.mo
  )
  select jsonb_build_object(
    'depr_months', v_n, 'depr_start', v_start,
    'invest_total', (select coalesce(sum(amount_vnd), 0) from e where group_code = 'dau_tu'),
    'invest_by_cat', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'amount', amt) order by amt desc) from (select name, sum(amount_vnd) amt from e where group_code = 'dau_tu' group by name) t), '[]'::jsonb),
    'opex_cats', coalesce((select jsonb_agg(jsonb_build_object('code', code, 'name', name) order by sort_order) from expense_categories
                            where org_id = v_org and group_code = 'van_hanh' and status = 'active' and parent_id is null), '[]'::jsonb),
    'months', coalesce((select jsonb_agg(jsonb_build_object(
        'month', m.mo,
        'revenue', (select coalesce(sum(total_vnd), 0) from o where o.mo = m.mo),
        'orders', (select count(*) from o where o.mo = m.mo),
        'parts', (select coalesce(sum(qty), 0) from l where l.mo = m.mo and not is_gift),
        'cogs', (select coalesce(sum(qty * unit_cost_vnd), 0) from l where l.mo = m.mo and not is_gift),
        'parts_no_cost', (select coalesce(sum(qty), 0) from l where l.mo = m.mo and not is_gift and unit_cost_vnd is null),
        'gift_qty', (select coalesce(sum(qty), 0) from l where l.mo = m.mo and is_gift),
        'gift_cost', (select coalesce(sum(qty * unit_cost_vnd), 0) from l where l.mo = m.mo and is_gift),
        'waste_qty', (select coalesce(sum(waste_qty), 0) from w where w.mo = m.mo),
        'waste_cost', (select coalesce(sum(waste_qty * uc), 0) from w where w.mo = m.mo),
        'opex', coalesce((select jsonb_agg(jsonb_build_object('code', code, 'name', name, 'amount', round(amt)) order by so) from ox where ox.mo = m.mo), '[]'::jsonb),
        'opex_total', (select coalesce(round(sum(amt)), 0) from ox where ox.mo = m.mo),
        'depreciation', (select coalesce(round(sum(amt)), 0) from dp where dp.mo = m.mo),
        'cash', jsonb_build_object(
          'nguyen_lieu', (select coalesce(sum(amount_vnd), 0) from e where group_code = 'nguyen_lieu' and date_trunc('month', spent_on)::date = m.mo),
          'vat_tu', (select coalesce(sum(amount_vnd), 0) from e where group_code = 'vat_tu' and date_trunc('month', spent_on)::date = m.mo),
          'van_hanh', (select coalesce(sum(amount_vnd), 0) from e where group_code = 'van_hanh' and date_trunc('month', spent_on)::date = m.mo),
          'dau_tu', (select coalesce(sum(amount_vnd), 0) from e where group_code = 'dau_tu' and date_trunc('month', spent_on)::date = m.mo)),
        'historical_revenue', (select coalesce(sum(amount_vnd), 0) from historical_entries h where h.outlet_id = p_outlet and h.month = m.mo and h.kind = 'revenue')
      ) order by m.mo) from m), '[]'::jsonb)
  ) into r;
  return r;
end $fn$;


-- 4) Bù kho Phan Văn Hớn từ mốc kiểm kê 15/11
do $$
declare o uuid := '3e1f4df8-6dcb-4593-85a4-2bef47468f42'; r record;
begin
  for r in select id from orders where outlet_id = o and status = 'active' and business_date >= date '2026-11-16'
              and not exists (select 1 from stock_movements m where m.ref_table = 'orders' and m.ref_id = orders.id) loop
    perform public._apply_sale_stock(r.id);
  end loop;
  -- Lần ghi nấu 16/11 (5 Sáng Trí Tuệ, 3 Sáng Hồng Hào) đã trừ nguyên liệu; cộng lại để các chai đó chỉ bị trừ một lần, lúc bán
  insert into stock_movements (outlet_id, ingredient_id, qty_delta, reason, ref_table, ref_id, business_date)
  select m.outlet_id, m.ingredient_id, -m.qty_delta, 'reversal', 'cook_runs', m.ref_id, m.business_date
    from stock_movements m join ingredients i on i.id = m.ingredient_id
   where m.ref_table = 'cook_runs' and m.ref_id = '5b91c601-3eb3-4195-912a-dac332298725' and m.reason in ('cook', 'batch_use') and i.grp <> 'packaging'
     and not exists (select 1 from stock_movements x where x.ref_table = 'cook_runs' and x.ref_id = m.ref_id and x.reason = 'reversal');
end $$;
