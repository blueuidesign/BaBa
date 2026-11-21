-- 0065 · Món Buffet: tự chọn nguyên liệu và giá cho từng chai, cốc
-- Vì sao: Tùng 21/11/2026 (thiết kế BF01–BF05). Khách tự chọn nguyên liệu; giá mặc định 30.000 đ, chỉnh ±5.000 đ;
--   nguyên liệu lần đầu 20 g, sau đó ±5 g; không giới hạn; bán được chai và cốc giấy.
-- Thay đổi:
--   1) products.is_custom: món tự chọn (giá và nguyên liệu theo từng dòng đơn). Thêm món "Buffet" cuối dòng Mầm Xanh,
--      giá mặc định 30.000 đ, bật ở mọi cơ sở. Màu #C98A4B là màu riêng: app vẽ chai, cốc nhiều tầng màu cho màu này.
--   2) Bảng order_line_items: nguyên liệu và lượng (g, ml) mỗi phần của một dòng Buffet. Chỉ thêm qua hàm.
--   3) fn_post_order: dòng của món tự chọn nhận price và custom [{ingredient_id, qty}], không dùng công thức.
--      Giá vốn = nguyên liệu × giá chuẩn + syrup + bao bì (_custom_unit_cost).
--   4) _apply_sale_stock: trừ kho thêm nguyên liệu tự chọn. fn_move_orders: chép cả nguyên liệu tự chọn.
--   5) fn_buffet_ingredients(outlet): nguyên liệu chọn được, xếp theo mức hay dùng (Buffet và các món khác, 30 ngày).
-- Tương thích ngược: món thường không đổi; app cũ không thấy Buffet có giá đặc biệt nhưng không gửi được dòng Buffet thiếu nguyên liệu.
-- Kiểm thử: tests/db/t_11_buffet.sql

alter table public.products add column if not exists is_custom boolean not null default false;
comment on column public.products.is_custom is 'Món tự chọn (Buffet): giá và nguyên liệu nằm ở từng dòng đơn (order_line_items), không theo bảng giá, công thức';

create table if not exists public.order_line_items (
  order_line_id uuid not null references public.order_lines(id),
  ingredient_id uuid not null references public.ingredients(id),
  qty numeric not null check (qty > 0),
  primary key (order_line_id, ingredient_id)
);
comment on table public.order_line_items is 'Nguyên liệu tự chọn của một dòng đơn món Buffet: lượng cho MỘT phần (g hoặc ml)';
alter table public.order_line_items enable row level security;
drop policy if exists order_line_items_read on public.order_line_items;
create policy order_line_items_read on public.order_line_items for select to authenticated
  using (exists (select 1 from order_lines l join orders o on o.id = l.order_id
                  where l.id = order_line_items.order_line_id and public.can_access_outlet(o.outlet_id)));
revoke all on public.order_line_items from anon;
grant select on public.order_line_items to authenticated;

-- Món Buffet cho mỗi tổ chức đang có món Mầm Đỏ (dòng Mầm Xanh)
insert into public.products (org_id, code, name, short_name, line, color, kind, sort_order, status, cost_syrup_ml, is_custom)
select p.org_id, 'buffet', 'Buffet', 'Buffet', p.line, '#C98A4B', p.kind, 16, 'active', p.cost_syrup_ml, true
  from public.products p where p.code = 'md'
on conflict (org_id, code) do nothing;
insert into public.product_prices (price_list_id, product_id, price_vnd, valid_from)
select pl.id, p.id, 30000, date '2026-11-21'
  from public.products p join public.price_lists pl on pl.org_id = p.org_id
 where p.code = 'buffet'
   and not exists (select 1 from public.product_prices x where x.product_id = p.id and x.price_list_id = pl.id);
insert into public.outlet_menu (outlet_id, product_id, enabled, sort_order)
select o.id, p.id, true, 16 from public.outlets o join public.products p on p.org_id = o.org_id and p.code = 'buffet'
on conflict do nothing;

