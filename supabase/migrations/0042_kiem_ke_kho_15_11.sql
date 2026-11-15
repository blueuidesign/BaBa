-- 0042 · Kiểm kê kho nguyên liệu Phan Văn Hớn ngày 15/11/2026 (số Tùng gửi 15/11 21:41).
-- Đây là mốc bắt đầu lại việc tính kho: từ 16/11 mới tính lượng bị trừ theo công thức và đối chiếu với kiểm kê thực tế.
-- Dữ liệu kho trước mốc này vẫn giữ nhưng không dùng để đánh giá.
-- Ghi bằng fn_post_count dưới quyền admin: mỗi dòng lưu số sổ và số thực tế, chênh lệch thành stock_movements 'count_adjust'.
-- Quy đổi trái sang gam theo ingredients.piece_g (ước lượng từ 0031): bí đỏ 1.500 g/trái, bắp 200 g/trái, khoai lang 250 g/trái.
-- "Đường thốt nốt nước" ghi vào nguyên liệu "Đường thốt nốt" (app chưa tách dạng nước).
-- Chỉ ghi 9 món có trong danh sách; nguyên liệu và bao bì khác giữ nguyên số sổ.
do $$
declare v jsonb;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', '2e8b7277-123f-4b66-8475-eb01a5266e0d', 'role', 'authenticated')::text, true);
  v := public.fn_post_count(jsonb_build_object(
    'outlet_id', '3e1f4df8-6dcb-4593-85a4-2bef47468f42',
    'client_id', 'a6f0c1e2-4b7d-4c1e-9a15-202611150042',
    'reason', 'other',
    'note', 'Kiểm kê mốc 15/11/2026: bắt đầu tính lại kho từ đầu',
    'lines', (select jsonb_agg(jsonb_build_object('ingredient_id', i.id, 'qty_actual', x.qty))
                from (values ('me', 1000), ('dieu', 12000), ('dau_do', 1700), ('hanh_nhan', 350), ('oc_cho', 210),
                             ('bi_do', 3000), ('bap', 2000), ('khoai', 750), ('thot_not', 7800)) as x(code, qty)
                join public.ingredients i on i.code = x.code)));
  if (v->>'duplicate') is null and (v->>'lines')::int <> 9 then raise exception 'Kiểm kê ghi % dòng, cần 9', v->>'lines'; end if;
end $$;
-- Kiểm tra: tồn sau kiểm kê = mè 1000, điều 12000, đậu đỏ 1700, hạnh nhân 350, óc chó 210, bí đỏ 3000, bắp 2000, khoai 750, đường thốt nốt 7800 (gam).
