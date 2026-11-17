-- Trừ kho lúc bán: nguyên liệu theo công thức, syrup (ít đường 20 ml), bao bì chai và cốc, túi theo đơn; hoàn tác thì cộng lại
begin;
do $$
declare f jsonb := t.fixture(); a uuid := (f->>'a')::uuid; b uuid := (f->>'b')::uuid; r jsonb; md uuid := t.product('md'); tmc uuid := t.product('tmc'); n int;
begin
  perform t.login((f->>'staff')::uuid);

  -- 2 Mầm Đỏ chai + 1 Matcha cốc ít đường
  r := fn_post_order(jsonb_build_object('outlet_id', a, 'client_id', gen_random_uuid(), 'lines', jsonb_build_array(
        jsonb_build_object('product_id', md, 'qty', 2),
        jsonb_build_object('product_id', tmc, 'qty', 1, 'container', 'coc', 'sugar', 'less'))));
  perform t.eq(t.stock(a, 'dau_do'), -120::numeric, 'Mầm Đỏ: 60 g đậu đỏ mỗi chai');
  perform t.eq(t.stock(a, 'dieu'), -32::numeric, 'Matcha: 32 g điều');
  perform t.eq(t.stock(a, 'matcha'), -3::numeric, 'Matcha: 3 g bột matcha');
  perform t.eq(t.stock(a, 'syrup'), -80::numeric, 'syrup: 2 × 30 ml + ít đường 20 ml');
  perform t.eq(t.stock(a, 'chai_330'), -2::numeric, 'chai: 1 chai mỗi phần chai');
  perform t.eq(t.stock(a, 'card'), -2::numeric, 'chai: 1 card');
  perform t.eq(t.stock(a, 'day_gai'), -2::numeric, 'chai: 1 dây');
  perform t.eq(t.stock(a, 'nhan'), -3::numeric, 'nhãn: 1 cái cho mỗi phần, chai lẫn cốc');
  perform t.eq(t.stock(a, 'ly_giay'), -1::numeric, 'cốc: 1 ly giấy');
  perform t.eq(t.stock(a, 'ong_hut'), -1::numeric, 'cốc: 1 ống hút');
  perform t.eq(t.stock(a, 'giay_chong_tran'), -1::numeric, 'cốc: 1 lót ly');
  perform t.eq(t.stock(a, 'tui_2'), -1::numeric, 'đơn 3 phần: 1 túi 2 ly');
  perform t.eq(t.stock(a, 'tui'), -1::numeric, 'đơn 3 phần: 1 túi 1 ly');
  perform t.eq(t.stock(b, 'dau_do'), 0::numeric, 'cơ sở khác không bị trừ');

  -- Hoàn tác: mọi vật tư về lại 0
  perform fn_reverse_order((r->>'id')::uuid, 'thử');
  select count(*) into n from (select ingredient_id from stock_movements where outlet_id = a group by 1 having sum(qty_delta) <> 0) z;
  perform t.eq(n, 0, 'hoàn tác đơn: kho về đúng như trước');

  -- Quy tắc túi theo số phần của cả đơn: 1 → 1 túi đơn; 2 → 1 túi đôi; 4 → 2 túi đôi; 5 → 2 túi đôi + 1 túi đơn
  perform t.login((f->>'admin')::uuid);
  perform fn_post_order(jsonb_build_object('outlet_id', b, 'client_id', gen_random_uuid(), 'lines', jsonb_build_array(jsonb_build_object('product_id', md, 'qty', 1))));
  perform t.eq(t.stock(b, 'tui'), -1::numeric, '1 phần: 1 túi 1 ly');
  perform t.eq(t.stock(b, 'tui_2'), 0::numeric, '1 phần: không dùng túi 2 ly');
  perform fn_post_order(jsonb_build_object('outlet_id', b, 'client_id', gen_random_uuid(), 'lines', jsonb_build_array(jsonb_build_object('product_id', md, 'qty', 2))));
  perform t.eq(t.stock(b, 'tui_2'), -1::numeric, '2 phần: 1 túi 2 ly');
  perform t.eq(t.stock(b, 'tui'), -1::numeric, '2 phần: không thêm túi 1 ly');
  perform fn_post_order(jsonb_build_object('outlet_id', b, 'client_id', gen_random_uuid(), 'lines', jsonb_build_array(
        jsonb_build_object('product_id', md, 'qty', 3), jsonb_build_object('product_id', tmc, 'qty', 2, 'container', 'coc'))));
  perform t.eq(t.stock(b, 'tui_2'), -3::numeric, '5 phần: thêm 2 túi 2 ly');
  perform t.eq(t.stock(b, 'tui'), -2::numeric, '5 phần: thêm 1 túi 1 ly');

  -- Matcha đường thường dùng 40 ml syrup; ít đường 20 ml
  perform t.eq(t.stock(b, 'syrup'), -(30 + 60 + 90 + 80)::numeric, 'syrup: Mầm Đỏ 30 ml, Matcha thường 40 ml');
end $$;
rollback;