-- Giá vốn một phần của dòng tự chọn: nguyên liệu × giá chuẩn + syrup + bao bì. Thiếu giá chuẩn của món nào thì trả null.
create or replace function public._custom_unit_cost(p_line uuid, p_date date)
returns integer language plpgsql stable security definer set search_path to 'public' as $function$
declare l order_lines; v_org uuid; v_ml numeric; v_nl numeric; v_missing int; v_syr numeric; v_pack int;
begin
  select * into l from order_lines where id = p_line;
  select pd.org_id, case when l.sugar = 'less' then least(pd.cost_syrup_ml, 20) else pd.cost_syrup_ml end
    into v_org, v_ml from products pd where pd.id = l.product_id;
  select sum(i.qty * c.cost_per_unit), count(*) filter (where c.cost_per_unit is null) into v_nl, v_missing
    from order_line_items i
    left join lateral (select s.cost_per_unit from ingredient_std_costs s
                        where s.org_id = v_org and s.ingredient_id = i.ingredient_id and s.valid_from <= p_date
                        order by s.valid_from desc limit 1) c on true
   where i.order_line_id = p_line;
  select s.cost_per_unit into v_syr from ingredient_std_costs s join ingredients g on g.id = s.ingredient_id
   where s.org_id = v_org and g.code = 'syrup' and s.valid_from <= p_date order by s.valid_from desc limit 1;
  select k.cost_vnd into v_pack from container_std_costs k
   where k.org_id = v_org and k.container = coalesce(l.container, 'chai') and k.valid_from <= p_date order by k.valid_from desc limit 1;
  if coalesce(v_missing, 0) > 0 or v_nl is null or v_pack is null or (v_ml > 0 and v_syr is null) then return null; end if;
  return round(v_nl + v_ml * coalesce(v_syr, 0) + v_pack)::int;
end $function$;

-- Trừ kho lúc bán: như 0057, cộng thêm nguyên liệu tự chọn của dòng Buffet
create or replace function public._apply_sale_stock(p_order uuid)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare v orders; v_parts int; v_org uuid;
begin
  select * into v from orders where id = p_order;
  if not found then return; end if;
  insert into stock_movements (outlet_id, ingredient_id, qty_delta, reason, ref_table, ref_id, business_date)
  select v.outlet_id, n.ingredient_id, -sum(n.qty), 'sale_packaging', 'orders', v.id, v.business_date
    from (select x.ingredient_id, x.qty
            from order_lines l, lateral public._parts_stock_need(l.product_id, l.recipe_id, l.container, l.sugar, l.qty) x
           where l.order_id = p_order
          union all
          select i.ingredient_id, i.qty * l.qty
            from order_lines l join order_line_items i on i.order_line_id = l.id
           where l.order_id = p_order) n
   group by n.ingredient_id having sum(n.qty) > 0;

  select coalesce(sum(qty), 0) into v_parts from order_lines where order_id = p_order;
  if v_parts > 0 then
    select org_id into v_org from outlets where id = v.outlet_id;
    insert into stock_movements (outlet_id, ingredient_id, qty_delta, reason, ref_table, ref_id, business_date)
    select v.outlet_id, i.id, -(case i.code when 'tui_2' then v_parts / 2 else v_parts % 2 end), 'sale_packaging', 'orders', v.id, v.business_date
      from ingredients i
     where i.org_id = v_org and i.code in ('tui', 'tui_2')
       and (case i.code when 'tui_2' then v_parts / 2 else v_parts % 2 end) > 0;
  end if;
end $function$;

