-- 0066 · Buffet theo combo: hạt cao cấp, phổ thông
-- Vì sao: Hà, Tùng 21/11/2026 (thiết kế BG01–BG05).
--   Cao cấp: óc chó, hạnh nhân, hạt điều. Phổ thông: đậu đỏ, mè đen, bắp, thanh long, bí đỏ, bột lá dứa, cacao, matcha
--   (mỗi loại bột tính là một loại phổ thông). Combo: 2 cao cấp + 1 phổ thông 30.000 đ; 3 + 1 35.000 đ; 2 + 2 35.000 đ.
--   Ngoài combo có "Khác": chọn tùy ý, sửa được giá. Trong combo chỉ sửa gram.
-- Thay đổi:
--   1) ingredients.buffet_tier ('premium' | 'regular' | null = không dùng cho Buffet).
--   2) Bảng buffet_combos (có phiên bản valid_from, valid_to). order_lines.buffet_combo_id: combo của dòng Buffet, null = Khác.
--   3) fn_buffet_options(outlet): nguyên liệu có tier (hay dùng nhất ở trên) và combo đang dùng.
--   4) fn_post_order: dòng Buffet có "combo" thì kiểm số hạt và lấy giá theo combo. fn_move_orders chép cả combo.
-- Tương thích ngược: fn_buffet_ingredients giữ nguyên cho app cũ; dòng Buffet không có combo xử lý như trước (Khác).
-- Kiểm thử: tests/db/t_12_buffet_combo.sql

alter table public.ingredients add column if not exists buffet_tier text check (buffet_tier in ('premium', 'regular'));
comment on column public.ingredients.buffet_tier is 'Nhóm hạt trong Buffet: premium = cao cấp, regular = phổ thông; null = không có trong bảng chọn Buffet';
update public.ingredients set buffet_tier = 'premium' where code in ('oc_cho', 'hanh_nhan', 'dieu') and buffet_tier is null;
update public.ingredients set buffet_tier = 'regular'
 where code in ('dau_do', 'me', 'bap', 'thanh_long', 'bi_do', 'la_dua', 'cacao', 'matcha') and buffet_tier is null;

create table if not exists public.buffet_combos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id),
  name text not null,
  n_premium int not null check (n_premium >= 0),
  n_regular int not null check (n_regular >= 0),
  price_vnd int not null check (price_vnd >= 0),
  sort_order int not null default 0,
  valid_from date not null default public.vn_today(),
  valid_to date,
  unique (org_id, n_premium, n_regular, valid_from)
);
comment on table public.buffet_combos is 'Combo Buffet: số hạt cao cấp, phổ thông và giá. Đổi giá = thêm dòng mới, đóng dòng cũ bằng valid_to';
alter table public.buffet_combos enable row level security;
drop policy if exists buffet_combos_read on public.buffet_combos;
create policy buffet_combos_read on public.buffet_combos for select to authenticated
  using (exists (select 1 from outlets o where o.org_id = buffet_combos.org_id and public.can_access_outlet(o.id)));
revoke all on public.buffet_combos from anon;
grant select on public.buffet_combos to authenticated;

insert into public.buffet_combos (org_id, name, n_premium, n_regular, price_vnd, sort_order, valid_from)
select p.org_id, c.name, c.np, c.nr, c.price, c.so, date '2026-11-21'
  from public.products p
  cross join (values ('2 cao cấp + 1 phổ thông', 2, 1, 30000, 1), ('3 cao cấp + 1 phổ thông', 3, 1, 35000, 2),
                     ('2 cao cấp + 2 phổ thông', 2, 2, 35000, 3)) c(name, np, nr, price, so)
 where p.code = 'buffet'
on conflict do nothing;

alter table public.order_lines add column if not exists buffet_combo_id uuid references public.buffet_combos(id);
comment on column public.order_lines.buffet_combo_id is 'Combo Buffet của dòng (0066); null với món thường và Buffet Khác';

