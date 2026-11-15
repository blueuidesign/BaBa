-- 0040 · Nhân viên được hoàn tác (và đánh dấu tặng) đơn do chính mình vừa ghi (Tùng 15/11 07:49).
-- Quy tắc: chủ cơ sở, admin hủy được mọi đơn của ngày chưa chốt (như 0038).
--          Nhân viên chỉ hủy được đơn do chính mình ghi, trong 10 phút kể từ lúc đơn lên máy chủ (orders.created_at). Đơn cũ hơn phải nhờ chủ cơ sở.
-- fn_mark_gift đi qua fn_reverse_order nên theo cùng quy tắc. Sửa đơn (fn_edit_order) vẫn chỉ chủ cơ sở, admin.
-- Mọi lần hủy vẫn ghi vào audit_log (action 'cancel'), nên hiện trong Lịch sử sửa, hủy đơn.
create or replace function public.fn_reverse_order(p_order uuid, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v orders; v_rev uuid; v_snap jsonb;
begin
  select * into v from orders where id = p_order;
  if not found or auth.uid() is null or not public.can_access_outlet(v.outlet_id) then
    raise exception 'Không tìm thấy đơn' using errcode = '42501';
  end if;
  if not public.can_manage_outlet(v.outlet_id) then
    if v.created_by is distinct from auth.uid() then
      raise exception 'Đơn này do người khác ghi. Chỉ chủ cơ sở hủy được.' using errcode = '42501';
    end if;
    if v.created_at < now() - interval '10 minutes' then
      raise exception 'Đơn đã ghi quá 10 phút. Nhờ chủ cơ sở hủy hoặc sửa giúp.' using errcode = '42501';
    end if;
  end if;
  v_snap := public._order_snapshot(p_order);
  v_rev := public._reverse_order_core(p_order, p_reason);
  insert into audit_log (actor_id, table_name, row_id, action, old_row, new_row)
  values (auth.uid(), 'orders', p_order, 'cancel', v_snap, jsonb_build_object('reason', coalesce(nullif(btrim(p_reason), ''), 'Hủy đơn')));
  return jsonb_build_object('reversal_id', v_rev);
end $$;

-- Kiểm tra (thử rồi hủy bằng raise exception):
--   1. Nhân viên ghi đơn rồi fn_reverse_order ngay → được; có 1 dòng 'cancel' trong audit_log.
--   2. Nhân viên hủy đơn của người khác → "Đơn này do người khác ghi…".
--   3. Nhân viên hủy đơn của mình có created_at cũ hơn 10 phút → "Đơn đã ghi quá 10 phút…".
