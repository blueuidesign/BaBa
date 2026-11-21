-- Nhân viên sửa, hủy đơn trong 7 ngày gần nhất (0064); có lịch sử; quá 7 ngày thì nhờ chủ; người ngoài bị chặn
begin;
do $$
declare f jsonb := t.fixture(); a uuid := (f->>'a')::uuid; md uuid := t.product('md'); tmc uuid := t.product('tmc');
  o1 uuid; o2 uuid; old uuid; x jsonb; st uuid := (f->>'staff')::uuid;
begin
  -- Chủ ghi một đơn hôm qua; nhân viên vẫn sửa được (không cần là người ghi, không giới hạn 10 phút)
  perform t.login((f->>'owner')::uuid);
  o1 := (fn_post_order(jsonb_build_object('outlet_id', a, 'client_id', gen_random_uuid(), 'business_date', vn_today() - 1,
          'lines', jsonb_build_array(jsonb_build_object('product_id', md, 'qty', 1))))->>'id')::uuid;
  o2 := (fn_post_order(jsonb_build_object('outlet_id', a, 'client_id', gen_random_uuid(), 'business_date', vn_today() - 6,
          'lines', jsonb_build_array(jsonb_build_object('product_id', md, 'qty', 1))))->>'id')::uuid;
  old := (fn_post_order(jsonb_build_object('outlet_id', a, 'client_id', gen_random_uuid(), 'business_date', vn_today() - 7,
          'lines', jsonb_build_array(jsonb_build_object('product_id', md, 'qty', 1))))->>'id')::uuid;

  perform t.login(st);
  x := fn_edit_order(o1, jsonb_build_object('lines', jsonb_build_array(jsonb_build_object('product_id', tmc, 'qty', 2))), 'khách đổi món');
  perform t.eq((select status from orders where id = o1), 'reversed', 'nhân viên sửa đơn hôm qua: đơn cũ thành đã sửa');
  perform t.eq((select total_vnd from orders where id = (x->>'id')::uuid), 60000, 'đơn mới đúng món đã sửa');
  perform t.ok(exists (select 1 from audit_log where action = 'edit' and row_id = (x->>'id')::uuid and actor_id = st), 'lịch sử ghi nhân viên đã sửa');

  perform fn_reverse_order(o2, 'ghi nhầm');
  perform t.eq((select status from orders where id = o2), 'reversed', 'nhân viên hủy được đơn 6 ngày trước');
  perform t.ok(exists (select 1 from audit_log where action = 'cancel' and row_id = o2 and actor_id = st), 'lịch sử ghi nhân viên đã hủy');

  perform t.throws(format('select fn_reverse_order(%L, null)', old), 'nhân viên không hủy được đơn 7 ngày trước', 'quá 7 ngày');
  perform t.throws(format($q$select fn_edit_order(%L, '{"lines":[{"product_id":"%s","qty":1}]}', null)$q$, old, md), 'nhân viên không sửa được đơn 7 ngày trước', 'quá 7 ngày');
  -- Đổi ngày bán vẫn chỉ chủ cơ sở
  perform t.throws(format('select fn_move_orders(array[%L]::uuid[], %L::date)', (x->>'id'), vn_today()), 'nhân viên vẫn không đổi ngày được', 'Chỉ chủ cơ sở');

  -- Chủ thì không giới hạn 7 ngày
  perform t.login((f->>'owner')::uuid);
  perform fn_reverse_order(old, 'chủ hủy');
  perform t.eq((select status from orders where id = old), 'reversed', 'chủ hủy được đơn cũ hơn 7 ngày');

  -- Người ngoài bị chặn
  perform t.login((f->>'other')::uuid);
  perform t.throws(format('select fn_reverse_order(%L, null)', (x->>'id')), 'người ngoài không hủy được', 'Không tìm thấy');
end $$;
rollback;
