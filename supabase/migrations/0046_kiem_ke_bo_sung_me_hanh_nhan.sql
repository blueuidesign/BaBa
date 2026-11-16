-- 0046 · Kiểm kê bổ sung 16/11 ở Phan Văn Hớn (Tùng xác nhận 16/11 09:49):
-- Hà đếm sót nửa kg mè đen và nửa kg hạnh nhân, cộng vào số 15/11. Mè đen 1.000 → 1.500 g, hạnh nhân 350 → 850 g.
do $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', '2e8b7277-123f-4b66-8475-eb01a5266e0d', 'role', 'authenticated')::text, true);
  perform public.fn_post_count(jsonb_build_object(
    'outlet_id', '3e1f4df8-6dcb-4593-85a4-2bef47468f42',
    'client_id', 'a6f0c1e2-4b7d-4c1e-9a15-202611160046',
    'reason', 'other',
    'note', 'Kiểm kê bổ sung 16/11: Hà đếm sót nửa kg mè đen và nửa kg hạnh nhân, cộng vào số 15/11',
    'lines', jsonb_build_array(
      jsonb_build_object('ingredient_id', (select id from public.ingredients where code = 'me'), 'qty_actual', 1500),
      jsonb_build_object('ingredient_id', (select id from public.ingredients where code = 'hanh_nhan'), 'qty_actual', 850))));
end $$;
