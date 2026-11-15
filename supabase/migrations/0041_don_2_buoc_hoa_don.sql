-- 0041 · Ghi đơn hai bước và màn Hóa đơn (Tùng duyệt 15/11 21:21, yêu cầu 21:29).
-- 1. fn_post_order nhận thêm payment_method ('cash' | 'transfer' | bỏ trống) và customer_name, để tên khách và cách nhận tiền
--    lưu cùng lúc với đơn (trước đây lưu sau bằng fn_set_order_info). Phần còn lại giữ nguyên bản 0035.
-- 2. fn_set_order_gift(p_order, p_gift): đánh dấu đơn tặng từ màn Hóa đơn.
--    Theo quyết định của Tùng (15/11 21:47): SỬA THẲNG đơn cũ, không tạo đơn thay thế, để số thứ tự đơn không đổi.
--    Đây là ngoại lệ có chủ ý của nguyên tắc sổ cái nối thêm: giá từng dòng và tổng đơn bị ghi đè về 0;
--    giá trước khi đổi vẫn còn trong audit_log (old_row). Kho không bị ảnh hưởng vì đơn tặng vẫn trừ hàng như đơn thường.
--    Quyền: như hủy đơn (0040): chủ cơ sở, admin; nhân viên chỉ với đơn mình ghi trong 10 phút. Ghi audit_log action 'edit'.
-- Chạy ở: migration. Không đổi cột.

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
  v_pay text := nullif(btrim(coalesce(p->>'payment_method', '')), '');
  v_cust text := nullif(btrim(coalesce(p->>'customer_name', '')), '');
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

  -- 0041: cách nhận tiền và tên khách ghi cùng lúc với đơn. Đơn tặng không có cách nhận tiền.
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
    values (v_id, r.product_id, r.qty, v_price, public.current_recipe(r.product_id, v_date), v_price * r.qty, r.container);
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

