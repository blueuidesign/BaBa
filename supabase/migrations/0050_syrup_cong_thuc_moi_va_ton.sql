-- 0050 · Syrup ngọt lành: công thức mới và tồn (Tùng chuyển tin của Hà 16/11 10:14).
-- 1) Công thức mẻ syrup bản 2 (từ 16/11): 800 g đường thốt nốt + 5 g hoa nhài + 700 ml nước → 1.250 ml. Bỏ đường phèn.
--    Bản 1 chuyển trạng thái retired (không xóa).
-- 2) "Đường thốt nốt nước" Hà đếm 15/11 chính là syrup: chuyển 7,8 kg sang Syrup ngọt lành = 6.500 ml
--    (khối lượng riêng khoảng 1,2 g/ml, suy từ công thức: 1.505 g ra 1.250 ml). Nguyên liệu "Đường thốt nốt nước" về 0 và ngừng dùng.
do $$
declare v_old batch_recipes; v_new uuid;
begin
  select * into v_old from public.batch_recipes where code = 'syrup' and version = 1;
  if not exists (select 1 from public.batch_recipes where code = 'syrup' and version = 2) then
    update public.batch_recipes set status = 'retired' where id = v_old.id;
    insert into public.batch_recipes (org_id, code, name, output_ingredient_id, output_qty, note, version, valid_from, status)
    values (v_old.org_id, 'syrup', v_old.name, v_old.output_ingredient_id, 1250,
            'Hoa nhài cho vào sau khi tắt bếp để giữ hương. Nước 700 ml.', 2, '2026-11-16', 'approved')
    returning id into v_new;
    insert into public.batch_recipe_items (batch_recipe_id, ingredient_id, qty) values
      (v_new, (select id from public.ingredients where code = 'thot_not'), 800),
      (v_new, (select id from public.ingredients where code = 'nhai'), 5);
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', '2e8b7277-123f-4b66-8475-eb01a5266e0d', 'role', 'authenticated')::text, true);
  perform public.fn_post_count(jsonb_build_object(
    'outlet_id', '3e1f4df8-6dcb-4593-85a4-2bef47468f42',
    'client_id', 'a6f0c1e2-4b7d-4c1e-9a15-202611160050',
    'reason', 'other',
    'note', '"Đường thốt nốt nước" chính là Syrup ngọt lành: chuyển 7,8 kg sang syrup = 6.500 ml (1,2 g/ml theo công thức)',
    'lines', jsonb_build_array(
      jsonb_build_object('ingredient_id', (select id from public.ingredients where code = 'syrup'), 'qty_actual', 6500),
      jsonb_build_object('ingredient_id', (select id from public.ingredients where code = 'thot_not_nuoc'), 'qty_actual', 0))));
  update public.ingredients set status = 'retired' where code = 'thot_not_nuoc';
end $$;
