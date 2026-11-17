-- Phân quyền bằng RLS: ai thấy gì, và không ai ghi thẳng vào bảng được (phải qua hàm fn_*)
begin;
do $$
declare f jsonb := t.fixture(); a uuid := (f->>'a')::uuid; b uuid := (f->>'b')::uuid; md uuid := t.product('md'); n int; oid uuid;
begin
  -- Mỗi cơ sở một đơn
  perform t.login((f->>'admin')::uuid);
  perform fn_post_order(jsonb_build_object('outlet_id', b, 'client_id', gen_random_uuid(), 'lines', jsonb_build_array(jsonb_build_object('product_id', md, 'qty', 1))));
  perform t.login((f->>'staff')::uuid);
  oid := (fn_post_order(jsonb_build_object('outlet_id', a, 'client_id', gen_random_uuid(), 'lines', jsonb_build_array(jsonb_build_object('product_id', md, 'qty', 1))))->>'id')::uuid;

  -- Nhân viên cơ sở A: chỉ thấy dữ liệu cơ sở A
  set local role authenticated;
  perform t.eq((select count(*)::int from orders where outlet_id = a), 1, 'nhân viên thấy đơn cơ sở mình');
  perform t.eq((select count(*)::int from orders where outlet_id = b), 0, 'nhân viên không thấy đơn cơ sở khác');
  perform t.eq((select count(*)::int from order_lines), 1, 'nhân viên chỉ thấy dòng đơn cơ sở mình');
  perform t.eq((select count(*)::int from stock_movements where outlet_id = b), 0, 'nhân viên không thấy biến động kho cơ sở khác');
  perform t.eq((select count(*)::int from outlets), 1, 'nhân viên chỉ thấy cơ sở mình');
  perform t.eq((select count(*)::int from audit_log), 0, 'nhân viên không đọc được lịch sử sửa, hủy');
  perform t.eq((select count(*)::int from v_daily_sales where outlet_id = b), 0, 'view báo cáo cũng theo quyền (security_invoker)');

  -- Không ghi thẳng vào bảng nghiệp vụ được
  perform t.throws(format('insert into orders (outlet_id, seq_in_day, business_date) values (%L, 99, vn_today())', a), 'không insert thẳng vào orders', 'row-level security');
  perform t.throws(format('insert into stock_movements (outlet_id, ingredient_id, qty_delta, reason, business_date) select %L, id, 100, %L, vn_today() from ingredients limit 1', a, 'purchase'),
                   'không insert thẳng vào stock_movements', 'row-level security');
  update orders set total_vnd = 1 where id = oid; get diagnostics n = row_count;
  perform t.eq(n, 0, 'không update thẳng được đơn');
  delete from orders where id = oid; get diagnostics n = row_count;
  perform t.eq(n, 0, 'không delete được đơn');
  delete from stock_movements where outlet_id = a; get diagnostics n = row_count;
  perform t.eq(n, 0, 'không delete được biến động kho');
  reset role;
  perform t.eq((select total_vnd from orders where id = oid), 15000, 'đơn còn nguyên sau các lần thử sửa, xóa');

  -- Nhân viên không gọi được hàm cho cơ sở khác
  perform t.throws(format($q$select fn_post_order('{"outlet_id":"%s","client_id":"%s","lines":[{"product_id":"%s","qty":1}]}')$q$, b, gen_random_uuid(), md), 'nhân viên không ghi đơn cho cơ sở khác', 'không có quyền');
  perform t.throws(format('select fn_reverse_order(%L, %L)', (select id from orders where outlet_id = b limit 1), 'thử'), 'nhân viên không hoàn tác đơn cơ sở khác');

  -- Người đã đăng nhập nhưng không thuộc cơ sở nào
  perform t.login((f->>'other')::uuid);
  set local role authenticated;
  perform t.eq((select count(*)::int from orders), 0, 'người ngoài không thấy đơn nào');
  perform t.eq((select count(*)::int from outlets), 0, 'người ngoài không thấy cơ sở nào');
  perform t.eq((select count(*)::int from memberships), 0, 'người ngoài không thấy danh sách thành viên');
  perform t.eq((select count(*)::int from profiles), 1, 'người ngoài chỉ thấy hồ sơ của mình');
  perform t.eq((select count(*)::int from bootstrap_admins), 0, 'không ai đọc được danh sách admin khởi tạo');
  reset role;
  perform t.throws(format($q$select fn_post_order('{"outlet_id":"%s","client_id":"%s","lines":[{"product_id":"%s","qty":1}]}')$q$, a, gen_random_uuid(), md), 'người ngoài không ghi đơn được', 'không có quyền');

  -- Chưa đăng nhập
  perform t.logout();
  set local role anon;
  perform t.eq((select count(*)::int from orders), 0, 'chưa đăng nhập: không thấy đơn');
  perform t.eq((select count(*)::int from outlets), 0, 'chưa đăng nhập: không thấy cơ sở');
  perform t.eq((select count(*)::int from products), 0, 'chưa đăng nhập: không thấy danh mục món');
  reset role;
  perform t.throws(format($q$select fn_post_order('{"outlet_id":"%s","client_id":"%s","lines":[{"product_id":"%s","qty":1}]}')$q$, a, gen_random_uuid(), md), 'chưa đăng nhập không ghi đơn được');

  -- Admin thấy mọi cơ sở
  perform t.login((f->>'admin')::uuid);
  set local role authenticated;
  perform t.ok((select count(*) from orders where outlet_id in (a, b)) = 2, 'admin thấy đơn của mọi cơ sở');
  reset role;

  -- Mọi bảng trong schema public đều bật RLS
  perform t.eq((select string_agg(c.relname, ', ') from pg_class c join pg_namespace n on n.oid = c.relnamespace
                 where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity), null::text, 'bảng chưa bật RLS');
end $$;
rollback;
