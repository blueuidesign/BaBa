-- 0056 · Ít đường và giảm giá 5% hoặc 10% (Tùng duyệt 17/11 09:26, thiết kế Y01–Y09).
-- 1) order_lines.sugar: null = đường bình thường (products.cost_syrup_ml, thường 30 ml); 'less' = ít đường, tính 20 ml syrup vào giá vốn.
--    Syrup không tự trừ kho theo từng đơn (kho syrup chỉnh bằng số đo lúc chốt ngày), nên ít đường chỉ đổi giá vốn và hiện trên đơn.
-- 2) fn_post_order nhận discount_pct 5 hoặc 10 (trước chỉ 10) và sugar trên từng dòng.
alter table public.order_lines add column if not exists sugar text;
alter table public.order_lines add constraint order_lines_sugar_check check (sugar is null or sugar = 'less');
comment on column public.order_lines.sugar is 'Ghi chú đường: null = bình thường, less = ít đường (20 ml syrup)';

-- Giá vốn một phần theo ghi chú đường: ít đường bớt phần syrup vượt 20 ml
create or replace function public.fn_unit_cost_sugar(p_product uuid, p_container text, p_date date, p_sugar text)
returns integer language plpgsql stable security definer set search_path to 'public' as $fn$
declare d jsonb; v_ml numeric; v_syr numeric;
begin
  d := public.fn_unit_cost_detail(p_product, p_container, p_date);
  if d is null or d->>'total' is null then return null; end if;
  if p_sugar is distinct from 'less' then return (d->>'total')::int; end if;
  v_ml := coalesce((d->>'syrup_ml')::numeric, 0);
  if v_ml <= 20 then return (d->>'total')::int; end if;
  v_syr := (d->>'syrup')::numeric / v_ml;
  return ((d->>'total')::numeric - round((v_ml - 20) * v_syr))::int;
end $fn$;
revoke execute on function public.fn_unit_cost_sugar(uuid, text, date, text) from public, anon, authenticated;

create or replace function public.trg_order_line_cost() returns trigger language plpgsql security definer set search_path to 'public' as $fn$
begin
  if new.unit_cost_vnd is null then
    new.unit_cost_vnd := public.fn_unit_cost_sugar(new.product_id, coalesce(new.container, 'chai'),
      coalesce((select o.business_date from orders o where o.id = new.order_id), public.vn_today()), new.sugar);
  end if;
  return new;
end $fn$;

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
