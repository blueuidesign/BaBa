-- Đổi ngày bán (0063): chủ cơ sở chuyển một hoặc nhiều đơn trong 7 ngày gần nhất, nguyên khối; tiền, giảm giá, kho đi theo đơn
begin;
do $$
declare f jsonb := t.fixture(); a uuid := (f->>'a')::uuid; d0 date := vn_today(); d1 date := vn_today() - 1;
  md uuid := t.product('md'); tmc uuid := t.product('tmc'); o1 uuid; o2 uuid; o3 uuid; r jsonb; n1 uuid;
  rev0 int; rev1 int; dau numeric;
begin
  perform t.login((f->>'staff')::uuid);
  -- Ba đơn ghi nhầm vào hôm qua
  o1 := (fn_post_order(jsonb_build_object('outlet_id', a, 'client_id', gen_random_uuid(), 'business_date', d1, 'payment_method', 'cash',
          'discount_kind', 'per_part', 'discount_amount', 5000,
          'lines', jsonb_build_array(jsonb_build_object('product_id', md, 'qty', 2), jsonb_build_object('product_id', tmc, 'qty', 1))))->>'id')::uuid;
  o2 := (fn_post_order(jsonb_build_object('outlet_id', a, 'client_id', gen_random_uuid(), 'business_date', d1,
          'lines', jsonb_build_array(jsonb_build_object('product_id', md, 'qty', 1))))->>'id')::uuid;
  o3 := (fn_post_order(jsonb_build_object('outlet_id', a, 'client_id', gen_random_uuid(), 'business_date', d1,
          'lines', jsonb_build_array(jsonb_build_object('product_id', tmc, 'qty', 1))))->>'id')::uuid;
  -- Một đơn có sẵn hôm nay
  perform fn_post_order(jsonb_build_object('outlet_id', a, 'client_id', gen_random_uuid(), 'lines', jsonb_build_array(jsonb_build_object('product_id', md, 'qty', 1))));
  dau := t.stock(a, 'dau_do');

  -- Nhân viên không đổi được
  perform t.throws(format('select fn_move_orders(array[%L]::uuid[], %L::date)', o1, d0), 'nhân viên không đổi ngày được', 'Chỉ chủ cơ sở');

  perform t.login((f->>'owner')::uuid);
  perform t.throws(format('select fn_move_orders(array[%L]::uuid[], %L::date)', o1, d0 + 1), 'không chuyển sang ngày mai', 'sau hôm nay');
  perform t.throws(format('select fn_move_orders(array[%L]::uuid[], %L::date)', o1, d0 - 7), 'không chuyển về quá 7 ngày', '7 ngày');
  perform t.throws(format('select fn_move_orders(array[%L]::uuid[], %L::date)', o1, d1), 'đơn đã ở ngày đó', 'đã ở ngày');
  perform t.throws(format('select fn_move_orders(array[]::uuid[], %L::date)', d0), 'chưa chọn đơn', 'Chưa chọn');

  -- Nguyên khối: một đơn đã hủy thì cả lô giữ nguyên
  perform fn_reverse_order(o3, 'thử');
  perform t.throws(format('select fn_move_orders(array[%L,%L,%L]::uuid[], %L::date)', o1, o2, o3, d0), 'một đơn đã hủy thì cả lô bị từ chối', 'đã hủy');
  perform t.eq((select status from orders where id = o1), 'active', 'nguyên khối: đơn 1 vẫn ở ngày cũ');

  -- Chuyển 2 đơn sang hôm nay
  r := fn_move_orders(array[o2, o1], d0);
  perform t.eq(jsonb_array_length(r->'moved'), 2, 'chuyển 2 đơn');
  perform t.eq((select status from orders where id = o1), 'reversed', 'đơn cũ chuyển thành đã hủy');
  perform t.eq((select reversal_reason from orders where reversal_of = o1), 'Chuyển sang ' || to_char(d0, 'DD/MM'), 'bản hủy ghi lý do chuyển');
  n1 := (select (x->>'id')::uuid from jsonb_array_elements(r->'moved') x where (x->>'from_id')::uuid = o1);
  perform t.eq((select business_date from orders where id = n1), d0, 'đơn mới ở hôm nay');
  perform t.eq((select seq_in_day from orders where id = n1), 2, 'đơn mới lấy số tiếp theo của hôm nay (theo giờ bán)');
  perform t.eq((select total_vnd || '/' || discount_vnd || '/' || discount_kind || '/' || payment_method from orders where id = n1), '45000/15000/per_part/cash', 'tiền, giảm giá, nhận tiền đi theo đơn');
  perform t.eq((select sum(discount_qty * discount_unit_vnd)::int from order_lines where order_id = n1), 15000, 'giảm từng dòng được chép');
  perform t.eq((select (placed_at at time zone 'Asia/Ho_Chi_Minh')::date from orders where id = n1), d0, 'giờ bán chuyển sang ngày mới');
  perform t.eq(t.stock(a, 'dau_do'), dau, 'tổng kho không đổi khi chuyển ngày');
  perform t.eq((select sum(qty_delta) from stock_movements m join ingredients i on i.id = m.ingredient_id
                 where m.outlet_id = a and i.code = 'dau_do' and m.business_date = d1), 0::numeric, 'hôm qua: kho của các đơn đã chuyển được cộng lại hết');
  select coalesce(sum(revenue_vnd), 0) into rev1 from v_daily_sales where outlet_id = a and business_date = d1;
  select coalesce(sum(revenue_vnd), 0) into rev0 from v_daily_sales where outlet_id = a and business_date = d0;
  perform t.eq(rev1, 0, 'doanh thu hôm qua bớt đúng (chỉ còn đơn đã hủy)');
  perform t.eq(rev0, 15000 + 45000 + 15000, 'doanh thu hôm nay cộng đúng');
  perform t.ok(exists (select 1 from audit_log where action = 'move' and row_id = n1), 'lịch sử ghi lần chuyển');

  -- Người ngoài không thấy đơn
  perform t.login((f->>'other')::uuid);
  perform t.throws(format('select fn_move_orders(array[%L]::uuid[], %L::date)', n1, d1), 'người ngoài bị chặn', 'Không tìm thấy');
end $$;
rollback;