create or replace function public.fn_buffet_options(p_outlet uuid)
returns jsonb language sql stable security definer set search_path to 'public' as $function$
  select case when not public.can_access_outlet(p_outlet) then null else jsonb_build_object(
    'ingredients', coalesce((
      select jsonb_agg(jsonb_build_object('ingredient_id', x.id, 'name', x.name, 'unit', x.unit, 'tier', x.buffet_tier)
                       order by x.picks desc, x.used desc, x.sort_order)
        from (select i.id, i.name, i.unit, i.buffet_tier, i.sort_order,
                     (select count(*) from order_line_items li join order_lines l on l.id = li.order_line_id join orders o on o.id = l.order_id
                       where li.ingredient_id = i.id and o.outlet_id = p_outlet and o.status = 'active' and o.business_date >= public.vn_today() - 30) as picks,
                     coalesce((select -sum(m.qty_delta) from stock_movements m
                                where m.ingredient_id = i.id and m.outlet_id = p_outlet and m.ref_table = 'orders'
                                  and m.business_date >= public.vn_today() - 30), 0) as used
                from ingredients i join outlets ot on ot.id = p_outlet and ot.org_id = i.org_id
               where i.status = 'active' and i.buffet_tier is not null) x), '[]'::jsonb),
    'combos', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'n_premium', c.n_premium, 'n_regular', c.n_regular, 'price', c.price_vnd)
                       order by c.sort_order, c.price_vnd)
        from buffet_combos c join outlets ot on ot.id = p_outlet and ot.org_id = c.org_id
       where c.valid_from <= public.vn_today() and (c.valid_to is null or c.valid_to > public.vn_today())), '[]'::jsonb)
  ) end
$function$;
revoke all on function public.fn_buffet_options(uuid) from public, anon;
grant execute on function public.fn_buffet_options(uuid) to authenticated;

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
  v_custom boolean; v_org uuid; v_combo buffet_combos; v_np int; v_nr int; v_nx int;
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
                  nullif(x->>'price', '')::int as cprice, coalesce(x->'custom', '[]'::jsonb) as custom,
                  nullif(x->>'combo', '')::uuid as combo
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
    -- Combo Buffet (0066): đúng số hạt cao cấp, phổ thông; giá theo combo, không theo giá app gửi
    v_combo := null;
    if v_custom and r.combo is not null then
      select * into v_combo from buffet_combos where id = r.combo and org_id = v_org;
      if not found then raise exception 'Combo Buffet không còn dùng. Mở lại Buffet và chọn combo khác.' using errcode = 'P0001'; end if;
      select count(*) filter (where i.buffet_tier = 'premium'), count(*) filter (where i.buffet_tier = 'regular'),
             count(*) filter (where i.buffet_tier is null)
        into v_np, v_nr, v_nx
        from (select (c->>'ingredient_id')::uuid as id from jsonb_array_elements(r.custom) c
               where (c->>'qty')::numeric > 0 group by 1) s
        join ingredients i on i.id = s.id and i.org_id = v_org;
      if v_nx > 0 or v_np <> v_combo.n_premium or v_nr <> v_combo.n_regular then
        raise exception 'Combo % cần % cao cấp và % phổ thông, đang chọn % cao cấp và % phổ thông. Sửa lại nguyên liệu hoặc chọn Khác.',
          v_combo.name, v_combo.n_premium, v_combo.n_regular, v_np, v_nr using errcode = 'P0001';
      end if;
    end if;
    if v_gift then v_price := 0;
    elsif v_combo.id is not null then
      v_price := v_combo.price_vnd;
    elsif v_custom then
      v_price := coalesce(r.cprice, public.current_price(v_outlet, r.product_id, v_date));
      if v_price is null or v_price < 0 then raise exception 'Giá Buffet không hợp lệ' using errcode = 'P0001'; end if;
    else
      v_price := public.current_price(v_outlet, r.product_id, v_date);
      if v_price is null then raise exception 'Món chưa có giá niêm yết' using errcode = 'P0001'; end if;
    end if;
    insert into order_lines (order_id, product_id, qty, unit_price_vnd, recipe_id, line_total_vnd, container, sugar, buffet_combo_id)
    values (v_id, r.product_id, r.qty, v_price, case when v_custom then null else public.current_recipe(r.product_id, v_date) end,
            v_price * r.qty, r.container, r.sugar, v_combo.id)
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
                               container, unit_cost_vnd, discount_qty, discount_unit_vnd, sugar, buffet_combo_id)
      values (v_new, l.product_id, l.qty, l.unit_price_vnd, l.recipe_id, l.sweetness_level_id, l.line_total_vnd,
              l.container, l.unit_cost_vnd, l.discount_qty, l.discount_unit_vnd, l.sugar, l.buffet_combo_id)
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
