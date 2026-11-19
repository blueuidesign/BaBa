-- Giảm theo số tiền (0063): mỗi phần (mặc định 5.000 đ), một số phần, tổng đơn chia theo giá; chặn giảm quá tiền; đơn rỗng; sửa đơn giữ kiểu giảm
begin;
do $$
declare f jsonb := t.fixture(); a uuid := (f->>'a')::uuid; r jsonb; x jsonb; o uuid;
  md uuid := t.product('md'); tmc uuid := t.product('tmc');
begin
  perform t.login((f->>'staff')::uuid);

  -- 2 Mầm Đỏ (15K) + 1 Matcha (30K) = 60.000. Giảm 5.000 mỗi phần, tất cả phần → 15.000
  r := fn_post_order(jsonb_build_object('outlet_id', a, 'client_id', gen_random_uuid(), 'discount_kind', 'per_part', 'discount_amount', 5000,
        'lines', jsonb_build_array(jsonb_build_object('product_id', md, 'qty', 2), jsonb_build_object('product_id', tmc, 'qty', 1))));
  o := (r->>'id')::uuid;
  perform t.eq((r->>'discount_vnd')::int, 15000, 'mỗi phần 5.000, 3 phần: giảm 15.000');
  perform t.eq((r->>'total_vnd')::int, 45000, 'mỗi phần 5.000: thu 45.000');
  perform t.eq((select discount_kind || ':' || discount_value from orders where id = o), 'per_part:5000', 'lưu kiểu giảm và số tiền');
  perform t.eq((select sum(discount_qty * discount_unit_vnd)::int from order_lines where order_id = o), 15000, 'giảm ghi đủ vào từng dòng');

  -- Một số phần: 1 phần → rơi vào Matcha (giá cao nhất)
  r := fn_post_order(jsonb_build_object('outlet_id', a, 'client_id', gen_random_uuid(), 'discount_kind', 'per_part', 'discount_amount', 5000, 'discount_parts', 1,
        'lines', jsonb_build_array(jsonb_build_object('product_id', md, 'qty', 2), jsonb_build_object('product_id', tmc, 'qty', 1))));
  perform t.eq((r->>'discount_vnd')::int, 5000, 'mỗi phần, 1 phần: giảm 5.000');
  perform t.eq((select discount_qty from order_lines where order_id = (r->>'id')::uuid and product_id = tmc), 1, 'một phần: giảm vào Matcha');

  -- Giảm mỗi phần lớn hơn giá món rẻ nhất được giảm: bị chặn
  perform t.throws(format($q$select fn_post_order('{"outlet_id":"%s","client_id":"%s","discount_kind":"per_part","discount_amount":16000,"lines":[{"product_id":"%s","qty":1},{"product_id":"%s","qty":1}]}')$q$,
                   a, gen_random_uuid(), tmc, md), 'giảm mỗi phần quá giá món bị chặn', 'lớn hơn giá món');
  -- Nhưng chỉ giảm 1 phần (Matcha 30K) thì 16.000 được
  r := fn_post_order(jsonb_build_object('outlet_id', a, 'client_id', gen_random_uuid(), 'discount_kind', 'per_part', 'discount_amount', 16000, 'discount_parts', 1,
        'lines', jsonb_build_array(jsonb_build_object('product_id', tmc, 'qty', 1), jsonb_build_object('product_id', md, 'qty', 1))));
  perform t.eq((r->>'discount_vnd')::int, 16000, 'giảm 16.000 cho 1 phần Matcha được phép');

  -- Tổng đơn 10.000 trên đơn 60.000: chia theo giá, tổng giảm đúng 10.000
  r := fn_post_order(jsonb_build_object('outlet_id', a, 'client_id', gen_random_uuid(), 'discount_kind', 'order', 'discount_amount', 10000,
        'lines', jsonb_build_array(jsonb_build_object('product_id', md, 'qty', 2), jsonb_build_object('product_id', tmc, 'qty', 1))));
  o := (r->>'id')::uuid;
  perform t.eq((r->>'discount_vnd')::int, 10000, 'tổng đơn: giảm đúng 10.000');
  perform t.eq((r->>'total_vnd')::int, 50000, 'tổng đơn: thu 50.000');
  perform t.eq((select discount_unit_vnd from order_lines where order_id = o and product_id = tmc), 5000, 'Matcha (một nửa giá trị đơn) chịu 5.000');
  perform t.eq((select discount_unit_vnd from order_lines where order_id = o and product_id = md), 2500, 'Mầm Đỏ mỗi phần chịu 2.500');
  perform t.ok((select sum(discount_qty * discount_unit_vnd) from order_lines where order_id = o) between 10000 - 3 and 10000, 'phần chia vào dòng không vượt tổng giảm');
  perform t.throws(format($q$select fn_post_order('{"outlet_id":"%s","client_id":"%s","discount_kind":"order","discount_amount":60001,"lines":[{"product_id":"%s","qty":2},{"product_id":"%s","qty":1}]}')$q$,
                   a, gen_random_uuid(), md, tmc), 'giảm tổng đơn quá tạm tính bị chặn', 'lớn hơn tạm tính');
  perform t.throws(format($q$select fn_post_order('{"outlet_id":"%s","client_id":"%s","discount_kind":"order","discount_amount":0,"lines":[{"product_id":"%s","qty":1}]}')$q$,
                   a, gen_random_uuid(), md), 'số tiền giảm 0 bị từ chối', 'lớn hơn 0');
  perform t.throws(format($q$select fn_post_order('{"outlet_id":"%s","client_id":"%s","discount_kind":"abc","discount_amount":1000,"lines":[{"product_id":"%s","qty":1}]}')$q$,
                   a, gen_random_uuid(), md), 'kiểu giảm lạ bị từ chối', 'không hợp lệ');

  -- Đơn tặng thì bỏ qua giảm giá
  r := fn_post_order(jsonb_build_object('outlet_id', a, 'client_id', gen_random_uuid(), 'is_gift', true, 'discount_kind', 'per_part', 'discount_amount', 5000,
        'lines', jsonb_build_array(jsonb_build_object('product_id', md, 'qty', 1))));
  perform t.eq((r->>'discount_vnd')::int, 0, 'đơn tặng: không giảm');
  perform t.eq((select discount_kind from orders where id = (r->>'id')::uuid), null::text, 'đơn tặng: không ghi kiểu giảm');

  -- App cũ vẫn gửi discount_pct: chạy như trước và ghi kiểu pct
  r := fn_post_order(jsonb_build_object('outlet_id', a, 'client_id', gen_random_uuid(), 'discount_pct', 10,
        'lines', jsonb_build_array(jsonb_build_object('product_id', md, 'qty', 3))));
  perform t.eq((r->>'discount_vnd')::int, 4500, 'app cũ: giảm 10% như trước');
  perform t.eq((select discount_kind || ':' || discount_value from orders where id = (r->>'id')::uuid), 'pct:10', 'app cũ: ghi kiểu pct');

  -- Lỗi đơn rỗng: mọi dòng số lượng 0 thì báo lỗi, không tạo đơn
  perform t.throws(format($q$select fn_post_order('{"outlet_id":"%s","client_id":"%s","lines":[{"product_id":"%s","qty":0},{"product_id":"%s","qty":-1}]}')$q$,
                   a, gen_random_uuid(), md, tmc), 'đơn toàn dòng số lượng 0 bị từ chối', 'chưa có món');

  -- Sửa đơn: chuyển sang giảm theo tổng đơn
  perform t.login((f->>'owner')::uuid);
  x := fn_edit_order(o, jsonb_build_object('lines', jsonb_build_array(jsonb_build_object('product_id', tmc, 'qty', 2)),
        'discount_kind', 'per_part', 'discount_amount', 3000), 'khách quen');
  perform t.eq((select total_vnd from orders where id = (x->>'id')::uuid), 54000, 'sửa đơn: 2 Matcha bớt 3.000 mỗi phần');
  perform t.eq((select discount_kind from orders where id = (x->>'id')::uuid), 'per_part', 'sửa đơn: giữ kiểu giảm mới');
end $$;
rollback;
