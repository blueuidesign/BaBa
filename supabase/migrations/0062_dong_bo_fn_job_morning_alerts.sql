-- 0062: đưa bản fn_job_morning_alerts đang chạy trên production vào repo.
-- Bản trong 0006 để trống tên bảng ở cột outlet_id, name nên báo "column reference is ambiguous" khi chạy;
-- production đã được sửa trực tiếp từ trước mà chưa có migration. Bộ kiểm thử tự động (17/11) phát hiện lệch này.
-- Trên production đây là thay thế bằng chính nội dung đang có, không đổi hành vi.
create or replace function public.fn_job_morning_alerts() returns integer
language plpgsql security definer set search_path = public as $$
declare v_n int := 0; v_d date := public.vn_today(); r record;
begin
  for r in select s.outlet_id, coalesce(s.supplier_name, 'Chưa gán nhà cung cấp') as supplier,
                  count(*) as n, string_agg(s.name, ', ' order by s.name) as items
             from v_stock_status s join outlets o on o.id = s.outlet_id and o.status = 'active'
            where s.needs_order group by 1, 2 loop
    insert into notifications (outlet_id, kind, severity, title, body, link, dedupe_key)
    values (r.outlet_id, 'reorder', 'warn', 'Nên đặt hôm nay: ' || r.supplier || ' (' || r.n || ' món)', r.items, '/kho',
            'reorder:' || r.outlet_id || ':' || r.supplier || ':' || v_d)
    on conflict (dedupe_key) do nothing;
    v_n := v_n + 1;
  end loop;
  for r in select outlet_id, ingredient_id, name, nearest_expiry from v_stock_status where expiring loop
    insert into notifications (outlet_id, kind, severity, title, body, link, dedupe_key)
    values (r.outlet_id, 'expiry', 'warn', r.name || ' sắp hết hạn', 'Hạn ' || to_char(r.nearest_expiry, 'DD/MM'),
            '/kho/' || r.ingredient_id, 'expiry:' || r.outlet_id || ':' || r.ingredient_id || ':' || v_d)
    on conflict (dedupe_key) do nothing;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
