-- 0048 · Bắp: mỗi trái cho khoảng 110 g hạt, không phải 200 g (Tùng 16/11 09:54, đồng ý sửa 09:58).
-- Đổi mức quy đổi piece_g của bắp thành 110 và ghi lại tồn bằng kiểm kê nối thêm:
-- 10 trái đếm 15/11 × 110 g = 1.100 g (trước ghi 2.000 g).
-- Giá chuẩn để tính giá vốn: 30 đ/g hạt (20.000 đ mua 6–8 trái); chưa có bảng giá trong DB, mới ghi ở tài liệu.
do $$
begin
  update public.ingredients set piece_g = 110 where code = 'bap';
  perform set_config('request.jwt.claims', json_build_object('sub', '2e8b7277-123f-4b66-8475-eb01a5266e0d', 'role', 'authenticated')::text, true);
  perform public.fn_post_count(jsonb_build_object(
    'outlet_id', '3e1f4df8-6dcb-4593-85a4-2bef47468f42',
    'client_id', 'a6f0c1e2-4b7d-4c1e-9a15-202611160048',
    'reason', 'other',
    'note', 'Sửa quy đổi bắp: 10 trái đếm 15/11 × 110 g hạt mỗi trái = 1.100 g (trước quy 200 g mỗi trái)',
    'lines', jsonb_build_array(
      jsonb_build_object('ingredient_id', (select id from public.ingredients where code = 'bap'), 'qty_actual', 1100))));
end $$;
