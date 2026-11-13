-- 0026 · Dọn dữ liệu demo sáng 13/11 ở cơ sở Phan Văn Hớn và đặt tồn chai về 0 (Tùng 13/11 14:36).
-- Theo quy tắc sổ cái: không xóa cứng. Đơn và mẻ nấu được hoàn tác (có bản ghi đảo), chốt ngày được mở khóa có lý do.
do $$
declare
  v_outlet uuid := '3e1f4df8-6dcb-4593-85a4-2bef47468f42';
  v_day date := '2026-11-13';
  v_base date := '2026-11-12';
  v_reason text := 'Dữ liệu demo sáng 13/11, không phải bán thật';
  r record; v_rev uuid; v_dc uuid; v_rev_sum int; v_btl int;
begin
  -- 1. Mở khóa ngày 13/11 (lần chốt demo thôi hiệu lực, vẫn giữ trong sổ)
  for r in select * from day_closes where outlet_id = v_outlet and business_date = v_day and is_current loop
    update day_closes set is_current = false where id = r.id;
    insert into day_unlocks (outlet_id, business_date, day_close_id, reason) values (v_outlet, v_day, r.id, v_reason);
  end loop;

  -- 2. Hoàn tác các đơn ngày 13/11
  for r in select * from orders where outlet_id = v_outlet and business_date = v_day and status = 'active' loop
    update orders set status = 'reversed' where id = r.id;
    insert into orders (outlet_id, seq_in_day, business_date, channel, status, reversal_of, reversal_reason, total_vnd)
    values (v_outlet, -r.seq_in_day, v_day, r.channel, 'reversal', r.id, v_reason, 0) returning id into v_rev;
    insert into stock_movements (outlet_id, ingredient_id, qty_delta, reason, ref_table, ref_id, business_date)
    select outlet_id, ingredient_id, -qty_delta, 'reversal', 'orders', v_rev, business_date
      from stock_movements where ref_table = 'orders' and ref_id = r.id;
  end loop;

  -- 3. Hoàn tác mẻ nấu ngày 13/11: trả lại nguyên liệu, bao bì; kế hoạch nấu về nháp
  for r in select * from cook_runs where outlet_id = v_outlet and business_date = v_day and status = 'active' loop
    update cook_runs set status = 'reversed', reversal_reason = v_reason where id = r.id;
    insert into stock_movements (outlet_id, ingredient_id, qty_delta, reason, ref_table, ref_id, business_date)
    select outlet_id, ingredient_id, -qty_delta, 'reversal', 'cook_runs', r.id, business_date
      from stock_movements where ref_table = 'cook_runs' and ref_id = r.id and reason in ('cook', 'cook_packaging');
    if r.plan_id is not null then update cook_plans set status = 'draft' where id = r.plan_id; end if;
  end loop;

  -- 4. Tiền đầu ngày 13/11 về 0 (bản ghi mới, bản demo vẫn giữ)
  if exists (select 1 from cash_opens where outlet_id = v_outlet and business_date = v_day) then
    insert into cash_opens (outlet_id, business_date, amount_vnd) values (v_outlet, v_day, 0);
  end if;

  -- 5. Mốc tồn chai = 0: chốt ngày 12/11 với số chai đếm còn = 0 cho mọi món.
  --    Lý do: đơn cũ nhập từ Knote không có mẻ nấu đi kèm, nên tồn tính ra bị âm (khoảng −250 chai).
  --    Tiền đếm = doanh thu theo đơn để không tạo chênh lệch tiền giả.
  if not exists (select 1 from day_closes where outlet_id = v_outlet and business_date = v_base and is_current) then
    select coalesce(sum(total_vnd), 0), coalesce(sum((select sum(qty) from order_lines l where l.order_id = o.id)), 0)
      into v_rev_sum, v_btl
      from orders o where outlet_id = v_outlet and business_date = v_base and status = 'active';
    insert into day_closes (outlet_id, business_date, cash_counted_vnd, revenue_by_orders_vnd, bottles_by_orders, bottles_out,
                            diff_bottles, diff_money_vnd, money_diff_reason, closed_at)
    values (v_outlet, v_base, v_rev_sum, v_rev_sum, v_btl, v_btl, 0, 0,
            'Mốc tồn chai = 0 khi bắt đầu dùng app (đơn trước đó nhập từ Knote)', '2026-11-12 23:59:00+07')
    returning id into v_dc;
    insert into day_close_lines (day_close_id, product_id, counted_left)
    select v_dc, p.product_id, 0 from (
      select product_id from outlet_menu where outlet_id = v_outlet and enabled
      union select l.product_id from order_lines l join orders o on o.id = l.order_id where o.outlet_id = v_outlet
    ) p;
  end if;
end $$;
