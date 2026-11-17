-- Ghi đơn: tổng tiền, giảm giá 5%/10% theo phần, đơn tặng, gửi lại không trùng, hoàn tác, sửa đơn
begin;
do $$
declare f jsonb := t.fixture(); a uuid := (f->>'a')::uuid; r jsonb; r2 jsonb; cid uuid := gen_random_uuid(); x jsonb;
  md uuid := t.product('md'); tmc uuid := t.product('tmc');
begin
  perform t.login((f->>'staff')::uuid);

  -- Đơn thường: 2 Mầm Đỏ (15K) + 1 Matcha (30K)
  r := fn_post_order(jsonb_build_object('outlet_id', a, 'client_id', cid, 'customer_name', '  Yến  ', 'lines', jsonb_build_array(
        jsonb_build_object('product_id', md, 'qty', 2), jsonb_build_object('product_id', tmc, 'qty', 1))));
  perform t.eq((r->>'total_vnd')::int, 60000, 'đơn thường: tổng tiền');
  perform t.eq((r->>'seq_in_day')::int, 1, 'đơn đầu ngày có số thứ tự 1');
  perform t.eq((select count(*)::int from order_lines where order_id = (r->>'id')::uuid), 2, 'đơn thường: 2 dòng món');
  perform t.eq((select customer_name from orders where id = (r->>'id')::uuid), 'Yến', 'tên khách được cắt khoảng trắng');
  perform t.ok((select bool_and(recipe_id is not null and unit_price_vnd > 0) from order_lines where order_id = (r->>'id')::uuid), 'dòng đơn lưu giá và phiên bản công thức lúc bán');

  -- Gửi lại cùng client_id (mất mạng rồi gửi lại): không tạo đơn thứ hai
  r2 := fn_post_order(jsonb_build_object('outlet_id', a, 'client_id', cid, 'lines', jsonb_build_array(jsonb_build_object('product_id', md, 'qty', 9))));
  perform t.eq(r2->>'id', r->>'id', 'gửi lại cùng client_id trả về đơn cũ');
  perform t.eq((r2->>'duplicate')::boolean, true, 'gửi lại được đánh dấu duplicate');
  perform t.eq((select count(*)::int from orders where outlet_id = a), 1, 'gửi lại không tạo đơn mới');

  -- Giảm 10% cả đơn: 3 Mầm Đỏ = 45.000 → giảm 4.500
  r := fn_post_order(jsonb_build_object('outlet_id', a, 'client_id', gen_random_uuid(), 'discount_pct', 10,
        'lines', jsonb_build_array(jsonb_build_object('product_id', md, 'qty', 3))));
  perform t.eq((r->>'discount_vnd')::int, 4500, 'giảm 10% cả đơn: tiền giảm');
  perform t.eq((r->>'total_vnd')::int, 40500, 'giảm 10% cả đơn: tổng tiền');

  -- Giảm 10% cho 1 phần: phải rơi vào phần giá cao nhất (Matcha 30K → giảm 3.000)
  r := fn_post_order(jsonb_build_object('outlet_id', a, 'client_id', gen_random_uuid(), 'discount_pct', 10, 'discount_parts', 1,
        'lines', jsonb_build_array(jsonb_build_object('product_id', md, 'qty', 2), jsonb_build_object('product_id', tmc, 'qty', 1))));
  perform t.eq((r->>'discount_vnd')::int, 3000, 'giảm 10% một phần: giảm phần giá cao nhất');
  perform t.eq((select discount_qty from order_lines where order_id = (r->>'id')::uuid and product_id = tmc), 1, 'giảm một phần: ghi vào dòng Matcha');
  perform t.eq((select discount_qty from order_lines where order_id = (r->>'id')::uuid and product_id = md), 0, 'giảm một phần: dòng Mầm Đỏ không giảm');

  -- Giảm 5% cho 2 phần trong đơn 2 Mầm Đỏ + 1 Matcha: Matcha (1.500) rồi 1 Mầm Đỏ (750)
  r := fn_post_order(jsonb_build_object('outlet_id', a, 'client_id', gen_random_uuid(), 'discount_pct', 5, 'discount_parts', 2,
        'lines', jsonb_build_array(jsonb_build_object('product_id', md, 'qty', 2), jsonb_build_object('product_id', tmc, 'qty', 1))));
  perform t.eq((r->>'discount_vnd')::int, 2250, 'giảm 5% hai phần');

  perform t.throws(format($q$select fn_post_order('{"outlet_id":"%s","client_id":"%s","discount_pct":20,"lines":[{"product_id":"%s","qty":1}]}')$q$, a, gen_random_uuid(), md),
                   'chỉ cho giảm 5% hoặc 10%', '5% hoặc 10%');
  perform t.throws(format($q$select fn_post_order('{"outlet_id":"%s","client_id":"%s","lines":[]}')$q$, a, gen_random_uuid()), 'đơn không có món bị từ chối', 'chưa có món');
  perform t.throws(format($q$select fn_post_order('{"outlet_id":"%s","client_id":"%s","lines":[{"product_id":"%s","qty":1,"container":"lon"}]}')$q$, a, gen_random_uuid(), md),
                   'bao bì lạ bị từ chối', 'bao bì');

  -- Dòng số âm hoặc bằng 0 bị bỏ qua, không làm sai tiền
  r := fn_post_order(jsonb_build_object('outlet_id', a, 'client_id', gen_random_uuid(), 'lines', jsonb_build_array(
        jsonb_build_object('product_id', md, 'qty', -5), jsonb_build_object('product_id', md, 'qty', 0), jsonb_build_object('product_id', tmc, 'qty', 2))));
  perform t.eq((r->>'total_vnd')::int, 60000, 'dòng số âm và số 0 bị bỏ qua');

  -- Đơn tặng: tổng 0, không tính doanh thu, vẫn tính chai tặng
  r := fn_post_order(jsonb_build_object('outlet_id', a, 'client_id', gen_random_uuid(), 'is_gift', true, 'payment_method', 'cash',
        'lines', jsonb_build_array(jsonb_build_object('product_id', md, 'qty', 1))));
  perform t.eq((r->>'total_vnd')::int, 0, 'đơn tặng: tổng tiền 0');
  perform t.eq((select payment_method from orders where id = (r->>'id')::uuid), null::text, 'đơn tặng: không ghi cách nhận tiền');

  -- Doanh thu ngày trên báo cáo phải bằng tổng các đơn không tặng
  perform t.eq((select revenue_vnd from v_daily_sales where outlet_id = a and business_date = vn_today()),
               (select sum(total_vnd)::int from orders where outlet_id = a and status = 'active' and not is_gift), 'báo cáo ngày: doanh thu khớp tổng các đơn');
  perform t.eq((select gift_bottles from v_daily_sales where outlet_id = a and business_date = vn_today()), 1, 'báo cáo ngày: 1 chai tặng');

  -- Hoàn tác: đơn cũ đổi trạng thái, có bản ghi đảo, không xóa gì
  x := fn_reverse_order((r->>'id')::uuid, 'ghi nhầm');
  perform t.eq((select status from orders where id = (r->>'id')::uuid), 'reversed', 'hoàn tác: đơn cũ thành reversed');
  perform t.eq((select count(*)::int from orders where reversal_of = (r->>'id')::uuid and status = 'reversal'), 1, 'hoàn tác: có một bản ghi đảo');
  perform t.throws(format('select fn_reverse_order(%L, %L)', r->>'id', 'lần hai'), 'không hoàn tác hai lần');

  -- Sửa đơn: nhân viên không được, chủ cơ sở được; đơn cũ thành reversed, đơn mới thay thế
  r := fn_post_order(jsonb_build_object('outlet_id', a, 'client_id', gen_random_uuid(), 'lines', jsonb_build_array(jsonb_build_object('product_id', md, 'qty', 2))));
  perform t.throws(format($q$select fn_edit_order('%s', '{"client_id":"%s","lines":[{"product_id":"%s","qty":1}]}', 'bớt')$q$, r->>'id', gen_random_uuid(), md),
                   'nhân viên không sửa được đơn', 'chủ cơ sở');
  perform t.login((f->>'owner')::uuid);
  x := fn_edit_order((r->>'id')::uuid, jsonb_build_object('client_id', gen_random_uuid(), 'lines', jsonb_build_array(jsonb_build_object('product_id', md, 'qty', 1))), 'khách đổi ý');
  perform t.eq((select status from orders where id = (r->>'id')::uuid), 'reversed', 'sửa đơn: đơn cũ thành reversed');
  perform t.eq((x->>'total_vnd')::int, 15000, 'sửa đơn: đơn mới có tổng mới');
end $$;
rollback;
