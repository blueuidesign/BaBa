-- 0047 · Kiểm kê bổ sung 16/11 ở Phan Văn Hớn (Tùng 16/11 09:53): muối hồng 1,5 kg = 1.500 g.
do $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', '2e8b7277-123f-4b66-8475-eb01a5266e0d', 'role', 'authenticated')::text, true);
  perform public.fn_post_count(jsonb_build_object(
    'outlet_id', '3e1f4df8-6dcb-4593-85a4-2bef47468f42',
    'client_id', 'a6f0c1e2-4b7d-4c1e-9a15-202611160047',
    'reason', 'other',
    'note', 'Kiểm kê bổ sung 16/11: muối hồng 1,5 kg',
    'lines', jsonb_build_array(
      jsonb_build_object('ingredient_id', (select id from public.ingredients where code = 'muoi_hong'), 'qty_actual', 1500))));
end $$;
