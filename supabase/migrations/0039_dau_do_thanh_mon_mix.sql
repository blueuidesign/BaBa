-- 0039 · Món "Đậu Đỏ" (0037) đổi thành món mix "Đậu đỏ, óc chó, điều", giá 30.000 đ (Tùng 15/11 07:37). Công thức bổ sung sau.
-- Dùng fn_admin_save_product dưới quyền admin: giá cũ 25.000 đ đóng lại, giá mới có hiệu lực từ hôm nay; đơn cũ giữ giá lúc bán.
do $$
declare v_id uuid;
begin
  select id into v_id from public.products where code = 'dd';
  if v_id is null then raise exception 'Chưa có món dd (0037 chưa chạy)'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', '2e8b7277-123f-4b66-8475-eb01a5266e0d', 'role', 'authenticated')::text, true);
  perform public.fn_admin_save_product(jsonb_build_object('id', v_id, 'name', 'Đậu đỏ, óc chó, điều', 'short_name', 'Đậu đỏ mix',
                                                         'line', 'xanh', 'status', 'active', 'price_vnd', 30000));
end $$;
-- Kiểm tra: select name, short_name, public.current_price('<outlet>', id, current_date) from products where code = 'dd';  → 30000
