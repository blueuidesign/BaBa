-- Ghi cuối ngày: chai hủy trừ kho, chai tồn không trừ; mỗi ngày một bản; sửa, hoàn tác; nhân viên chỉ trong ngày
begin;
do $$
declare f jsonb := t.fixture(); a uuid := (f->>'a')::uuid; r jsonb; r2 jsonb; md uuid := t.product('md'); tmc uuid := t.product('tmc');
  yday date := vn_today() - 1; y jsonb;
begin
  perform t.login((f->>'staff')::uuid);
  -- Có 2 đơn trong ngày: 30.000 tiền mặt, 30.000 chuyển khoản
  perform fn_post_order(jsonb_build_object('outlet_id', a, 'client_id', gen_random_uuid(), 'payment_method', 'cash', 'lines', jsonb_build_array(jsonb_build_object('product_id', md, 'qty', 2))));
  perform fn_post_order(jsonb_build_object('outlet_id', a, 'client_id', gen_random_uuid(), 'payment_method', 'transfer', 'lines', jsonb_build_array(jsonb_build_object('product_id', tmc, 'qty', 1))));
  perform t.eq(t.stock(a, 'dau_do'), -120::numeric, 'trước khi ghi cuối ngày: đã trừ theo đơn');

  -- Ghi cuối ngày: hủy 2 Mầm Đỏ, tồn 3 Matcha, đếm 80.000 tiền mặt (lệch +50.000)
  r := fn_post_day_end(jsonb_build_object('outlet_id', a, 'client_id', gen_random_uuid(), 'cash_counted_vnd', 80000, 'money_note', 'thối nhầm',
        'lines', jsonb_build_array(jsonb_build_object('product_id', md, 'waste_qty', 2), jsonb_build_object('product_id', tmc, 'left_qty', 3))));
  perform t.eq((r->>'waste_total')::int, 2, 'tổng chai hủy');
  perform t.eq((r->>'left_total')::int, 3, 'tổng chai tồn');
  perform t.eq((r->>'expected_cash_vnd')::int, 30000, 'tiền mặt theo đơn');
  perform t.eq((r->>'expected_transfer_vnd')::int, 30000, 'chuyển khoản theo đơn');
  perform t.eq(t.stock(a, 'dau_do'), -240::numeric, 'chai hủy trừ nguyên liệu (2 × 60 g)');
  perform t.eq(t.stock(a, 'chai_330'), -5::numeric, 'chai hủy trừ bao bì chai (3 đã bán + 2 hủy)');
  perform t.eq(t.stock(a, 'matcha'), -3::numeric, 'chai tồn không trừ kho');
  perform t.eq(t.stock(a, 'tui') + t.stock(a, 'tui_2'), -2::numeric, 'chai hủy không tốn túi');

  -- Mỗi ngày chỉ một bản đang hiệu lực
  perform t.throws(format($q$select fn_post_day_end('{"outlet_id":"%s","client_id":"%s","lines":[]}')$q$, a, gen_random_uuid()), 'ghi lần hai trong ngày bị chặn', 'đã ghi cuối ngày');
  perform t.throws(format($q$select fn_post_day_end('{"outlet_id":"%s","client_id":"%s","business_date":"%s","lines":[]}')$q$, a, gen_random_uuid(), vn_today() + 1), 'không ghi cho ngày chưa tới');
  perform t.throws(format($q$select fn_post_day_end('{"outlet_id":"%s","client_id":"%s","business_date":"%s","lines":[]}')$q$, a, gen_random_uuid(), yday), 'nhân viên không ghi được ngày đã qua', 'chủ cơ sở');

  -- Sửa: bản cũ thành reversed, bản mới thay; kho tính lại theo số hủy mới (hủy 1 thay vì 2)
  r2 := fn_edit_day_end((r->>'id')::uuid, jsonb_build_object('client_id', gen_random_uuid(), 'lines', jsonb_build_array(jsonb_build_object('product_id', md, 'waste_qty', 1))));
  perform t.eq((select status from day_ends where id = (r->>'id')::uuid), 'reversed', 'sửa: bản cũ thành reversed');
  perform t.eq((select count(*)::int from day_ends where outlet_id = a and business_date = vn_today() and status = 'active'), 1, 'sửa: vẫn chỉ một bản hiệu lực');
  perform t.eq(t.stock(a, 'dau_do'), -180::numeric, 'sửa: kho tính lại theo số hủy mới');
  perform t.eq((select count(*)::int from day_ends where outlet_id = a), 2, 'sửa: không xóa bản cũ');

  -- Hoàn tác: kho về như chỉ có đơn bán; ghi lại được
  perform fn_reverse_day_end((r2->>'id')::uuid);
  perform t.eq(t.stock(a, 'dau_do'), -120::numeric, 'hoàn tác: cộng lại nguyên liệu của chai hủy');
  perform t.throws(format('select fn_reverse_day_end(%L)', r2->>'id'), 'không hoàn tác hai lần', 'đã hoàn tác');
  r := fn_post_day_end(jsonb_build_object('outlet_id', a, 'client_id', gen_random_uuid(), 'lines', '[]'::jsonb));
  perform t.eq((r->>'waste_total')::int, 0, 'sau hoàn tác ghi lại được');

  -- Chủ cơ sở ghi và sửa được ngày đã qua; nhân viên thì không sửa, không hoàn tác được
  perform t.login((f->>'owner')::uuid);
  y := fn_post_day_end(jsonb_build_object('outlet_id', a, 'client_id', gen_random_uuid(), 'business_date', yday, 'lines', jsonb_build_array(jsonb_build_object('product_id', md, 'left_qty', 4))));
  perform t.eq((y->>'left_total')::int, 4, 'chủ cơ sở ghi bù ngày đã qua');
  perform t.login((f->>'staff')::uuid);
  perform t.throws(format('select fn_reverse_day_end(%L)', y->>'id'), 'nhân viên không hoàn tác được ngày đã qua', 'chủ cơ sở');
  perform t.throws(format($q$select fn_edit_day_end('%s', '{"client_id":"%s","lines":[]}')$q$, y->>'id', gen_random_uuid()), 'nhân viên không sửa được ngày đã qua', 'chủ cơ sở');
  perform t.login((f->>'other')::uuid);
  perform t.throws(format($q$select fn_post_day_end('{"outlet_id":"%s","client_id":"%s","lines":[]}')$q$, f->>'b', gen_random_uuid()), 'người ngoài không ghi được cuối ngày');

  -- Lịch sử bản ghi có cả bản ghi, bản đã thay và dòng hoàn tác
  perform t.ok((select count(*) from v_activity where outlet_id = a and kind = 'close' and title like 'Hoàn tác ghi cuối ngày%') = 2, 'lịch sử có 2 dòng hoàn tác (1 do sửa, 1 do hoàn tác)');
end $$;
rollback;
