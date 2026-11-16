-- 0054 · Giảm giá 10% theo từng phần (Tùng duyệt 16/11 21:09, thiết kế V01–V07).
-- Chỉ còn một mức giảm 10%, cho cả đơn hoặc cho N phần giá cao nhất. Mỗi dòng đơn ghi số phần được giảm và số tiền giảm mỗi phần.
-- Chỉ thêm cột. line_total_vnd vẫn là tiền trước giảm; orders.discount_vnd vẫn là tổng tiền giảm của đơn.
-- Đơn cũ (giảm một số tiền ở tổng đơn) giữ nguyên; fn_post_order vẫn nhận discount_vnd để máy chưa cập nhật app và hàng chờ gửi không bị lỗi.
alter table public.order_lines add column if not exists discount_qty integer not null default 0;
alter table public.order_lines add column if not exists discount_unit_vnd integer not null default 0;
comment on column public.order_lines.discount_qty is 'Số phần trong dòng này được giảm giá (0 = không giảm)';
comment on column public.order_lines.discount_unit_vnd is 'Số tiền giảm cho mỗi phần được giảm';
alter table public.order_lines add constraint order_lines_discount_check check (discount_qty >= 0 and discount_qty <= qty and discount_unit_vnd >= 0);

create or replace function public.fn_post_order(p jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v_outlet uuid := (p->>'outlet_id')::uuid;
  v_client uuid := nullif(p->>'client_id', '')::uuid;
  v_date date := coalesce(nullif(p->>'business_date', '')::date, public.vn_today());
  v_gift boolean := coalesce((p->>'is_gift')::boolean, false);
  v_disc int := coalesce(nullif(p->>'discount_vnd', '')::int, 0);
  v_pct int := nullif(p->>'discount_pct', '')::int;       -- 10 = giảm 10% theo từng phần
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
  if v_pct is not null and v_pct <> 10 then raise exception 'Chỉ có một mức giảm giá là 10%%' using errcode = 'P0001'; end if;
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
                  coalesce(nullif(x->>'container', ''), 'chai') as container
             from jsonb_array_elements(p->'lines') x loop
    continue when r.qty is null or r.qty <= 0;
    if r.container not in ('chai', 'coc') then
      raise exception 'Loại bao bì không hợp lệ: %', r.container using errcode = 'P0001';
    end if;
    if v_gift then v_price := 0;
    else
      v_price := public.current_price(v_outlet, r.product_id, v_date);
      if v_price is null then raise exception 'Món chưa có giá niêm yết' using errcode = 'P0001'; end if;
    end if;
    insert into order_lines (order_id, product_id, qty, unit_price_vnd, recipe_id, line_total_vnd, container)
    values (v_id, r.product_id, r.qty, v_price, public.current_recipe(r.product_id, v_date), v_price * r.qty, r.container)
    returning id into v_lid;
    v_ids := v_ids || v_lid;
    v_total := v_total + v_price * r.qty;
    insert into stock_movements (outlet_id, ingredient_id, qty_delta, reason, ref_table, ref_id, business_date)
    select v_outlet, pr.ingredient_id, -pr.qty_per_unit * r.qty, 'sale_packaging', 'orders', v_id, v_date
      from packaging_rules pr join products pd on pd.kind = pr.product_kind and pd.org_id = pr.org_id
     where pd.id = r.product_id and pr.consume_at = 'sale';
  end loop;

  -- Giảm 10%: lấy phần giá cao nhất trước; cùng giá thì theo thứ tự dòng trong đơn (app tính y hệt để hiện trước khi lưu)
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
    'payment_method', v_pay, 'customer_name', v_cust));
  v_new := (v_res->>'id')::uuid;
  insert into audit_log (actor_id, table_name, row_id, action, old_row, new_row)
  values (auth.uid(), 'orders', v_new, 'edit', v_old, public._order_snapshot(v_new) || jsonb_build_object('reason', v_why));
  return v_res || jsonb_build_object('replaced', p_order);
end $function$;

-- Báo cáo lãi gộp theo món: doanh thu của món đã trừ phần giảm giá ghi trên chính dòng đó
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
