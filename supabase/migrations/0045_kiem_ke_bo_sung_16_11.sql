-- 0045 · Kiểm kê bổ sung 16/11 ở Phan Văn Hớn, theo tin nhắn của Hà (Tùng chuyển 16/11 09:44).
-- Matcha 150 g, Cacao 100 g, Thanh long hết (0 g). Ghi bằng fn_post_count (nối thêm, không sửa dòng cũ).
-- Mè đen và hạnh nhân ("thêm nửa kg") chưa ghi: chưa rõ là hàng cần mua hay số đếm thêm.
do $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', '2e8b7277-123f-4b66-8475-eb01a5266e0d', 'role', 'authenticated')::text, true);
  perform public.fn_post_count(jsonb_build_object(
    'outlet_id', '3e1f4df8-6dcb-4593-85a4-2bef47468f42',
    'client_id', 'a6f0c1e2-4b7d-4c1e-9a15-202611160045',
    'reason', 'other',
    'note', 'Kiểm kê bổ sung 16/11 theo tin nhắn của Hà: Matcha 150 g, Cacao 100 g, Thanh long hết',
    'lines', jsonb_build_array(
      jsonb_build_object('ingredient_id', (select id from public.ingredients where code = 'matcha'), 'qty_actual', 150),
      jsonb_build_object('ingredient_id', (select id from public.ingredients where code = 'cacao'), 'qty_actual', 100),
      jsonb_build_object('ingredient_id', (select id from public.ingredients where code = 'thanh_long'), 'qty_actual', 0))));
end $$;
