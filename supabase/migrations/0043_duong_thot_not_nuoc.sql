-- 0043 · "Đường thốt nốt nước" là nguyên liệu mới, khác "Đường thốt nốt" (Tùng 15/11 21:47).
-- 0042 đã ghi nhầm 7.800 g vào "Đường thốt nốt". Sửa bằng một lần kiểm kê nối thêm, không xóa dòng cũ:
--   - tạo nguyên liệu "Đường thốt nốt nước" (đơn vị g, mua theo kg), bật ở mọi cơ sở, bằng fn_create_ingredient;
--   - kiểm kê: Đường thốt nốt nước = 7.800 g; Đường thốt nốt trở về 1.000 g là số sổ trước 0042 (chưa ai đếm lại món này).
do $$
declare v jsonb; v_new uuid;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', '2e8b7277-123f-4b66-8475-eb01a5266e0d', 'role', 'authenticated')::text, true);
  select id into v_new from public.ingredients where code = 'thot_not_nuoc';
  if v_new is null then
    v := public.fn_create_ingredient('3e1f4df8-6dcb-4593-85a4-2bef47468f42', 'Đường thốt nốt nước', 'additive', 'g');
    v_new := (v->>'id')::uuid;
    update public.ingredients set code = 'thot_not_nuoc', purchase_unit = 'kg', purchase_factor = 1000, sort_order = 35, storage_note = 'Dạng nước.' where id = v_new;
  end if;
  perform public.fn_post_count(jsonb_build_object(
    'outlet_id', '3e1f4df8-6dcb-4593-85a4-2bef47468f42',
    'client_id', 'a6f0c1e2-4b7d-4c1e-9a15-202611150043',
    'reason', 'other',
    'note', 'Sửa kiểm kê 15/11: 7.800 g là Đường thốt nốt nước, không phải Đường thốt nốt',
    'lines', jsonb_build_array(
      jsonb_build_object('ingredient_id', v_new, 'qty_actual', 7800),
      jsonb_build_object('ingredient_id', (select id from public.ingredients where code = 'thot_not'), 'qty_actual', 1000))));
end $$;
-- Kiểm tra: tồn Đường thốt nốt nước = 7800, Đường thốt nốt = 1000 ở Phan Văn Hớn.
