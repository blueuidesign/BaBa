-- 0049 · Đặt tồn chai 330 ml, nhãn, card về 0 ở Phan Văn Hớn (Tùng 16/11 10:02).
-- Ba món đang âm 8 vì sáng 16/11 ghi nấu 8 chai khi bao bì chưa được đếm. Ghi bằng kiểm kê nối thêm.
-- Chưa phải số đếm thật: chờ Hà gửi số chai và ly giấy.
do $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', '2e8b7277-123f-4b66-8475-eb01a5266e0d', 'role', 'authenticated')::text, true);
  perform public.fn_post_count(jsonb_build_object(
    'outlet_id', '3e1f4df8-6dcb-4593-85a4-2bef47468f42',
    'client_id', 'a6f0c1e2-4b7d-4c1e-9a15-202611160049',
    'reason', 'other',
    'note', 'Đặt chai, nhãn, card về 0 (đang âm 8 vì ghi nấu khi bao bì chưa đếm); chờ Hà gửi số đếm thật',
    'lines', jsonb_build_array(
      jsonb_build_object('ingredient_id', (select id from public.ingredients where code = 'chai_330'), 'qty_actual', 0),
      jsonb_build_object('ingredient_id', (select id from public.ingredients where code = 'nhan'), 'qty_actual', 0),
      jsonb_build_object('ingredient_id', (select id from public.ingredients where code = 'card'), 'qty_actual', 0))));
end $$;
