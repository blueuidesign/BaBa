-- 0031 · Ghi cách nhận tiền và tên khách sau khi lưu đơn; doanh thu theo cách nhận tiền; hoa quả nhập theo quả (Tùng 13/11).

-- 1. Hoa quả: số gam trung bình của một quả, để nhập "1 quả" vẫn cộng kho theo gam. Người nhập sửa được ở từng lần mua.
alter table public.ingredients add column if not exists piece_g numeric(10,2) check (piece_g is null or piece_g > 0);
comment on column public.ingredients.piece_g is 'Gam phần dùng được của một quả/củ/trái (ước tính). null = không nhập theo quả.';
update public.ingredients i set piece_g = v.g
from (values ('thanh_long', 400), ('bap', 200), ('ca_rot', 150), ('bi_do', 1500), ('khoai', 250)) as v(code, g)
where i.code = v.code and i.piece_g is null;

-- 2. Ghi cách nhận tiền (cash | transfer) và tên khách cho một đơn đã lưu. Không đổi món, số lượng, tiền.
--    Tham số null = giữ nguyên; chuỗi rỗng = xóa. Mọi lần đổi ghi vào audit_log.
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
  if v_pay is distinct from o.payment_method or v_cust is distinct from o.customer_name then
    update orders set payment_method = v_pay, customer_name = v_cust where id = p_order;
    insert into audit_log (actor_id, table_name, row_id, action, old_row, new_row)
    values (auth.uid(), 'orders', p_order, 'set_info',
            jsonb_build_object('payment_method', o.payment_method, 'customer_name', o.customer_name),
            jsonb_build_object('payment_method', v_pay, 'customer_name', v_cust));
  end if;
  return jsonb_build_object('id', p_order, 'payment_method', v_pay, 'customer_name', v_cust);
end $function$;
revoke all on function public.fn_set_order_info(uuid, text, text) from public, anon;
grant execute on function public.fn_set_order_info(uuid, text, text) to authenticated;

-- 3. Doanh thu theo cách nhận tiền, theo ngày (đơn tặng không tính)
create or replace view public.v_daily_payments with (security_invoker = true) as
select outlet_id, business_date, coalesce(payment_method, 'unknown') as payment_method,
       sum(total_vnd)::int as revenue_vnd, count(*)::int as orders_count
from public.orders
where status = 'active' and not is_gift
group by outlet_id, business_date, coalesce(payment_method, 'unknown');
grant select on public.v_daily_payments to authenticated;

-- Kiểm tra: select * from v_daily_payments where business_date = '2026-11-13';