create or replace function public.fn_set_order_gift(p_order uuid, p_gift boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v orders; v_old jsonb; v_total int := 0;
begin
  select * into v from orders where id = p_order for update;
  if not found or auth.uid() is null or not public.can_access_outlet(v.outlet_id) then
    raise exception 'Không tìm thấy đơn' using errcode = '42501';
  end if;
  if v.status <> 'active' then raise exception 'Đơn này đã hủy' using errcode = 'P0001'; end if;
  if v.is_gift = p_gift then return jsonb_build_object('id', v.id, 'unchanged', true); end if;
  if exists (select 1 from day_closes where outlet_id = v.outlet_id and business_date = v.business_date and is_current) then
    raise exception 'Ngày % đã chốt; muốn sửa thì chốt lại ngày đó', to_char(v.business_date, 'DD/MM') using errcode = 'P0001';
  end if;
  if not public.can_manage_outlet(v.outlet_id) then
    if v.created_by is distinct from auth.uid() then
      raise exception 'Đơn này do người khác ghi. Chỉ chủ cơ sở đổi được thành đơn tặng.' using errcode = '42501';
    end if;
    if v.created_at < now() - interval '10 minutes' then
      raise exception 'Đơn đã ghi quá 10 phút. Nhờ chủ cơ sở đổi giúp.' using errcode = '42501';
    end if;
  end if;
  v_old := public._order_snapshot(p_order);
  if p_gift then
    update order_lines set unit_price_vnd = 0, line_total_vnd = 0 where order_id = p_order;
    update orders set is_gift = true, total_vnd = 0, discount_vnd = 0, discount_reason = null, payment_method = null,
                      note = coalesce(note, 'Tặng') where id = p_order;
  else
    update order_lines l set unit_price_vnd = public.current_price(v.outlet_id, l.product_id, v.business_date),
                             line_total_vnd = public.current_price(v.outlet_id, l.product_id, v.business_date) * l.qty
     where l.order_id = p_order;
    if exists (select 1 from order_lines where order_id = p_order and unit_price_vnd is null) then
      raise exception 'Có món chưa có giá niêm yết, không tính tiền lại được' using errcode = 'P0001';
    end if;
    select coalesce(sum(line_total_vnd), 0) into v_total from order_lines where order_id = p_order;
    update orders set is_gift = false, total_vnd = v_total, note = nullif(note, 'Tặng') where id = p_order;
  end if;
  insert into audit_log (actor_id, table_name, row_id, action, old_row, new_row)
  values (auth.uid(), 'orders', p_order, 'edit', v_old,
          public._order_snapshot(p_order) || jsonb_build_object('reason', case when p_gift then 'Đánh dấu đơn tặng' else 'Bỏ đánh dấu tặng' end));
  return jsonb_build_object('id', p_order, 'seq_in_day', v.seq_in_day, 'is_gift', p_gift, 'total_vnd', v_total);
end $$;
revoke all on function public.fn_set_order_gift(uuid, boolean) from public, anon;
grant execute on function public.fn_set_order_gift(uuid, boolean) to authenticated;

-- 3. Đã đánh dấu rồi thì chỉ đổi được qua Sửa đơn (Tùng 15/11 21:35).
--    fn_set_order_info: ai có quyền ở cơ sở đều đánh dấu được cách nhận tiền cho đơn CHƯA đánh dấu;
--    đổi hoặc bỏ cách nhận tiền đã ghi thì chỉ chủ cơ sở, admin. Tên khách không bị siết.
create or replace function public.fn_set_order_info(p_order uuid, p_payment text default null, p_customer text default null)
 returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare o orders%rowtype; v_pay text; v_cust text;
begin
  select * into o from orders where id = p_order;
  if not found then raise exception 'Không tìm thấy đơn' using errcode = 'P0001'; end if;
  if auth.uid() is null or not public.can_access_outlet(o.outlet_id) then
    raise exception 'Bạn không có quyền ở cơ sở này' using errcode = '42501';
  end if;
  if o.status <> 'active' then raise exception 'Đơn này đã hủy, không ghi thêm được' using errcode = 'P0001'; end if;
  if p_payment is not null and p_payment not in ('', 'cash', 'transfer') then
    raise exception 'Cách nhận tiền chỉ là tiền mặt hoặc chuyển khoản' using errcode = 'P0001';
  end if;
  v_pay := case when p_payment is null then o.payment_method when p_payment = '' then null else p_payment end;
  v_cust := case when p_customer is null then o.customer_name when btrim(p_customer) = '' then null else left(btrim(p_customer), 60) end;
  if v_pay is distinct from o.payment_method then
    if o.is_gift then raise exception 'Đơn tặng không có cách nhận tiền. Muốn tính tiền lại thì dùng Sửa đơn.' using errcode = 'P0001'; end if;
    if o.payment_method is not null and not public.can_manage_outlet(o.outlet_id) then
      raise exception 'Đơn đã đánh dấu nhận tiền. Chỉ chủ cơ sở đổi được, ở Sửa đơn.' using errcode = '42501';
    end if;
  end if;
  if v_pay is distinct from o.payment_method or v_cust is distinct from o.customer_name then
    update orders set payment_method = v_pay, customer_name = v_cust where id = p_order;
    insert into audit_log (actor_id, table_name, row_id, action, old_row, new_row)
    values (auth.uid(), 'orders', p_order, 'set_info',
            jsonb_build_object('payment_method', o.payment_method, 'customer_name', o.customer_name),
            jsonb_build_object('payment_method', v_pay, 'customer_name', v_cust));
  end if;
  return jsonb_build_object('id', p_order, 'payment_method', v_pay, 'customer_name', v_cust);
end $function$;

-- 4. Sửa đơn nhận thêm cách nhận tiền, đơn tặng, tên khách: p = { lines, discount_vnd, discount_reason,
--    payment_method ('cash' | 'transfer' | '' để bỏ), is_gift, customer_name }. Khóa nào không gửi thì giữ như đơn cũ.
create or replace function public.fn_edit_order(p_order uuid, p jsonb, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
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
    'payment_method', v_pay, 'customer_name', v_cust));
  v_new := (v_res->>'id')::uuid;
  insert into audit_log (actor_id, table_name, row_id, action, old_row, new_row)
  values (auth.uid(), 'orders', v_new, 'edit', v_old, public._order_snapshot(v_new) || jsonb_build_object('reason', v_why));
  return v_res || jsonb_build_object('replaced', p_order);
end $$;

-- Kiểm tra (thử rồi hủy bằng raise exception):
--   1. fn_post_order với payment_method 'transfer', customer_name 'anh Tùng' → orders.payment_method = 'transfer', customer_name = 'anh Tùng'.
--   2. payment_method 'the' → "Cách nhận tiền không hợp lệ".
--   3. fn_set_order_gift(đơn, true) → cùng đơn đó: is_gift, tổng 0, giá từng dòng 0, số thứ tự không đổi; audit_log 1 dòng 'edit' giữ giá cũ.
--   4. fn_set_order_gift(đơn tặng, false) → đơn mới tính tiền theo bảng giá.
--   5. Nhân viên fn_set_order_info đổi 'cash' → 'transfer' trên đơn đã đánh dấu → "Đơn đã đánh dấu nhận tiền…"; đơn chưa đánh dấu thì được.
--   6. Chủ cơ sở fn_edit_order với is_gift true → đơn mới 0 đ; với payment_method 'transfer', customer_name 'chị Lan' → lưu đúng.
