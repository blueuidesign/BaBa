-- Món Buffet (0065): giá và nguyên liệu theo từng dòng; trừ kho đúng số gam; giá vốn; sửa, đổi ngày giữ nguyên liệu; bắt buộc có nguyên liệu
begin;
do $$
declare f jsonb := t.fixture(); a uuid := (f->>'a')::uuid; bf uuid := t.product('buffet'); md uuid := t.product('md');
  dau uuid; dieu uuid; r jsonb; o uuid; l uuid; s0 numeric; s1 numeric; x jsonb; m jsonb; n uuid;
begin
  select id into dau from ingredients where code = 'dau_do'; select id into dieu from ingredients where code = 'dieu';
  perform t.ok(bf is not null, 'có món Buffet');
  perform t.eq((select is_custom from products where id = bf), true, 'Buffet là món tự chọn');
  perform t.ok(exists (select 1 from outlet_menu where outlet_id = a and product_id = bf and enabled), 'Buffet bật ở cơ sở');
  perform t.eq(current_price(a, bf, vn_today()), 30000, 'giá mặc định 30.000');

  perform t.login((f->>'staff')::uuid);
  s0 := t.stock(a, 'dau_do');
  r := fn_post_order(jsonb_build_object('outlet_id', a, 'client_id', gen_random_uuid(), 'lines', jsonb_build_array(
        jsonb_build_object('product_id', bf, 'qty', 1, 'price', 35000, 'custom', jsonb_build_array(
          jsonb_build_object('ingredient_id', dau, 'qty', 30), jsonb_build_object('ingredient_id', dieu, 'qty', 20))),
        jsonb_build_object('product_id', md, 'qty', 1))));
  o := (r->>'id')::uuid;
  perform t.eq((r->>'total_vnd')::int, 35000 + 15000, 'tổng = giá Buffet đã chỉnh + món thường');
  select id into l from order_lines where order_id = o and product_id = bf;
  perform t.eq((select count(*)::int from order_line_items where order_line_id = l), 2, 'lưu 2 nguyên liệu');
  perform t.eq((select recipe_id from order_lines where id = l), null::uuid, 'dòng Buffet không dùng công thức');
  s1 := t.stock(a, 'dau_do');
  -- Mầm Đỏ dùng đậu đỏ theo công thức; Buffet thêm đúng 30 g
  perform t.eq(s0 - s1, 30 + (select ri.qty from recipe_items ri join recipes rc on rc.id = ri.recipe_id
                                 where rc.product_id = md and rc.valid_to is null and ri.ingredient_id = dau limit 1), 'trừ kho đậu đỏ: 30 g của Buffet + công thức Mầm Đỏ');

  -- Chưa chọn nguyên liệu: bị từ chối
  perform t.throws(format($q$select fn_post_order('{"outlet_id":"%s","client_id":"%s","lines":[{"product_id":"%s","qty":1,"price":30000,"custom":[]}]}')$q$, a, gen_random_uuid(), bf),
                   'Buffet không nguyên liệu bị từ chối', 'chưa chọn nguyên liệu');
  perform t.throws(format($q$select fn_post_order('{"outlet_id":"%s","client_id":"%s","lines":[{"product_id":"%s","qty":1,"price":-5000,"custom":[{"ingredient_id":"%s","qty":20}]}]}')$q$, a, gen_random_uuid(), bf, dau),
                   'giá âm bị từ chối', 'không hợp lệ');
  -- Giảm 10% áp lên giá Buffet
  r := fn_post_order(jsonb_build_object('outlet_id', a, 'client_id', gen_random_uuid(), 'discount_kind', 'pct', 'discount_pct', 10, 'lines', jsonb_build_array(
        jsonb_build_object('product_id', bf, 'qty', 1, 'price', 40000, 'container', 'coc', 'custom', jsonb_build_array(jsonb_build_object('ingredient_id', dieu, 'qty', 25))))));
  perform t.eq((r->>'total_vnd')::int, 36000, 'giảm 10% trên giá Buffet 40.000');

  -- Sửa đơn giữ nguyên liệu khi app gửi lại (chủ cơ sở sửa)
  perform t.login((f->>'owner')::uuid);
  x := fn_edit_order(o, jsonb_build_object('lines', jsonb_build_array(
        jsonb_build_object('product_id', bf, 'qty', 1, 'price', 30000, 'custom', jsonb_build_array(jsonb_build_object('ingredient_id', dau, 'qty', 25))))), 'bớt');
  perform t.eq((select sum(i.qty) from order_line_items i join order_lines l2 on l2.id = i.order_line_id where l2.order_id = (x->>'id')::uuid), 25::numeric, 'sửa đơn: nguyên liệu mới');

  -- Đổi ngày chép cả nguyên liệu
  perform t.login((f->>'owner')::uuid);
  m := fn_move_orders(array[(x->>'id')::uuid], vn_today() - 1);
  n := (m->'moved'->0->>'id')::uuid;
  perform t.eq((select sum(i.qty) from order_line_items i join order_lines l2 on l2.id = i.order_line_id where l2.order_id = n), 25::numeric, 'đổi ngày: chép nguyên liệu Buffet');

  -- Danh sách nguyên liệu: đậu đỏ (đã chọn trong Buffet) đứng trước
  perform t.ok((select count(*) from fn_buffet_ingredients(a)) > 0, 'có danh sách nguyên liệu');
  perform t.login((f->>'other')::uuid);
  perform t.eq((select count(*)::int from fn_buffet_ingredients(a)), 0, 'người ngoài không thấy danh sách');
  set local role authenticated;
  perform t.eq((select count(*)::int from order_line_items), 0, 'người ngoài không đọc được nguyên liệu Buffet');
  reset role;
end $$;
rollback;
