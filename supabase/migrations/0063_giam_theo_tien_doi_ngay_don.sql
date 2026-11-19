-- 0063 · Giảm giá theo số tiền (mỗi phần hoặc tổng đơn) và đổi ngày bán của đơn
-- Vì sao: Tùng 19/11/2026. Hà hay bớt 5.000 đ mỗi chai cho khách quen; đôi khi ghi đơn nhầm ngày (thiết kế X01–X10).
-- Thay đổi:
--   1) orders.discount_kind ('pct' | 'per_part' | 'order') và orders.discount_value (5/10 hoặc số đồng). Cột mới, không đổi nghĩa cột cũ.
--      Đơn cũ để trống: app vẫn suy mức 5%/10% như trước.
--   2) fn_post_order nhận thêm discount_kind, discount_amount.
--      per_part: mỗi phần bớt discount_amount đồng, phần giá cao trước, tối đa bằng giá món.
--      order: một khoản cho cả đơn, chia vào từng phần theo giá (làm tròn xuống), tối đa bằng tạm tính.
--      Sửa luôn lỗi đơn rỗng: mọi dòng số lượng 0 thì báo lỗi, không tạo đơn.
--   3) fn_edit_order chuyển tiếp hai tham số mới.
--   4) fn_move_orders(uuid[], date): chủ cơ sở, quản trị đổi ngày bán cho một hoặc nhiều đơn, trong 7 ngày gần nhất,
--      làm nguyên khối (một đơn lỗi thì cả lô giữ nguyên). Sổ cái chỉ thêm: hủy đơn cũ, ghi đơn mới ở ngày mới,
--      chép nguyên giá, giảm giá, giá vốn và kho của đơn cũ.
-- Tương thích ngược: app bản cũ vẫn gửi discount_pct/discount_parts như trước và chạy bình thường.
-- Kiểm thử: tests/db/t_08_giam_theo_tien.sql, tests/db/t_09_doi_ngay_don.sql

alter table public.orders add column if not exists discount_kind text;
alter table public.orders add column if not exists discount_value int;
do $$ begin
  alter table public.orders add constraint orders_discount_kind_check check (discount_kind is null or discount_kind in ('pct', 'per_part', 'order'));
exception when duplicate_object then null; end $$;
comment on column public.orders.discount_kind is 'Kiểu giảm giá: pct (5/10%), per_part (số đồng mỗi phần), order (số đồng cho cả đơn). Null = không giảm hoặc đơn trước 0063';
comment on column public.orders.discount_value is 'pct: 5 hoặc 10; per_part, order: số đồng';

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

create or replace function public.fn_edit_order(p_order uuid, p jsonb, p_reason text default null::text)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v orders; v_old jsonb; v_res jsonb; v_new uuid; v_why text := nullif(btrim(coalesce(p_reason, '')), '');
  v_gift boolean; v_pay text; v_cust text;
begin
  select * into v from orders where id = p_order;
  if not found or auth.uid() is null or not public.can_access_outlet(v.outlet_id) then
    raise exception 'Không tìm thấy đơn' using errcode = '42501';
  end if;
  if not public.can_manage_outlet(v.outlet_id) then
    raise exception 'Chỉ chủ cơ sở sửa được đơn. Nhờ chủ cơ sở sửa giúp.' using errcode = '42501';
  end if;
  if v.status <> 'active' then raise exception 'Đơn này đã hủy, không sửa được' using errcode = 'P0001'; end if;
  if jsonb_array_length(coalesce(p->'lines', '[]'::jsonb)) = 0 then
    raise exception 'Đơn phải còn ít nhất một món. Muốn bỏ cả đơn thì dùng Hủy đơn.' using errcode = 'P0001';
  end if;
  v_gift := coalesce((p->>'is_gift')::boolean, v.is_gift);
  v_pay := case when v_gift then null when p ? 'payment_method' then nullif(p->>'payment_method', '') else v.payment_method end;
  v_cust := case when p ? 'customer_name' then nullif(btrim(coalesce(p->>'customer_name', '')), '') else v.customer_name end;
  v_old := public._order_snapshot(p_order);
  perform public._reverse_order_core(p_order, 'Sửa đơn' || coalesce(': ' || v_why, ''));
  v_res := public.fn_post_order(jsonb_build_object(
    'outlet_id', v.outlet_id, 'business_date', v.business_date, 'placed_at', v.placed_at, 'channel', v.channel,
    'is_gift', v_gift, 'note', case when v_gift then coalesce(v.note, 'Tặng') else nullif(v.note, 'Tặng') end, 'lines', p->'lines',
    'discount_vnd', coalesce(p->>'discount_vnd', '0'), 'discount_reason', p->>'discount_reason',
    'discount_pct', p->>'discount_pct', 'discount_parts', p->>'discount_parts',
    'discount_kind', p->>'discount_kind', 'discount_amount', p->>'discount_amount',
    'payment_method', v_pay, 'customer_name', v_cust));
  v_new := (v_res->>'id')::uuid;
  insert into audit_log (actor_id, table_name, row_id, action, old_row, new_row)
  values (auth.uid(), 'orders', v_new, 'edit', v_old, public._order_snapshot(v_new) || jsonb_build_object('reason', v_why));
  return v_res || jsonb_build_object('replaced', p_order);
end $function$;

-- Đổi ngày bán cho một hoặc nhiều đơn
create or replace function public.fn_move_orders(p_orders uuid[], p_date date)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v orders; v_today date := public.vn_today(); v_outlet uuid; v_n int; v_found int;
  v_new uuid; v_seq int; v_snap jsonb; v_out jsonb := '[]'::jsonb; v_placed timestamptz;
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

    insert into order_lines (order_id, product_id, qty, unit_price_vnd, recipe_id, sweetness_level_id, line_total_vnd,
                             container, unit_cost_vnd, discount_qty, discount_unit_vnd, sugar)
    select v_new, product_id, qty, unit_price_vnd, recipe_id, sweetness_level_id, line_total_vnd,
           container, unit_cost_vnd, discount_qty, discount_unit_vnd, sugar
      from order_lines where order_id = v.id;

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