-- Nguyên liệu chọn được cho Buffet, hay dùng nhất ở trên: số lần chọn trong Buffet 30 ngày, rồi lượng đã dùng 30 ngày
create or replace function public.fn_buffet_ingredients(p_outlet uuid)
returns table (ingredient_id uuid, name text, unit text, picks int, used numeric)
language sql stable security definer set search_path to 'public' as $function$
  select i.id, i.name, i.unit,
         (select count(*)::int from order_line_items x join order_lines l on l.id = x.order_line_id join orders o on o.id = l.order_id
           where x.ingredient_id = i.id and o.outlet_id = p_outlet and o.status = 'active' and o.business_date >= public.vn_today() - 30),
         coalesce((select -sum(m.qty_delta) from stock_movements m
                    where m.ingredient_id = i.id and m.outlet_id = p_outlet and m.ref_table = 'orders'
                      and m.business_date >= public.vn_today() - 30), 0)
    from ingredients i join outlets ot on ot.id = p_outlet and ot.org_id = i.org_id
   where public.can_access_outlet(p_outlet) and i.status = 'active' and i.grp in ('main', 'additive')
   order by 4 desc, 5 desc, i.sort_order
$function$;
revoke all on function public.fn_buffet_ingredients(uuid) from public, anon;
grant execute on function public.fn_buffet_ingredients(uuid) to authenticated;

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
  v_kind text := nullif(p->>'discount_kind', '');          -- pct | per_part | order (0063)
  v_amt int := nullif(p->>'discount_amount', '')::int;     -- per_part: đồng mỗi phần; order: đồng cho cả đơn
  v_custom boolean; v_org uuid;
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
  if v_kind is null and v_pct is not null then v_kind := 'pct'; end if;
  if v_kind is not null and v_kind not in ('pct', 'per_part', 'order') then
    raise exception 'Kiểu giảm giá không hợp lệ: %', v_kind using errcode = 'P0001';
  end if;
  if v_kind = 'pct' and v_pct is null then raise exception 'Chưa chọn mức giảm 5%% hoặc 10%%' using errcode = 'P0001'; end if;
  if v_kind in ('per_part', 'order') and (v_amt is null or v_amt <= 0) then
    raise exception 'Số tiền giảm phải lớn hơn 0' using errcode = 'P0001';
  end if;
  if v_kind = 'order' then v_parts := null; end if;
  if v_gift then v_disc := 0; v_pct := null; v_kind := null; end if;
  if v_kind is not null then v_disc := 0; end if;

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

  select org_id into v_org from outlets where id = v_outlet;
  for r in select (x->>'product_id')::uuid as product_id, (x->>'qty')::int as qty,
                  coalesce(nullif(x->>'container', ''), 'chai') as container,
                  nullif(x->>'sugar', '') as sugar,
                  nullif(x->>'price', '')::int as cprice, coalesce(x->'custom', '[]'::jsonb) as custom
             from jsonb_array_elements(p->'lines') x loop
    continue when r.qty is null or r.qty <= 0;
    if r.container not in ('chai', 'coc') then
      raise exception 'Loại bao bì không hợp lệ: %', r.container using errcode = 'P0001';
    end if;
    if r.sugar is not null and r.sugar <> 'less' then
      raise exception 'Ghi chú đường không hợp lệ: %', r.sugar using errcode = 'P0001';
    end if;
    -- Món tự chọn (Buffet, 0065): giá và nguyên liệu theo từng dòng, không theo bảng giá và công thức
    select coalesce(is_custom, false) into v_custom from products where id = r.product_id and org_id = v_org;
    if v_custom is null then raise exception 'Món không thuộc cơ sở này' using errcode = 'P0001'; end if;
    if v_custom and not exists (select 1 from jsonb_array_elements(r.custom) c where (c->>'qty')::numeric > 0) then
      raise exception 'Buffet chưa chọn nguyên liệu. Bấm Thêm ở ít nhất một nguyên liệu.' using errcode = 'P0001';
    end if;
    if v_gift then v_price := 0;
    elsif v_custom then
      v_price := coalesce(r.cprice, public.current_price(v_outlet, r.product_id, v_date));
      if v_price is null or v_price < 0 then raise exception 'Giá Buffet không hợp lệ' using errcode = 'P0001'; end if;
    else
      v_price := public.current_price(v_outlet, r.product_id, v_date);
      if v_price is null then raise exception 'Món chưa có giá niêm yết' using errcode = 'P0001'; end if;
    end if;
    insert into order_lines (order_id, product_id, qty, unit_price_vnd, recipe_id, line_total_vnd, container, sugar)
    values (v_id, r.product_id, r.qty, v_price, case when v_custom then null else public.current_recipe(r.product_id, v_date) end,
            v_price * r.qty, r.container, r.sugar)
    returning id into v_lid;
    if v_custom then
      insert into order_line_items (order_line_id, ingredient_id, qty)
      select v_lid, i.id, sum((c->>'qty')::numeric)
        from jsonb_array_elements(r.custom) c join ingredients i on i.id = (c->>'ingredient_id')::uuid and i.org_id = v_org
       where (c->>'qty')::numeric > 0
       group by i.id;
      update order_lines set unit_cost_vnd = public._custom_unit_cost(v_lid, v_date) where id = v_lid;
    end if;
    v_ids := v_ids || v_lid;
    v_total := v_total + v_price * r.qty;
    insert into stock_movements (outlet_id, ingredient_id, qty_delta, reason, ref_table, ref_id, business_date)
    select v_outlet, pr.ingredient_id, -pr.qty_per_unit * r.qty, 'sale_packaging', 'orders', v_id, v_date
      from packaging_rules pr join products pd on pd.kind = pr.product_kind and pd.org_id = pr.org_id
     where pd.id = r.product_id and pr.consume_at = 'sale';
  end loop;

  -- Đơn phải có ít nhất một dòng số lượng > 0 (0063: trước đây dòng 0 bị bỏ qua và vẫn lưu được đơn rỗng)
  if cardinality(v_ids) = 0 then
    raise exception 'Đơn chưa có món nào. Chọn ít nhất một món rồi lưu lại.' using errcode = 'P0001';
  end if;

  -- Giảm 5%/10% hoặc giảm số tiền mỗi phần: lấy phần giá cao nhất trước; cùng giá thì theo thứ tự dòng (app tính y hệt)
  if v_kind in ('pct', 'per_part') then
    for r in select id, qty, unit_price_vnd from order_lines where order_id = v_id
              order by unit_price_vnd desc, array_position(v_ids, id) loop
      v_k := case when v_parts is null then r.qty else least(r.qty, v_parts) end;
      exit when v_k <= 0;
      if v_kind = 'pct' then
        v_unit := round(r.unit_price_vnd * v_pct / 100.0)::int;
      else
        if v_amt > r.unit_price_vnd then
          raise exception 'Giảm % mỗi phần lớn hơn giá món (% mỗi phần). Giảm tối đa bằng giá món rẻ nhất được giảm.',
            to_char(v_amt, 'FM999G999G999'), to_char(r.unit_price_vnd, 'FM999G999G999') using errcode = 'P0001';
        end if;
        v_unit := v_amt;
      end if;
      update order_lines set discount_qty = v_k, discount_unit_vnd = v_unit where id = r.id;
      v_disc := v_disc + v_k * v_unit;
      if v_parts is not null then v_parts := v_parts - v_k; end if;
    end loop;
  end if;

  -- Giảm một khoản cho tổng đơn: chia cho từng phần theo giá (làm tròn xuống); phần lẻ vài đồng tính ở mức đơn
  if v_kind = 'order' then
    if v_amt > v_total then
      raise exception 'Giảm % lớn hơn tạm tính %. Nếu muốn cho không cả đơn, chọn Tặng.',
        to_char(v_amt, 'FM999G999G999'), to_char(v_total, 'FM999G999G999') using errcode = 'P0001';
    end if;
    update order_lines set discount_qty = qty, discount_unit_vnd = floor(v_amt::numeric * unit_price_vnd / v_total)::int
     where order_id = v_id and floor(v_amt::numeric * unit_price_vnd / v_total) > 0;
    v_disc := v_amt;
  end if;

  -- Cơ sở trừ kho lúc bán (0057): nguyên liệu theo công thức, syrup, bao bì của mọi dòng trong đơn
  if public.outlet_deduct_on_sale(v_outlet) then perform public._apply_sale_stock(v_id); end if;

  if v_disc > v_total then
    raise exception 'Giảm % lớn hơn tiền đơn %. Sửa lại số giảm giá.',
      to_char(v_disc, 'FM999G999G999'), to_char(v_total, 'FM999G999G999') using errcode = 'P0001';
  end if;
  update orders set total_vnd = v_total - v_disc, discount_vnd = v_disc,
                    discount_reason = case when v_disc > 0 then nullif(p->>'discount_reason', '') end,
                    discount_kind = case when v_disc > 0 then v_kind end,
                    discount_value = case when v_disc > 0 then (case v_kind when 'pct' then v_pct else v_amt end) end
   where id = v_id;
  return jsonb_build_object('id', v_id, 'seq_in_day', v_seq, 'total_vnd', v_total - v_disc, 'gross_vnd', v_total,
                            'discount_vnd', v_disc, 'business_date', v_date);
