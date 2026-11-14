-- 0037 · Thêm món "Đậu Đỏ" 25.000 đ (Tùng yêu cầu 14/11 17:54).
-- Lý do: Hà bán món này trên Knote (tên "Đậu đỏ", thêm topping, 25.000 đ) nhưng app chưa có, nên phải ghi tạm vào Mầm Đỏ Hồng Hào.
-- Dùng đúng hàm fn_admin_save_product (0033) dưới quyền admin để có giá theo phiên bản, dòng thực đơn mọi cơ sở và audit_log.
-- Tạm đặt: nhóm Mầm Xanh, tên "Đậu Đỏ", chưa có công thức. Tên chính thức, nhóm và công thức cần hỏi Hà; admin sửa được ở Quản lý món.
-- Không đổi 3 phần đã nhập ở 0036 (vẫn nằm ở Mầm Đỏ Hồng Hào, có ghi chú).
do $$
declare v jsonb;
begin
  if exists (select 1 from public.products where code = 'dd' or lower(name) = lower('Đậu Đỏ')) then return; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', '2e8b7277-123f-4b66-8475-eb01a5266e0d', 'role', 'authenticated')::text, true);
  v := public.fn_admin_save_product(jsonb_build_object('name', 'Đậu Đỏ', 'short_name', 'Đậu Đỏ', 'line', 'xanh', 'status', 'active', 'price_vnd', 25000));
  update public.products set code = 'dd', color = '#8E3B36' where id = (v->>'id')::uuid;
end $$;

-- Kiểm tra: select code, name, line, color, public.current_price('<outlet>', id, current_date) from products where code = 'dd';  → 25000
--           select count(*) from outlet_menu m join products p on p.id = m.product_id where p.code = 'dd';  → bằng số cơ sở
