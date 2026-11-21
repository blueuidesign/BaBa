-- 0064 · Nhân viên sửa và hủy đơn trong 7 ngày gần nhất
-- Vì sao: Tùng 21/11/2026. Trước đây nhân viên chỉ hủy được đơn chính mình ghi trong 10 phút, không sửa được.
-- Thay đổi: fn_reverse_order, fn_edit_order: nhân viên của cơ sở sửa, hủy được mọi đơn có ngày bán trong 7 ngày gần nhất
--   (hôm nay và 6 ngày trước). Chủ cơ sở, quản trị không giới hạn như cũ. Đổi ngày bán (fn_move_orders) vẫn chỉ chủ cơ sở.
--   Lịch sử: mọi lần sửa, hủy vẫn ghi audit_log (ai, lúc nào, đơn trước khi sửa, lý do) như trước.
-- Tương thích ngược: chữ ký hàm không đổi.
-- Kiểm thử: tests/db/t_10_nhan_vien_sua_huy.sql

create or replace function public.fn_reverse_order(p_order uuid, p_reason text default null::text)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v orders; v_rev uuid; v_snap jsonb;
begin
  select * into v from orders where id = p_order;
  if not found or auth.uid() is null or not public.can_access_outlet(v.outlet_id) then
    raise exception 'Không tìm thấy đơn' using errcode = '42501';
  end if;
  if not public.can_manage_outlet(v.outlet_id) and v.business_date < public.vn_today() - 6 then
    raise exception 'Đơn ngày % đã quá 7 ngày. Nhờ chủ cơ sở hủy giúp.', to_char(v.business_date, 'DD/MM') using errcode = '42501';
  end if;
  v_snap := public._order_snapshot(p_order);
  v_rev := public._reverse_order_core(p_order, p_reason);
  insert into audit_log (actor_id, table_name, row_id, action, old_row, new_row)
  values (auth.uid(), 'orders', p_order, 'cancel', v_snap, jsonb_build_object('reason', coalesce(nullif(btrim(p_reason), ''), 'Hủy đơn')));
  return jsonb_build_object('reversal_id', v_rev);
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
  if not public.can_manage_outlet(v.outlet_id) and v.business_date < public.vn_today() - 6 then
    raise exception 'Đơn ngày % đã quá 7 ngày. Nhờ chủ cơ sở sửa giúp.', to_char(v.business_date, 'DD/MM') using errcode = '42501';
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
