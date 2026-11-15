-- 0038 · Sửa đơn, siết quyền hủy đơn, lịch sử sửa và hủy đơn (Tùng yêu cầu 15/11 07:36).
-- Vấn đề: nhân viên bán đang hủy được đơn mình ghi; chủ cơ sở chưa sửa được đơn; không ai xem lại được ai đã sửa, hủy gì.
-- Thay đổi:
--   1. Chỉ chủ cơ sở và admin hủy được đơn (fn_reverse_order). Nhân viên không còn hủy hay chuyển đơn thành tặng được.
--   2. fn_edit_order: sửa đơn = đảo đơn cũ + ghi đơn mới (sổ cái nối thêm, không sửa đè). Giữ giờ bán, khách, cách nhận tiền.
--      Giá tính lại theo bảng giá của ngày bán. Số đơn trong ngày là số mới.
--   3. Mọi lần hủy, sửa ghi vào audit_log (action 'cancel' / 'edit') kèm ảnh chụp đơn trước và sau, người làm, lý do.
--   4. Chủ cơ sở đọc được dòng audit_log của đơn thuộc cơ sở mình; view v_order_changes cho màn Lịch sử sửa, hủy đơn.
-- Chạy ở: migration. Không đổi cột cũ. fn_set_order_info (cách nhận tiền, tên khách) giữ nguyên: nhân viên vẫn ghi được, vẫn vào audit_log.

-- Ảnh chụp một đơn để ghi lịch sử (tên món lưu sẵn để về sau món đổi tên vẫn đọc được)
create or replace function public._order_snapshot(p_order uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'order_id', o.id, 'seq_in_day', o.seq_in_day, 'business_date', o.business_date, 'placed_at', o.placed_at,
    'total_vnd', o.total_vnd, 'discount_vnd', o.discount_vnd, 'is_gift', o.is_gift,
    'payment_method', o.payment_method, 'customer_name', o.customer_name,
    'lines', coalesce((select jsonb_agg(jsonb_build_object('name', p.name, 'qty', l.qty, 'container', l.container, 'price', l.unit_price_vnd) order by p.sort_order, l.container)
                         from order_lines l join products p on p.id = l.product_id where l.order_id = o.id), '[]'::jsonb))
  from orders o where o.id = p_order
$$;
revoke all on function public._order_snapshot(uuid) from public, anon, authenticated;

