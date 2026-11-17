-- Giá vốn chuẩn và báo cáo lãi: giá vốn = nguyên liệu + syrup + bao bì; báo cáo cộng đúng; nhân viên không xem được lãi
begin;
do $$
declare f jsonb := t.fixture(); a uuid := (f->>'a')::uuid; r jsonb; md uuid := t.product('md'); tmc uuid := t.product('tmc'); d jsonb; pr jsonb; nr jsonb; oid uuid;
begin
  -- Giá vốn một chai Mầm Đỏ: thành phần phải cộng lại đúng bằng tổng
  d := fn_unit_cost_detail(md, 'chai', vn_today());
  perform t.eq((d->>'ingredients')::int + (d->>'syrup')::int + (d->>'packaging')::int, (d->>'total')::int, 'giá vốn = nguyên liệu + syrup + bao bì');
  perform t.eq((d->>'total')::int, fn_unit_cost(md, 'chai', vn_today()), 'hai hàm giá vốn cho cùng một số');
  perform t.eq((d->>'ingredients')::int, 3720, 'Mầm Đỏ: 60 g đậu đỏ × 62 đ');
  perform t.eq((d->>'packaging')::int, 3527, 'bao bì chai từ 17/11 gồm túi: 3.177 + 350');
  perform t.eq((fn_unit_cost_detail(md, 'coc', vn_today())->>'packaging')::int, 2299, 'bao bì cốc');
  perform t.ok(fn_unit_cost_sugar(tmc, 'chai', vn_today(), 'less') < fn_unit_cost(tmc, 'chai', vn_today()), 'ít đường thì giá vốn thấp hơn');
  perform t.eq((fn_unit_cost_detail(md, 'chai', date '2026-11-16')->>'packaging')::int, 3177, 'giá vốn có phiên bản: trước 17/11 chưa tính túi');

  -- Bán: 2 Mầm Đỏ chai + 1 Matcha cốc, giảm 10%; hủy 1 Mầm Đỏ cuối ngày
  perform t.login((f->>'staff')::uuid);
  oid := (fn_post_order(jsonb_build_object('outlet_id', a, 'client_id', gen_random_uuid(), 'discount_pct', 10, 'lines', jsonb_build_array(
            jsonb_build_object('product_id', md, 'qty', 2), jsonb_build_object('product_id', tmc, 'qty', 1, 'container', 'coc'))))->>'id')::uuid;
  perform t.eq((select unit_cost_vnd from order_lines where order_id = oid and product_id = md), fn_unit_cost(md, 'chai', vn_today()), 'dòng đơn chốt giá vốn lúc bán');
  perform fn_post_day_end(jsonb_build_object('outlet_id', a, 'client_id', gen_random_uuid(), 'lines', jsonb_build_array(jsonb_build_object('product_id', md, 'waste_qty', 1))));

  perform t.throws(format('select fn_profit_report(%L, vn_today(), vn_today() + 1)', a), 'nhân viên không xem được báo cáo lãi', 'không có quyền');

  perform t.login((f->>'owner')::uuid);
  pr := fn_profit_report(a, vn_today(), vn_today() + 1);
  perform t.eq((pr->>'revenue')::int, 54000, 'báo cáo lãi: doanh thu sau giảm giá');
  perform t.eq((pr->>'parts')::int, 3, 'báo cáo lãi: số phần');
  perform t.eq((pr->>'cogs')::int, 2 * fn_unit_cost(md, 'chai', vn_today()) + fn_unit_cost(tmc, 'coc', vn_today()), 'báo cáo lãi: giá vốn hàng bán');
  perform t.eq((pr->>'waste_qty')::int, 1, 'báo cáo lãi: chai hủy lấy từ ghi cuối ngày');
  perform t.eq((select sum((x->>'revenue')::int)::int from jsonb_array_elements(pr->'by_product') x), 54000, 'báo cáo lãi: doanh thu theo món cộng lại bằng tổng');

  nr := fn_net_report(a, vn_today(), vn_today() + 1);
  perform t.eq((nr->'months'->0->>'revenue')::int, 54000, 'báo cáo lãi ròng: doanh thu');
  perform t.eq((nr->'months'->0->>'waste_cost')::int, fn_unit_cost(md, 'chai', vn_today()), 'báo cáo lãi ròng: tiền chai hủy');
end $$;
rollback;
