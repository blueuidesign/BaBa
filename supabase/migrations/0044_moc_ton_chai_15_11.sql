-- 0044 · Mốc tồn chai = 0 từ sáng 16/11 ở cơ sở Phan Văn Hớn (Tùng 15/11 21:52).
-- Vì sao: 13–15/11 bán 66 phần nhưng không ghi mẻ nấu nào, nên tồn chai tính ra là −66.
-- Cách làm giống 0026: chốt ngày 15/11 với số chai đếm còn = 0 cho mọi món (sổ nối thêm, không sửa đơn).
-- Tiền đếm = doanh thu theo đơn (tách tiền mặt / chuyển khoản) để không tạo chênh lệch tiền giả.
-- Hệ quả: ngày 15/11 bị khóa, không ghi hay sửa đơn của ngày này nữa (muốn sửa phải mở khóa ngày).
do $$
declare
  v_outlet uuid := '3e1f4df8-6dcb-4593-85a4-2bef47468f42';
  v_day date := '2026-11-15';
  v_dc uuid; v_rev int; v_tr int; v_btl int;
begin
  if exists (select 1 from day_closes where outlet_id = v_outlet and business_date = v_day and is_current) then
    raise exception 'Ngày 15/11 đã chốt rồi';
  end if;
  select coalesce(sum(total_vnd), 0),
         coalesce(sum(total_vnd) filter (where payment_method = 'transfer'), 0),
         coalesce(sum((select sum(qty) from order_lines l where l.order_id = o.id)), 0)
    into v_rev, v_tr, v_btl
    from orders o where outlet_id = v_outlet and business_date = v_day and status = 'active';
  insert into day_closes (outlet_id, business_date, cash_counted_vnd, transfer_counted_vnd, revenue_by_orders_vnd,
                          bottles_by_orders, bottles_out, diff_bottles, diff_money_vnd, money_diff_reason, closed_by)
  values (v_outlet, v_day, v_rev - v_tr, v_tr, v_rev, v_btl, v_btl, 0, 0,
          'Mốc tồn chai = 0 từ 16/11 (13–15/11 bán không ghi mẻ nấu nên tồn bị âm 66)',
          '2e8b7277-123f-4b66-8475-eb01a5266e0d')
  returning id into v_dc;
  insert into day_close_lines (day_close_id, product_id, counted_left)
  select v_dc, p.product_id, 0 from (
    select product_id from outlet_menu where outlet_id = v_outlet and enabled
    union select l.product_id from order_lines l join orders o on o.id = l.order_id where o.outlet_id = v_outlet
  ) p;
end $$;
