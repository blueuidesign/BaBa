-- Chi phí, nhập hàng, kiểm kê: nhân viên thêm được chi phí nhưng không hủy; nhập hàng cộng kho; kiểm kê đưa kho về số đếm
begin;
do $$
declare f jsonb := t.fixture(); a uuid := (f->>'a')::uuid; r jsonb; x jsonb; cat uuid; ing uuid; n int;
begin
  select id into cat from expense_categories where code = 'dien_nuoc';
  select id into ing from ingredients where code = 'dau_do';

  -- Nhân viên thêm chi phí được, không hủy được; chủ cơ sở hủy được và có bản ghi đảo
  perform t.login((f->>'staff')::uuid);
  r := fn_post_expense_v2(jsonb_build_object('outlet_id', a, 'client_id', gen_random_uuid(), 'category_id', cat, 'amount_vnd', 50000, 'item_name', 'Tiền điện', 'spent_on', vn_today()));
  perform t.ok((r->>'id') is not null, 'nhân viên thêm được chi phí');
  perform t.throws(format('select fn_reverse_expense(%L, %L)', r->>'id', 'nhầm'), 'nhân viên không hủy được chi phí');
  perform t.throws(format($q$select fn_post_expense_v2('{"outlet_id":"%s","client_id":"%s","category_id":"%s","amount_vnd":-5,"item_name":"x"}')$q$, a, gen_random_uuid(), cat), 'số tiền âm bị từ chối');
  perform t.ok((fn_find_duplicate_expense(a, vn_today(), cat, 50000)) is not null, 'tìm được khoản chi trùng ngày, nhóm, số tiền');
  perform t.login((f->>'owner')::uuid);
  x := fn_reverse_expense((r->>'id')::uuid, 'ghi nhầm');
  perform t.eq((select status from expenses where id = (r->>'id')::uuid), 'reversed', 'hủy chi phí: bản cũ thành reversed');
  perform t.eq((select count(*)::int from expenses where reversal_of = (r->>'id')::uuid), 1, 'hủy chi phí: có bản ghi đảo');
  perform t.login((f->>'other')::uuid);
  perform t.throws(format($q$select fn_post_expense_v2('{"outlet_id":"%s","client_id":"%s","category_id":"%s","amount_vnd":1000,"item_name":"x"}')$q$, a, gen_random_uuid(), cat), 'người ngoài không thêm được chi phí');

  -- Nhập hàng: cộng kho đúng số
  perform t.login((f->>'owner')::uuid);
  r := fn_post_purchase(jsonb_build_object('outlet_id', a, 'client_id', gen_random_uuid(), 'total_vnd', 124000,
        'lines', jsonb_build_array(jsonb_build_object('ingredient_id', ing, 'qty', 2000, 'unit_cost_vnd', 62))));
  perform t.eq(t.stock(a, 'dau_do'), 2000::numeric, 'nhập hàng cộng kho');

  -- Kiểm kê: đếm được 1.850 thì kho về 1.850, phần lệch ghi thành biến động điều chỉnh
  r := fn_post_count(jsonb_build_object('outlet_id', a, 'client_id', gen_random_uuid(), 'lines', jsonb_build_array(jsonb_build_object('ingredient_id', ing, 'qty_actual', 1850))));
  perform t.eq(t.stock(a, 'dau_do'), 1850::numeric, 'kiểm kê đưa kho về số đếm');
  select count(*) into n from stock_movements where outlet_id = a and ingredient_id = ing and reason = 'count_adjust' and qty_delta = -150;
  perform t.eq(n, 1, 'kiểm kê ghi phần lệch thành một biến động điều chỉnh');

  -- Tiền đầu ngày
  perform t.login((f->>'staff')::uuid);
  perform fn_set_cash_open(jsonb_build_object('outlet_id', a, 'client_id', gen_random_uuid(), 'amount_vnd', 200000));
  perform t.eq((select amount_vnd from cash_opens where outlet_id = a and business_date = vn_today() order by created_at desc limit 1), 200000, 'ghi tiền đầu ngày');
  r := fn_post_day_end(jsonb_build_object('outlet_id', a, 'client_id', gen_random_uuid(), 'cash_counted_vnd', 200000, 'lines', '[]'::jsonb));
  perform t.eq((r->>'cash_open_vnd')::int, 200000, 'ghi cuối ngày lấy được tiền đầu ngày để trừ ra');
end $$;
rollback;