-- Phần lõi của việc đảo đơn, không kiểm quyền và không ghi lịch sử: chỉ các hàm bên dưới gọi
create or replace function public._reverse_order_core(p_order uuid, p_reason text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v orders; v_rev uuid;
begin
  select * into v from orders where id = p_order for update;
  if not found then raise exception 'Không tìm thấy đơn' using errcode = 'P0001'; end if;
  if v.status <> 'active' then raise exception 'Đơn này đã hủy rồi' using errcode = 'P0001'; end if;
  if exists (select 1 from day_closes where outlet_id = v.outlet_id and business_date = v.business_date and is_current) then
    raise exception 'Ngày % đã chốt; muốn sửa thì chốt lại ngày đó', to_char(v.business_date, 'DD/MM') using errcode = 'P0001';
  end if;
  update orders set status = 'reversed' where id = p_order;
  insert into orders (outlet_id, seq_in_day, business_date, channel, status, reversal_of, reversal_reason, total_vnd)
  values (v.outlet_id, -v.seq_in_day, v.business_date, v.channel, 'reversal', p_order, coalesce(nullif(btrim(p_reason), ''), 'Hủy đơn'), 0)
  returning id into v_rev;
  insert into stock_movements (outlet_id, ingredient_id, qty_delta, reason, ref_table, ref_id, business_date)
  select outlet_id, ingredient_id, -qty_delta, 'reversal', 'orders', v_rev, business_date
    from stock_movements where ref_table = 'orders' and ref_id = p_order;
  return v_rev;
end $$;
revoke all on function public._reverse_order_core(uuid, text) from public, anon, authenticated;

-- 1. Hủy đơn: chỉ chủ cơ sở và admin; ghi lịch sử
create or replace function public.fn_reverse_order(p_order uuid, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v orders; v_rev uuid; v_snap jsonb;
begin
  select * into v from orders where id = p_order;
  if not found or auth.uid() is null or not public.can_access_outlet(v.outlet_id) then
    raise exception 'Không tìm thấy đơn' using errcode = '42501';
  end if;
  if not public.can_manage_outlet(v.outlet_id) then
    raise exception 'Chỉ chủ cơ sở hủy được đơn. Nhờ chủ cơ sở hủy giúp.' using errcode = '42501';
  end if;
  v_snap := public._order_snapshot(p_order);
  v_rev := public._reverse_order_core(p_order, p_reason);
  insert into audit_log (actor_id, table_name, row_id, action, old_row, new_row)
  values (auth.uid(), 'orders', p_order, 'cancel', v_snap, jsonb_build_object('reason', coalesce(nullif(btrim(p_reason), ''), 'Hủy đơn')));
  return jsonb_build_object('reversal_id', v_rev);
end $$;

-- Chuyển thành đơn tặng: đi qua fn_reverse_order nên cũng chỉ chủ cơ sở; giữ đúng chai / cốc
create or replace function public.fn_mark_gift(p_order uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v orders; v_lines jsonb;
begin
  select * into v from orders where id = p_order;
  if not found then raise exception 'Không tìm thấy đơn' using errcode = 'P0001'; end if;
  select jsonb_agg(jsonb_build_object('product_id', product_id, 'qty', qty, 'container', container)) into v_lines
    from order_lines where order_id = p_order;
  perform public.fn_reverse_order(p_order, 'Chuyển thành đơn tặng');
  return public.fn_post_order(jsonb_build_object('outlet_id', v.outlet_id, 'business_date', v.business_date,
           'is_gift', true, 'lines', v_lines, 'note', 'Tặng'));
end $$;

-- 2. Sửa đơn: p = { lines: [{product_id, qty, container}], discount_vnd, discount_reason }
create or replace function public.fn_edit_order(p_order uuid, p jsonb, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v orders; v_old jsonb; v_res jsonb; v_new uuid; v_why text := nullif(btrim(coalesce(p_reason, '')), '');
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
  v_old := public._order_snapshot(p_order);
  perform public._reverse_order_core(p_order, 'Sửa đơn' || coalesce(': ' || v_why, ''));
  v_res := public.fn_post_order(jsonb_build_object(
    'outlet_id', v.outlet_id, 'business_date', v.business_date, 'placed_at', v.placed_at, 'channel', v.channel,
    'is_gift', v.is_gift, 'note', v.note, 'lines', p->'lines',
    'discount_vnd', coalesce(p->>'discount_vnd', '0'), 'discount_reason', p->>'discount_reason'));
  v_new := (v_res->>'id')::uuid;
  update orders set payment_method = v.payment_method, customer_name = v.customer_name where id = v_new;
  insert into audit_log (actor_id, table_name, row_id, action, old_row, new_row)
  values (auth.uid(), 'orders', v_new, 'edit', v_old, public._order_snapshot(v_new) || jsonb_build_object('reason', v_why));
  return v_res || jsonb_build_object('replaced', p_order);
end $$;
revoke all on function public.fn_edit_order(uuid, jsonb, text) from public, anon;
grant execute on function public.fn_edit_order(uuid, jsonb, text) to authenticated;

-- 4. Chủ cơ sở đọc được lịch sử của đơn thuộc cơ sở mình (admin đã đọc được mọi dòng từ 0007)
drop policy if exists audit_orders_owner on public.audit_log; -- lúc chạy trên production (15/11) đã bỏ dòng này vì policy chưa tồn tại
create policy audit_orders_owner on public.audit_log for select to authenticated
  using (table_name = 'orders' and exists (select 1 from public.orders o where o.id = audit_log.row_id and public.can_manage_outlet(o.outlet_id)));
create index if not exists audit_log_orders_row on public.audit_log (row_id) where table_name = 'orders';

create or replace view public.v_order_changes with (security_invoker = true) as
select a.id, a.at, a.actor_id, a.action, a.old_row, a.new_row, o.id as order_id, o.outlet_id, o.business_date, o.seq_in_day
from public.audit_log a join public.orders o on o.id = a.row_id
where a.table_name = 'orders' and a.action in ('cancel', 'edit', 'set_info');
grant select on public.v_order_changes to authenticated;

-- Kiểm tra (chạy thử rồi hủy bằng raise exception):
--   1. Nhân viên gọi fn_reverse_order / fn_edit_order → lỗi "Chỉ chủ cơ sở…".
--   2. Chủ cơ sở sửa đơn 2 Vàng thành 1 Vàng + 1 Matcha cốc → đơn cũ 'reversed', đơn mới cùng placed_at, cùng khách, cùng cách nhận tiền;
--      audit_log có 1 dòng 'edit' với old_row.lines và new_row.lines khác nhau.
--   3. Hủy đơn → 1 dòng 'cancel' có reason. select * from v_order_changes order by at desc limit 5.
