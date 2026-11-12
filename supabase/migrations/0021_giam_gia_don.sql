-- 0021 · Ô giảm giá khi ghi đơn (Tùng 12/11). Cột orders.discount_vnd, discount_reason và view v_daily_sales đã có ở 0017.
-- fn_post_order nhận thêm 'discount_vnd' (số nguyên ≥ 0, không lớn hơn tiền đơn) và 'discount_reason'.
-- orders.total_vnd = tổng dòng − giảm giá = tiền thu. Đơn tặng không có giảm giá.
-- fn_close_day: doanh thu theo đơn trừ giảm giá, để đối chiếu tiền không báo lệch giả.
-- Kiểm tra: xem cuối file.

CREATE OR REPLACE FUNCTION public.fn_post_order(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_outlet uuid := (p->>'outlet_id')::uuid;
  v_client uuid := nullif(p->>'client_id', '')::uuid;
  v_date date := coalesce(nullif(p->>'business_date', '')::date, public.vn_today());
  v_gift boolean := coalesce((p->>'is_gift')::boolean, false);
  v_disc int := coalesce(nullif(p->>'discount_vnd', '')::int, 0);
  v_ex orders; v_id uuid; v_seq int; v_total int := 0; v_price int; r record;
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
  if v_gift then v_disc := 0; end if;

  perform pg_advisory_xact_lock(hashtext(v_outlet::text || v_date::text));
  select coalesce(max(seq_in_day), 0) + 1 into v_seq from orders
   where outlet_id = v_outlet and business_date = v_date and seq_in_day > 0;

  insert into orders (outlet_id, client_id, seq_in_day, business_date, channel, is_gift, note, placed_at)
  values (v_outlet, v_client, v_seq, v_date, coalesce(p->>'channel', 'counter'), v_gift, p->>'note',
          coalesce(nullif(p->>'placed_at', '')::timestamptz, now()))
  returning id into v_id;

  for r in select (x->>'product_id')::uuid as product_id, (x->>'qty')::int as qty
             from jsonb_array_elements(p->'lines') x loop
    continue when r.qty is null or r.qty <= 0;
    if v_gift then v_price := 0;
    else
      v_price := public.current_price(v_outlet, r.product_id, v_date);
      if v_price is null then raise exception 'Món chưa có giá niêm yết' using errcode = 'P0001'; end if;
    end if;
    insert into order_lines (order_id, product_id, qty, unit_price_vnd, recipe_id, line_total_vnd)
    values (v_id, r.product_id, r.qty, v_price, public.current_recipe(r.product_id, v_date), v_price * r.qty);
    v_total := v_total + v_price * r.qty;
    insert into stock_movements (outlet_id, ingredient_id, qty_delta, reason, ref_table, ref_id, business_date)
    select v_outlet, pr.ingredient_id, -pr.qty_per_unit * r.qty, 'sale_packaging', 'orders', v_id, v_date
      from packaging_rules pr join products pd on pd.kind = pr.product_kind and pd.org_id = pr.org_id
     where pd.id = r.product_id and pr.consume_at = 'sale';
  end loop;

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

-- fn_close_day: giữ nguyên bản ở DB ngày 12/11, chỉ đổi câu tính v_rev (trừ giảm giá).
CREATE OR REPLACE FUNCTION public.fn_close_day(p jsonb, p_commit boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_outlet uuid := (p->>'outlet_id')::uuid;
  v_date date := coalesce(nullif(p->>'business_date', '')::date, public.vn_today());
  v_gift int := coalesce((p->>'gift_total')::int, 0);
  v_waste int := coalesce((p->>'waste_total')::int, 0);
  v_cash int := coalesce((p->>'cash_vnd')::int, 0);
  v_transfer int := coalesce((p->>'transfer_vnd')::int, 0);
  v_old day_closes; v_id uuid;
  v_out int := 0; v_sold int := 0; v_rev int := 0; v_diff int; v_remain int; v_take int;
  v_catch jsonb := '[]'::jsonb; v_catch_order jsonb; v_lines jsonb := '[]'::jsonb; r record;
begin
  if auth.uid() is null or not public.can_access_outlet(v_outlet) then raise exception 'Bạn không có quyền ở cơ sở này' using errcode = '42501'; end if;
  if v_gift < 0 or v_waste < 0 or v_cash < 0 or v_transfer < 0 then raise exception 'Số nhập không được âm' using errcode = 'P0001'; end if;

  select * into v_old from day_closes where outlet_id = v_outlet and business_date = v_date and is_current;
  if found and p_commit and coalesce(p->>'reclose_reason', '') = '' then
    raise exception 'Ngày % đã chốt; chốt lại cần ghi lý do', to_char(v_date, 'DD/MM') using errcode = 'P0001';
  end if;

  create temp table if not exists _close_calc (product_id uuid, carried int, cooked int, sold int, counted int) on commit drop;
  truncate _close_calc;
  insert into _close_calc
  select b.product_id, b.carried, b.cooked, b.sold,
         coalesce((select (x->>'counted_left')::int from jsonb_array_elements(coalesce(p->'lines', '[]'::jsonb)) x
                   where (x->>'product_id')::uuid = b.product_id), b.carried + b.cooked - b.sold)
    from public.fn_bottles_on_hand(v_outlet, v_date) b
   where b.carried <> 0 or b.cooked <> 0 or b.sold <> 0
      or exists (select 1 from jsonb_array_elements(coalesce(p->'lines', '[]'::jsonb)) x where (x->>'product_id')::uuid = b.product_id);

  select coalesce(sum(carried + cooked - counted), 0), coalesce(sum(sold), 0) into v_out, v_sold from _close_calc;
  v_diff := v_out - v_gift - v_waste - v_sold;

  if v_diff > 0 and coalesce((p->>'create_catchup_order')::boolean, false) then
    v_remain := v_gift + v_waste;
    for r in select product_id, (carried + cooked - counted - sold) as d from _close_calc
              where carried + cooked - counted - sold > 0 order by 2 desc loop
      v_take := greatest(0, r.d - v_remain);
      v_remain := greatest(0, v_remain - r.d);
      if v_take > 0 then v_catch := v_catch || jsonb_build_object('product_id', r.product_id, 'qty', v_take); end if;
    end loop;
  end if;

  if p_commit and jsonb_array_length(v_catch) > 0 then
    v_catch_order := public.fn_post_order(jsonb_build_object('outlet_id', v_outlet, 'business_date', v_date,
                       'channel', 'aggregate', 'lines', v_catch, 'note', 'Đơn bổ sung khi đối chiếu'));
    update _close_calc c set sold = c.sold + (x->>'qty')::int
      from jsonb_array_elements(v_catch) x where (x->>'product_id')::uuid = c.product_id;
    select coalesce(sum(sold), 0) into v_sold from _close_calc;
    v_diff := v_out - v_gift - v_waste - v_sold;
  end if;

  -- 0021: doanh thu theo đơn = tổng dòng − giảm giá (đơn không tặng)
  select coalesce(sum(o.total_vnd) filter (where not o.is_gift), 0) into v_rev
    from orders o
   where o.outlet_id = v_outlet and o.business_date = v_date and o.status = 'active';
  select coalesce(jsonb_agg(jsonb_build_object('product_id', product_id, 'carried', carried, 'cooked', cooked,
           'sold', sold, 'counted_left', counted, 'out', carried + cooked - counted)), '[]'::jsonb)
    into v_lines from _close_calc;

  if not p_commit then
    return jsonb_build_object('bottles_out', v_out, 'bottles_by_orders', v_sold, 'gift_total', v_gift, 'waste_total', v_waste,
      'diff_bottles', v_diff, 'revenue_by_orders_vnd', v_rev, 'cash_vnd', v_cash, 'transfer_vnd', v_transfer,
      'diff_money_vnd', v_cash + v_transfer - v_rev, 'lines', v_lines, 'already_closed', v_old.id is not null,
      'catchup_preview', v_catch);
  end if;

  if v_old.id is not null then update day_closes set is_current = false where id = v_old.id; end if;
  insert into day_closes (outlet_id, business_date, supersedes, cash_counted_vnd, transfer_counted_vnd,
         revenue_by_orders_vnd, bottles_by_orders, bottles_out, gift_total, waste_total, diff_bottles,
         diff_money_vnd, money_diff_reason, reclose_reason)
  values (v_outlet, v_date, v_old.id, v_cash, v_transfer, v_rev, v_sold, v_out, v_gift, v_waste, v_diff,
          v_cash + v_transfer - v_rev, nullif(p->>'money_diff_reason', ''), nullif(p->>'reclose_reason', ''))
  returning id into v_id;
  insert into day_close_lines (day_close_id, product_id, cooked_qty, carried_qty, sold_qty, counted_left)
  select v_id, product_id, cooked, carried, sold, counted from _close_calc;

  if nullif(p->>'syrup_measured_ml', '') is not null then
    perform public.fn_post_count(jsonb_build_object('outlet_id', v_outlet, 'reason', 'other', 'note', 'Đo syrup khi chốt ngày',
      'lines', jsonb_build_array(jsonb_build_object('ingredient_id',
         (select i.id from ingredients i join outlets o on o.org_id = i.org_id where o.id = v_outlet and i.code = 'syrup'),
         'qty_actual', (p->>'syrup_measured_ml')::numeric))));
  end if;

  return jsonb_build_object('id', v_id, 'bottles_out', v_out, 'bottles_by_orders', v_sold, 'diff_bottles', v_diff,
    'revenue_by_orders_vnd', v_rev, 'diff_money_vnd', v_cash + v_transfer - v_rev, 'catchup_order', v_catch_order);
end $function$;

-- Kiểm tra (chạy bằng tài khoản thật trên app, cơ sở test):
--   1. Ghi đơn 2 Đỏ (30.000), giảm 5.000 → orders.total_vnd = 25.000, discount_vnd = 5.000, order_lines vẫn 15.000 × 2.
--   2. Giảm 40.000 cho đơn 30.000 → báo "Giảm 40.000 lớn hơn tiền đơn 30.000".
--   3. Báo cáo hôm nay: doanh thu giảm đúng 5.000; đối chiếu cuối ngày "theo đơn" cũng trừ 5.000.
