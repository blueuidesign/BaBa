-- 0052 · Nhập đơn giá chuẩn theo artifact "Giá vốn, công thức, bảng giá" (16/11) và tính giá vốn cho đơn đã có.
-- Hai hàm tính giá vốn không cho gọi trực tiếp từ app (lộ giá vốn cho nhân viên); báo cáo gọi qua RPC có kiểm tra quyền.
revoke execute on function public.fn_unit_cost_detail(uuid, text, date) from public, anon, authenticated;
revoke execute on function public.fn_unit_cost(uuid, text, date) from public, anon, authenticated;

do $$
declare v_org uuid := (select org_id from public.outlets where id = '3e1f4df8-6dcb-4593-85a4-2bef47468f42');
begin
  insert into public.ingredient_std_costs (org_id, ingredient_id, cost_per_unit, valid_from, note, created_by)
  select v_org, i.id, x.c, date '2026-10-01', x.n, '2e8b7277-123f-4b66-8475-eb01a5266e0d'
  from (values
    ('dieu', 140, 'Bảng giá Hà gửi 13/11: 140.000 đ/kg'),
    ('oc_cho', 200, 'Bảng giá Hà gửi 13/11: 200.000 đ/kg'),
    ('hanh_nhan', 180, 'Bảng giá Hà gửi 13/11: 180.000 đ/kg'),
    ('dau_do', 62, 'Bảng giá Hà gửi 13/11: 62.000 đ/kg'),
    ('me', 92, 'Bảng giá Hà gửi 13/11: 92.000 đ/kg'),
    ('cacao', 185, 'Bảng giá Hà gửi 13/11: 185.000 đ/kg'),
    ('matcha', 500, 'Bảng giá Hà gửi 13/11: 500.000 đ/kg'),
    ('thanh_long', 20, 'Bảng giá Hà gửi 13/11: 20.000 đ/kg'),
    ('khoai', 20, 'Bảng giá Hà gửi 13/11: 20.000 đ/kg'),
    ('bi_do', 20, 'Bảng giá Hà gửi 13/11: 20.000 đ/kg'),
    ('bap', 30, 'Giá chuẩn Tùng chốt 16/11: 20.000 đ mua 6–8 trái, mỗi trái hơn 100 g hạt'),
    ('ca_rot', 20, 'Tạm tính: 3.000 đ/củ, giả định 150 g/củ. Cần Hà xác nhận'),
    ('dua', 25, 'Tạm lấy từ lần mua 28/10: 25.000 đ/kg'),
    ('la_dua', 580, 'Tạm lấy từ lần mua 01/10: 58.000 đ/100 g'),
    ('thot_not', 34, 'Hà báo 16/11: 34.000 đ/kg'),
    ('nhai', 110, 'Bảng giá Hà gửi 13/11: 110.000 đ/kg'),
    ('muoi_hong', 40, 'Bảng giá Hà gửi 13/11: 40.000 đ/kg'),
    ('syrup', 22.233, 'Tự nấu: (800 g thốt nốt × 34 + 5 g nhài × 110) ÷ 1.250 ml; 30 ml = 667 đ như Hà tính')
  ) x(code, c, n) join public.ingredients i on i.code = x.code and i.org_id = v_org
  on conflict (org_id, ingredient_id, valid_from) do nothing;

  insert into public.container_std_costs (org_id, container, cost_vnd, breakdown, valid_from, note, created_by) values
    (v_org, 'chai', 3177, '[{"name":"Chai 330 ml + nắp","cost":2000},{"name":"Tem 2 mặt","cost":650},{"name":"Card","cost":242},{"name":"Dây thừng 50 cm","cost":285}]'::jsonb,
     date '2026-10-01', 'Bảng giá Hà gửi 13/11', '2e8b7277-123f-4b66-8475-eb01a5266e0d'),
    (v_org, 'coc', 2299, '[{"name":"Ly giấy","cost":1400},{"name":"Ống hút","cost":140},{"name":"Tem 1 mặt","cost":325},{"name":"Lót ly","cost":84},{"name":"Bịch 1 ly","cost":350}]'::jsonb,
     date '2026-10-01', 'Bảng giá Hà gửi 13/11', '2e8b7277-123f-4b66-8475-eb01a5266e0d')
  on conflict (org_id, container, valid_from) do nothing;

  update public.products set cost_syrup_ml = 40 where code in ('tmc', 'tcc') and org_id = v_org;

  -- Đơn đã có: tính giá vốn theo công thức và đơn giá chuẩn hiện tại
  update public.order_lines l set unit_cost_vnd = public.fn_unit_cost(l.product_id, coalesce(l.container, 'chai'), public.vn_today())
   where l.unit_cost_vnd is null;
end $$;
-- Kiểm tra sau khi chạy: ngày 15/11 giá vốn 302.358 đ (doanh thu 680.000 đ); tuần 09–15/11 giá vốn 1.219.998 đ.