end $function$;

create or replace function public.fn_move_orders(p_orders uuid[], p_date date)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v orders; v_today date := public.vn_today(); v_outlet uuid; v_n int; v_found int;
  v_new uuid; v_seq int; v_snap jsonb; v_out jsonb := '[]'::jsonb; v_placed timestamptz; l order_lines; v_nl uuid;
begin
  if auth.uid() is null then raise exception 'Chưa đăng nhập' using errcode = '42501'; end if;
  v_n := coalesce(cardinality(p_orders), 0);
  if v_n = 0 then raise exception 'Chưa chọn đơn nào' using errcode = 'P0001'; end if;
  if p_date is null then raise exception 'Chưa chọn ngày mới' using errcode = 'P0001'; end if;
  if p_date > v_today then raise exception 'Không chuyển đơn sang ngày sau hôm nay' using errcode = 'P0001'; end if;
  if p_date < v_today - 6 then
    raise exception 'Chỉ chuyển được trong 7 ngày gần nhất (từ % đến %)', to_char(v_today - 6, 'DD/MM'), to_char(v_today, 'DD/MM') using errcode = 'P0001';
  end if;
  select count(*), min(outlet_id::text)::uuid into v_found, v_outlet from orders where id = any(p_orders);
  if v_found <> (select count(distinct x) from unnest(p_orders) x) or v_outlet is null or not public.can_access_outlet(v_outlet) then
    raise exception 'Không tìm thấy đơn' using errcode = '42501';
  end if;
  if (select count(distinct outlet_id) from orders where id = any(p_orders)) > 1 then
    raise exception 'Các đơn phải cùng một cơ sở' using errcode = 'P0001';
  end if;
  if not public.can_manage_outlet(v_outlet) then
    raise exception 'Chỉ chủ cơ sở đổi được ngày bán. Nhờ chủ cơ sở đổi giúp.' using errcode = '42501';
  end if;
  if exists (select 1 from day_closes where outlet_id = v_outlet and business_date = p_date and is_current) then
    raise exception 'Ngày % đã chốt theo cách cũ, không chuyển đơn vào được', to_char(p_date, 'DD/MM') using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtext(v_outlet::text || p_date::text));

  for v in select * from orders where id = any(p_orders) order by placed_at, seq_in_day for update loop
    if v.status <> 'active' then
      raise exception 'Đơn #% ngày % đã hủy hoặc đã sửa, không chuyển được. Tải lại hóa đơn rồi chọn lại.', v.seq_in_day, to_char(v.business_date, 'DD/MM') using errcode = 'P0001';
    end if;
    if v.channel = 'aggregate' then
      raise exception 'Đơn #% ngày % là số liệu nhập gộp, không chuyển ngày được', v.seq_in_day, to_char(v.business_date, 'DD/MM') using errcode = 'P0001';
    end if;
    if v.business_date = p_date then
      raise exception 'Đơn #% đã ở ngày %', v.seq_in_day, to_char(p_date, 'DD/MM') using errcode = 'P0001';
    end if;
    if v.business_date < v_today - 6 then
      raise exception 'Đơn #% ngày % đã quá 7 ngày, không chuyển được', v.seq_in_day, to_char(v.business_date, 'DD/MM') using errcode = 'P0001';
    end if;

    v_snap := public._order_snapshot(v.id);
    perform public._reverse_order_core(v.id, 'Chuyển sang ' || to_char(p_date, 'DD/MM'));

    select coalesce(max(seq_in_day), 0) + 1 into v_seq from orders
     where outlet_id = v.outlet_id and business_date = p_date and seq_in_day > 0;
    v_placed := (p_date + (v.placed_at at time zone 'Asia/Ho_Chi_Minh')::time) at time zone 'Asia/Ho_Chi_Minh';

    insert into orders (outlet_id, seq_in_day, business_date, placed_at, channel, is_gift, total_vnd, payment_method, note,
                        customer_name, discount_vnd, discount_reason, discount_kind, discount_value, source)
    values (v.outlet_id, v_seq, p_date, v_placed, v.channel, v.is_gift, v.total_vnd, v.payment_method, v.note,
            v.customer_name, v.discount_vnd, v.discount_reason, v.discount_kind, v.discount_value, v.source)
    returning id into v_new;

    -- Chép từng dòng, kèm nguyên liệu tự chọn của dòng Buffet (0065)
    for l in select * from order_lines where order_id = v.id loop
      insert into order_lines (order_id, product_id, qty, unit_price_vnd, recipe_id, sweetness_level_id, line_total_vnd,
                               container, unit_cost_vnd, discount_qty, discount_unit_vnd, sugar)
      values (v_new, l.product_id, l.qty, l.unit_price_vnd, l.recipe_id, l.sweetness_level_id, l.line_total_vnd,
              l.container, l.unit_cost_vnd, l.discount_qty, l.discount_unit_vnd, l.sugar)
      returning id into v_nl;
      insert into order_line_items (order_line_id, ingredient_id, qty)
      select v_nl, ingredient_id, qty from order_line_items where order_line_id = l.id;
    end loop;

    -- Kho: chép nguyên các dòng trừ kho của đơn cũ sang ngày mới (bản hủy ở trên đã cộng lại cho ngày cũ)
    insert into stock_movements (outlet_id, ingredient_id, qty_delta, reason, ref_table, ref_id, business_date, lot_id, expires_at, unit_cost_vnd)
    select outlet_id, ingredient_id, qty_delta, reason, 'orders', v_new, p_date, lot_id, expires_at, unit_cost_vnd
      from stock_movements where ref_table = 'orders' and ref_id = v.id;

    insert into audit_log (actor_id, table_name, row_id, action, old_row, new_row)
    values (auth.uid(), 'orders', v_new, 'move', v_snap,
            public._order_snapshot(v_new) || jsonb_build_object('moved_from', v.business_date, 'moved_from_seq', v.seq_in_day, 'replaced', v.id));

    v_out := v_out || jsonb_build_object('from_id', v.id, 'from_date', v.business_date, 'from_seq', v.seq_in_day,
                                         'id', v_new, 'seq_in_day', v_seq);
  end loop;
  return jsonb_build_object('business_date', p_date, 'moved', v_out);
end $function$;
revoke all on function public.fn_move_orders(uuid[], date) from public, anon;
grant execute on function public.fn_move_orders(uuid[], date) to authenticated;
