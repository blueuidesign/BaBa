-- Buffet theo combo (0066): cao cấp, phổ thông; giá theo combo; sai số hạt bị từ chối; Khác giữ giá tự chọn; đổi ngày giữ combo
begin;
do $$
declare f jsonb := t.fixture(); a uuid := (f->>'a')::uuid; bf uuid := t.product('buffet');
  dieu uuid; oc uuid; hn uuid; dau uuid; me uuid; sen uuid; c21 uuid; c22 uuid; r jsonb; o uuid; m jsonb; opt jsonb;
begin
  select id into dieu from ingredients where code = 'dieu'; select id into oc from ingredients where code = 'oc_cho';
  select id into hn from ingredients where code = 'hanh_nhan'; select id into dau from ingredients where code = 'dau_do';
  select id into me from ingredients where code = 'me'; select id into sen from ingredients where code = 'hat_sen';
  perform t.eq((select count(*)::int from ingredients where buffet_tier = 'premium'), 3, '3 loại cao cấp');
  perform t.eq((select count(*)::int from ingredients where buffet_tier = 'regular'), 8, '8 loại phổ thông');
  select id into c21 from buffet_combos where n_premium = 2 and n_regular = 1;
  select id into c22 from buffet_combos where n_premium = 2 and n_regular = 2;
  perform t.eq((select price_vnd from buffet_combos where id = c21), 30000, 'combo 2+1 giá 30.000');

  perform t.login((f->>'staff')::uuid);
  opt := fn_buffet_options(a);
  perform t.eq(jsonb_array_length(opt->'combos'), 3, 'app thấy 3 combo');
  perform t.eq(jsonb_array_length(opt->'ingredients'), 11, 'app thấy 11 nguyên liệu');

  -- Combo đúng: giá theo combo dù app gửi giá khác
  r := fn_post_order(jsonb_build_object('outlet_id', a, 'client_id', gen_random_uuid(), 'lines', jsonb_build_array(
        jsonb_build_object('product_id', bf, 'qty', 1, 'combo', c21, 'price', 99000, 'custom', jsonb_build_array(
          jsonb_build_object('ingredient_id', dieu, 'qty', 20), jsonb_build_object('ingredient_id', oc, 'qty', 25),
          jsonb_build_object('ingredient_id', dau, 'qty', 30))))));
  o := (r->>'id')::uuid;
  perform t.eq((r->>'total_vnd')::int, 30000, 'giá theo combo, không theo giá app gửi');
  perform t.eq((select buffet_combo_id from order_lines where order_id = o), c21, 'lưu combo của dòng');

  -- Sai số hạt
  perform t.throws(format($q$select fn_post_order('{"outlet_id":"%s","client_id":"%s","lines":[{"product_id":"%s","qty":1,"combo":"%s","custom":[{"ingredient_id":"%s","qty":20},{"ingredient_id":"%s","qty":20},{"ingredient_id":"%s","qty":20},{"ingredient_id":"%s","qty":20}]}]}')$q$,
                   a, gen_random_uuid(), bf, c22, dieu, oc, hn, dau), 'combo 2+2 mà chọn 3 cao cấp bị từ chối', 'cần 2 cao cấp');
  perform t.throws(format($q$select fn_post_order('{"outlet_id":"%s","client_id":"%s","lines":[{"product_id":"%s","qty":1,"combo":"%s","custom":[{"ingredient_id":"%s","qty":20},{"ingredient_id":"%s","qty":20},{"ingredient_id":"%s","qty":20}]}]}')$q$,
                   a, gen_random_uuid(), bf, c21, dieu, oc, sen), 'nguyên liệu ngoài danh sách trong combo bị từ chối', 'cần 2 cao cấp');

  -- Khác: không combo, giữ giá tự chọn
  r := fn_post_order(jsonb_build_object('outlet_id', a, 'client_id', gen_random_uuid(), 'lines', jsonb_build_array(
        jsonb_build_object('product_id', bf, 'qty', 1, 'price', 40000, 'custom', jsonb_build_array(
          jsonb_build_object('ingredient_id', dieu, 'qty', 30), jsonb_build_object('ingredient_id', me, 'qty', 25))))));
  perform t.eq((r->>'total_vnd')::int, 40000, 'Khác: giá tự chọn');
  perform t.eq((select buffet_combo_id from order_lines where order_id = (r->>'id')::uuid), null::uuid, 'Khác: không có combo');

  -- Đổi ngày giữ combo
  perform t.login((f->>'owner')::uuid);
  m := fn_move_orders(array[o], vn_today() - 1);
  perform t.eq((select buffet_combo_id from order_lines where order_id = (m->'moved'->0->>'id')::uuid), c21, 'đổi ngày: giữ combo');

  perform t.login((f->>'other')::uuid);
  perform t.eq(fn_buffet_options(a), null::jsonb, 'người ngoài không thấy combo, nguyên liệu');
end $$;
rollback;
